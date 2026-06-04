import { requireOnlyMe } from "./auth/only-me-guard.js";
import {
  bestBoardAttempt,
  boardFromFen,
  boardRowsFromGame,
  colorToMoveText,
  createChessGame,
  moveTextMatches,
  renderBoardSquares,
  splitMoveParts
} from "./board-tools.js";
import { bindImportButton, initPageChrome } from "./ui-shell.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/app.js.");
}

const SELECTED_NODE_STORAGE_KEY = "gm_opening_tree_selected_node_v1";

let nodes = [];
let repairs = [];
let selectedId = loadSelectedNodeId();
let selectedRepairId = null;
let trainerPrompt = null;
let trainerResult = null;
let trainerRevealOpen = false;

const $ = id => document.getElementById(id);

const highlightLabels = {
  blunder: "Blunder",
  great: "Great move",
  brilliant: "Brilliant"
};

function loadSelectedNodeId() {
  return localStorage.getItem(SELECTED_NODE_STORAGE_KEY) || null;
}

function saveSelectedNodeId(id) {
  if (id) localStorage.setItem(SELECTED_NODE_STORAGE_KEY, id);
  else localStorage.removeItem(SELECTED_NODE_STORAGE_KEY);
}

function setSelectedNodeId(id) {
  selectedId = id || null;
  saveSelectedNodeId(selectedId);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setHtml(id, value) {
  const element = $(id);
  if (element) element.innerHTML = value;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>'"]/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]
  ));
}

function highlightLabel(kind) {
  return highlightLabels[kind] || "";
}

function highlightBadgeHtml(kind) {
  const label = highlightLabel(kind);
  return label ? `<span class="mark-badge mark-${kind}">${label}</span>` : "";
}

function preferredBadgeHtml(isPreferred) {
  return isPreferred ? `<span class="mark-badge mark-preferred">Preferred</span>` : "";
}

function tagListHtml(tags = []) {
  return tags.length
    ? `<span class="node-tags">${tags.slice(0, 4).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</span>`
    : "";
}

function nodeById(id) {
  return nodes.find(node => node.id === id) || null;
}

function repairById(id) {
  return repairs.find(repair => repair.id === id) || null;
}

function currentNode() {
  return selectedId ? nodeById(selectedId) : null;
}

function children(parentId) {
  return nodes.filter(node => node.parent_id === parentId);
}

function childCount(nodeId) {
  return children(nodeId).length;
}

function pathNodesFor(node) {
  const path = [];
  let current = node;

  while (current) {
    path.unshift(current);
    current = nodeById(current.parent_id);
  }

  return path;
}

function pathFor(node) {
  return pathNodesFor(node).map(entry => entry.move).join("  ");
}

function openRepairsForNode(nodeId) {
  return repairs.filter(repair => repair.related_node_id === nodeId && repair.status === "needs_work");
}

function isTrainingExcluded(node) {
  return node?.exclude_from_training === true;
}

function isTrainingEnabled(node) {
  return !isTrainingExcluded(node);
}

function rootTurnForMove(moveText) {
  return /\.\.\./.test(String(moveText || "")) ? "b" : "w";
}

function trainingGroupKeyForNode(node) {
  if (!node) return "__root_white__";
  return node.parent_id || (rootTurnForMove(node.move) === "b" ? "__root_black__" : "__root_white__");
}

function describeMoveType(node) {
  if (!node) {
    return {
      label: "Start position",
      caption: "Select a move to inspect repertoire type, tags, and training status."
    };
  }

  if (node.exclude_from_training) {
    return {
      label: "Excluded from training",
      caption: node.tags?.length ? node.tags.slice(0, 3).join(" • ") : "This move stays in the tree but is skipped by training mode."
    };
  }

  const secondary = [];

  if (node.is_preferred) secondary.push("Preferred repertoire move");
  if (node.highlight_kind) secondary.push(highlightLabel(node.highlight_kind));
  if (node.tags?.length) secondary.push(node.tags.slice(0, 3).join(" • "));

  return {
    label: node.is_preferred
      ? "Preferred repertoire move"
      : (highlightLabel(node.highlight_kind || "") || "Standard tree move"),
    caption: secondary.filter(Boolean).join(" • ") || (node.title || "This move is active in the study tree.")
  };
}

function lineChipHtml(node, { clickable = false, activeId = selectedId } = {}) {
  const activeClass = node.id === activeId ? "active" : "";
  const body = `
    <span>${escapeHtml(node.move)}</span>
    ${preferredBadgeHtml(node.is_preferred)}
    ${highlightBadgeHtml(node.highlight_kind || "")}
  `;

  if (clickable) {
    return `<button class="line-chip ${activeClass}" data-id="${node.id}" title="Jump to this move">${body}</button>`;
  }

  return `<span class="line-chip ${activeClass}">${body}</span>`;
}

function renderLineChips(path, options = {}) {
  const { clickable = false, emptyText = "No move selected yet." } = options;
  if (!path.length) return `<div class="line-empty">${escapeHtml(emptyText)}</div>`;
  return path.map(node => lineChipHtml(node, { clickable })).join("");
}

function selectNode(id, shouldPaint = true) {
  setSelectedNodeId(id);
  selectedRepairId = null;
  populateEditor(nodeById(id));
  if (shouldPaint) paint();
}

function renderStats() {
  const trainerPositions = buildTrainingPositions().length;
  const eligibleCards = nodes.filter(isTrainingEnabled).length;
  const openRepairs = repairs.filter(repair => repair.status === "needs_work").length;
  const rootLines = nodes.filter(node => !node.parent_id).length;

  setText("nodeCount", String(nodes.length));
  setText("lineCount", String(rootLines));
  setText("trainerCount", String(trainerPositions));
  setText("repairCount", String(openRepairs));

  setText("dashboardRandomCount", `${eligibleCards} ready`);
  setText("dashboardEditorCount", `${nodes.length} moves`);
  setText("dashboardTrainerCount", `${trainerPositions} prompts`);
  setText("dashboardRepairCount", `${openRepairs} open`);
  setText("repairOpenCount", `${openRepairs} open`);
}

function renderDashboardFocus() {
  const titleEl = $("dashboardFocusTitle");
  if (!titleEl) return;

  const node = currentNode();
  const path = node ? pathNodesFor(node) : [];

  if (!node) {
    titleEl.textContent = "No move selected yet";
    setText("dashboardFocusSubtitle", "Open the move editor, pick a line, and the selected focus will travel with you across pages.");
    setHtml("dashboardCurrentLine", `<div class="line-empty">Selection is empty. The workspace is ready whenever you want to anchor it to a line.</div>`);
    return;
  }

  titleEl.textContent = node.title || `Focused on ${node.move}`;
  setText("dashboardFocusSubtitle", `Current selection: ${node.move}. Training and repair pages can use this focus immediately.`);
  setHtml("dashboardCurrentLine", renderLineChips(path, {
    emptyText: "Selection is empty."
  }));
}

function renderLiveBoard() {
  const liveBoardEl = $("liveBoard");
  if (!liveBoardEl) return;

  const current = currentNode();
  const path = current ? pathNodesFor(current) : [];
  const attempt = bestBoardAttempt(path);
  const game = attempt?.game || createChessGame("w");
  const boardReady = Boolean(game);
  const rows = game ? boardRowsFromGame(game) : boardFromFen();
  const historyLength = attempt?.history.length || 0;
  const moveValue = current ? current.move : "Root view";
  const titleValue = current ? `Position after ${current.move}` : "Root position";
  const turnValue = boardReady ? colorToMoveText(game.turn()) : "Board waiting for chess.js";
  const moveType = describeMoveType(current);

  let subtitleValue = "The live board follows the move you select in Line Explorer.";
  if (!boardReady) {
    subtitleValue = "The board frame is ready, but the chess parser did not load in this browser session.";
  } else if (current?.title) {
    subtitleValue = current.title;
  } else if (attempt?.failedMove) {
    subtitleValue = `The board synced until ${attempt.failedMove}, then stopped because that move could not be read as SAN.`;
  } else if (path.length) {
    subtitleValue = `Synced to the current line after ${historyLength} half-move${historyLength === 1 ? "" : "s"}.`;
  }

  let statusValue = "Starting position.";
  if (!boardReady) {
    statusValue = "Showing the starting board until chess.js becomes available.";
  } else if (attempt?.failedMove) {
    statusValue = `Stopped before ${attempt.failedMove}.`;
  } else if (historyLength) {
    if (typeof game?.in_checkmate === "function" && game.in_checkmate()) {
      statusValue = "Checkmate on the board.";
    } else if (typeof game?.in_draw === "function" && game.in_draw()) {
      statusValue = "Drawn position.";
    } else if (typeof game?.in_check === "function" && game.in_check()) {
      statusValue = `${game.turn() === "w" ? "White" : "Black"} is in check.`;
    } else {
      statusValue = `Line depth: ${historyLength} half-move${historyLength === 1 ? "" : "s"}.`;
    }
  }

  setText("liveBoardTitle", titleValue);
  setText("liveBoardSubtitle", subtitleValue);
  setText("liveBoardMeta", boardReady && historyLength ? `${turnValue} / ${historyLength} ply` : turnValue);
  setText("liveMoveValue", moveValue);
  setText("liveMoveCaption", current ? (current.title || pathFor(current)) : "Choose a move in the explorer to jump the position here.");
  setText("liveMoveTypeValue", moveType.label);
  setText("liveMoveTypeCaption", moveType.caption);
  setText("liveTurnValue", turnValue);
  setText("liveStatusValue", statusValue);
  setText("liveExplanationTitle", current?.title || "Study note");
  setText(
    "liveExplanationText",
    current?.explanation || current?.title || "Select a move to surface its plans, tactical ideas, and move-order explanation."
  );
  setHtml("liveBoardLine", renderLineChips(path, {
    emptyText: "No move selected yet. The board is ready at the start position."
  }));
  liveBoardEl.innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);
}

function renderChoices() {
  const current = currentNode();
  const choices = children(selectedId || null);
  const heading = current ? "Next moves from this position" : "Root moves";

  const rows = choices.map((node, index) => {
    const highlight = node.highlight_kind || "";
    const highlightClass = highlight ? ` highlight-${highlight}` : "";
    const preferredClass = node.is_preferred ? " is-preferred" : "";
    const altClass = index % 2 === 0 ? "choice-a" : "choice-b";

    return `
      <button class="choice-card ${altClass}${highlightClass}${preferredClass}" data-id="${node.id}">
        <span class="choice-index">${index + 1}</span>
        <span class="choice-main">
          <span class="choice-topline">
            <strong class="move-san">${escapeHtml(node.move)}</strong>
            ${childCount(node.id) ? `<span class="child-count">${childCount(node.id)}</span>` : ""}
            ${preferredBadgeHtml(node.is_preferred)}
            ${highlightBadgeHtml(highlight)}
          </span>
          <span class="node-title">${escapeHtml(node.title || "No title yet")}</span>
          ${tagListHtml(node.tags || [])}
        </span>
      </button>`;
  }).join("");

  return `
    <section class="line-view">
      <div class="line-block">
        <div class="line-label">Current line</div>
        <div class="line-strip">${renderLineChips(current ? pathNodesFor(current) : [], {
          clickable: true,
          emptyText: "Choose a root move to start exploring your repertoire."
        })}</div>
      </div>

      <div class="line-tools">
        <button id="backLineBtn" class="button button-secondary button-tiny" ${current ? "" : "disabled"}>Back one move</button>
        <button id="rootLineBtn" class="button button-secondary button-tiny" ${current ? "" : "disabled"}>Root view</button>
      </div>

      <div class="choice-heading">
        <h4>${heading}</h4>
        <span>${choices.length} option${choices.length === 1 ? "" : "s"}</span>
      </div>

      <div class="choice-list">
        ${rows || `<p class="muted">No child moves here yet. Add one from the editor or create a new root line.</p>`}
      </div>
    </section>`;
}

function populateEditor(node, { newRoot = false } = {}) {
  const moveInput = $("moveInput");
  if (!moveInput) return;

  setText("editorTitle", node ? `Editing ${node.move}` : (newRoot ? "New root move" : "Select a move"));

  const deleteBtn = $("deleteBtn");
  const addChildBtn = $("addChildBtn");

  if (deleteBtn) deleteBtn.disabled = !node;
  if (addChildBtn) addChildBtn.disabled = !node;

  moveInput.value = node?.move || "";
  $("titleInput").value = node?.title || "";
  $("highlightInput").value = node?.highlight_kind || "";
  $("explanationInput").value = node?.explanation || "";
  $("tagsInput").value = (node?.tags || []).join(", ");
  $("excludeTrainingInput").checked = node?.exclude_from_training === true;
  $("preferredInput").checked = node?.is_preferred === true;

  const nodeRepairs = node ? openRepairsForNode(node.id).length : 0;

  setText(
    "editorContext",
    node
      ? `${nodeRepairs} open repair item${nodeRepairs === 1 ? "" : "s"} linked here. Preferred moves define accepted trainer answers, while do-not-train keeps side lines out of prompts.`
      : "Create a root move or select an existing move to edit its title, tags, preferred status, and trainer settings."
  );
}

function resetEditorForNewRoot() {
  setSelectedNodeId(null);
  selectedRepairId = null;
  populateEditor(null, { newRoot: true });
  paint();
}

function getFormNode(parentId = null, existingId = null) {
  const excludeFromTraining = $("excludeTrainingInput").checked;

  return {
    id: existingId || crypto.randomUUID(),
    parent_id: parentId,
    move: $("moveInput").value.trim() || "New move",
    title: $("titleInput").value.trim(),
    highlight_kind: $("highlightInput").value,
    explanation: $("explanationInput").value.trim(),
    tags: $("tagsInput").value.split(",").map(tag => tag.trim()).filter(Boolean),
    exclude_from_training: excludeFromTraining,
    is_practice_card: !excludeFromTraining,
    is_preferred: $("preferredInput").checked,
    created_at: nodes.find(node => node.id === existingId)?.created_at || new Date().toISOString()
  };
}

function addMilliseconds(dateText, amount) {
  const base = Date.parse(dateText || "");
  const date = Number.isFinite(base) ? new Date(base + amount) : new Date(Date.now() + amount);
  return date.toISOString();
}

function migrateSplitCompoundMoves(sourceNodes) {
  const cleanNodes = sourceNodes.map(OpeningDB.normalizeNode);
  const migrated = [];
  let splitNodeCount = 0;
  let addedNodeCount = 0;

  const childrenOf = parentId => cleanNodes.filter(node => node.parent_id === parentId);

  function cloneForPart(original, part, id, parentId, partIndex, isLastPart) {
    return {
      ...original,
      id,
      parent_id: parentId,
      move: part,
      title: isLastPart ? original.title || "" : "",
      explanation: isLastPart ? original.explanation || "" : "",
      highlight_kind: isLastPart ? original.highlight_kind || "" : "",
      tags: isLastPart ? [...(original.tags || [])] : [],
      exclude_from_training: isLastPart ? original.exclude_from_training === true : false,
      is_practice_card: isLastPart ? original.exclude_from_training !== true : true,
      is_preferred: isLastPart ? original.is_preferred === true : false,
      created_at: addMilliseconds(original.created_at, partIndex)
    };
  }

  function visit(node, newParentId) {
    const parts = splitMoveParts(node.move);
    let currentParentId = newParentId;
    let lastId = node.id;

    if (parts.length > 1) {
      splitNodeCount += 1;
      addedNodeCount += parts.length - 1;
    }

    parts.forEach((part, partIndex) => {
      const id = partIndex === 0 ? node.id : crypto.randomUUID();
      const isLastPart = partIndex === parts.length - 1;
      const newNode = cloneForPart(node, part, id, currentParentId, partIndex, isLastPart);
      migrated.push(newNode);
      currentParentId = id;
      lastId = id;
    });

    childrenOf(node.id).forEach(child => visit(child, lastId));
  }

  childrenOf(null).forEach(root => visit(root, null));

  return { migrated, splitNodeCount, addedNodeCount };
}

async function splitCompoundMovesOnce() {
  const answer = confirm(
    "This will split moves like '1... e5 2.Nf3' into separate child moves.\n\nExport a JSON backup first if you want an easy rollback. Continue now?"
  );

  if (!answer) return;

  const currentNodes = await OpeningDB.loadNodes();
  const { migrated, splitNodeCount, addedNodeCount } = migrateSplitCompoundMoves(currentNodes);

  if (!splitNodeCount) {
    alert("No compound moves were found. Nothing changed.");
    return;
  }

  await OpeningDB.saveAllNodes(migrated);
  setSelectedNodeId(null);
  await refresh();

  alert(`Done. Split ${splitNodeCount} move cell(s) and created ${addedNodeCount} extra child node(s).`);
}

function buildTrainingPositions() {
  const grouped = new Map();

  for (const node of nodes.filter(isTrainingEnabled)) {
    const key = trainingGroupKeyForNode(node);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(node);
  }

  return [...grouped.entries()].map(([groupKey, group]) => {
    const parentId = group[0]?.parent_id || null;
    const acceptedNodes = group.some(node => node.is_preferred)
      ? group.filter(node => node.is_preferred)
      : group;
    const positionNode = parentId ? nodeById(parentId) : null;
    const positionNodes = positionNode ? pathNodesFor(positionNode) : [];
    const startingTurn = parentId ? "w" : rootTurnForMove(group[0]?.move || "");
    const allChildren = parentId
      ? children(parentId)
      : nodes.filter(node => !node.parent_id && rootTurnForMove(node.move) === startingTurn);
    const pendingRepairs = repairs.filter(repair =>
      repair.status === "needs_work" &&
      acceptedNodes.some(node => node.id === repair.related_node_id)
    );

    return {
      groupKey,
      parentId,
      startingTurn,
      acceptedNodes,
      eligibleChildren: group,
      allChildren,
      positionNodes,
      pendingRepairs
    };
  });
}

function findTrainingPosition(groupKey, groups = buildTrainingPositions()) {
  return groups.find(group => group.groupKey === groupKey) || null;
}

function focusTrainingGroupKeyFromSelection(groups = buildTrainingPositions()) {
  const current = currentNode();
  if (!current) return undefined;

  if (findTrainingPosition(current.id, groups)) return current.id;

  const currentGroupKey = trainingGroupKeyForNode(current);
  if (findTrainingPosition(currentGroupKey, groups)) return currentGroupKey;

  return undefined;
}

function pickWeightedPrompt(pool) {
  if (!pool.length) return null;

  const weighted = pool.map(group => {
    const preferredWeight = group.acceptedNodes.some(node => node.is_preferred) ? 3 : 1;
    const repairWeight = group.pendingRepairs.length * 4;
    const clarityWeight = group.acceptedNodes.length === 1 ? 2 : 1;
    return { group, weight: 1 + preferredWeight + repairWeight + clarityWeight };
  });

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.group;
  }

  return weighted[weighted.length - 1].group;
}

function setTrainerPrompt(group) {
  trainerPrompt = group;
  trainerResult = null;
  trainerRevealOpen = false;
  const input = $("trainerAnswerInput");
  if (input) input.value = "";
}

function queueTrainerPrompt({ focusSelection = false } = {}) {
  const groups = buildTrainingPositions();
  if (!groups.length) {
    setTrainerPrompt(null);
    paint();
    return;
  }

  let pool = groups;
  if (focusSelection) {
    const focusGroupKey = focusTrainingGroupKeyFromSelection(groups);
    if (focusGroupKey !== undefined && findTrainingPosition(focusGroupKey, groups)) {
      pool = groups.filter(group => group.groupKey === focusGroupKey);
    }
  }

  setTrainerPrompt(pickWeightedPrompt(pool));
  paint();
}

function synchronizeTrainerPrompt() {
  const groups = buildTrainingPositions();

  if (!groups.length) {
    trainerPrompt = null;
    trainerResult = null;
    trainerRevealOpen = false;
    return;
  }

  if (!trainerPrompt) {
    trainerPrompt = pickWeightedPrompt(groups);
    return;
  }

  trainerPrompt = findTrainingPosition(trainerPrompt.groupKey, groups) || pickWeightedPrompt(groups);
}

function trainerAcceptedMovesText(prompt) {
  return prompt.acceptedNodes.map(node => node.move).join(", ");
}

function trainerAnswerTitle(prompt) {
  if (!prompt) return "Waiting for a prompt";
  return prompt.positionNodes.length
    ? `Position after ${prompt.positionNodes[prompt.positionNodes.length - 1].move}`
    : "Starting position";
}

function renderTrainerFeedback(prompt) {
  if (!prompt) {
    return `<div class="feedback-box feedback-neutral">Mark a few moves for training and the prompt queue will appear here.</div>`;
  }

  if (!trainerResult) {
    return `<div class="feedback-box feedback-neutral">What is the next move? Type SAN like <code>Bc4</code>, <code>Nf3</code>, or <code>...Bb6</code>.</div>`;
  }

  const acceptedMoves = trainerAcceptedMovesText(prompt);

  if (trainerResult.kind === "correct") {
    const extra = prompt.acceptedNodes.length > 1
      ? ` ${escapeHtml(trainerResult.node.move)} is one of your accepted repertoire choices here.`
      : "";
    return `<div class="feedback-box feedback-correct">&#10003; Correct.${extra}</div>`;
  }

  if (trainerResult.kind === "excluded-branch") {
    return `
      <div class="feedback-box feedback-incorrect">
        &#10007; ${escapeHtml(trainerResult.node.move)} exists in your tree, but it is marked <strong>do not use for training</strong>. The prompt expected <strong>${escapeHtml(acceptedMoves)}</strong>.
      </div>`;
  }

  if (trainerResult.kind === "tree-branch") {
    const preferredLanguage = prompt.acceptedNodes.some(node => node.is_preferred)
      ? "but your preferred repertoire move here is"
      : "but this prompt was training";

    return `
      <div class="feedback-box feedback-incorrect">
        &#10007; ${escapeHtml(trainerResult.node.move)} exists in your tree, ${preferredLanguage} <strong>${escapeHtml(acceptedMoves)}</strong>.
      </div>`;
  }

  return `
    <div class="feedback-box feedback-incorrect">
      &#10007; Incorrect. The trainer expected <strong>${escapeHtml(acceptedMoves)}</strong>.
    </div>`;
}

function renderTrainerReveal(prompt) {
  if (!prompt || !trainerRevealOpen) return "";

  const answerCards = prompt.acceptedNodes.map(node => `
    <article class="answer-card">
      <div class="answer-card-top">
        <strong>${escapeHtml(node.move)}</strong>
        ${preferredBadgeHtml(node.is_preferred)}
        ${highlightBadgeHtml(node.highlight_kind || "")}
      </div>
      <p class="answer-card-title">${escapeHtml(node.title || "Repertoire move")}</p>
      <p>${escapeHtml(node.explanation || "No explanation yet. Add one in the editor so future-you gets the lesson immediately.")}</p>
    </article>
  `).join("");

  const repairCards = prompt.pendingRepairs.length
    ? `
      <div class="repair-hint-stack">
        <div class="line-label">Open repair notes</div>
        ${prompt.pendingRepairs.map(repair => `
          <article class="repair-hint-card">
            <strong>${escapeHtml(repair.mistake || "Study repair")}</strong>
            <p><span>Lesson.</span> ${escapeHtml(repair.lesson || "No lesson captured yet.")}</p>
            <p><span>Repair.</span> ${escapeHtml(repair.repair || "No repair action captured yet.")}</p>
          </article>
        `).join("")}
      </div>`
    : "";

  return `
    <div class="answer-key">
      <div class="answer-key-row">
        <span>Accepted move${prompt.acceptedNodes.length === 1 ? "" : "s"}</span>
        <strong>${escapeHtml(trainerAcceptedMovesText(prompt))}</strong>
      </div>
      <div class="answer-card-grid">${answerCards}</div>
      ${repairCards}
    </div>`;
}

function paintTrainer() {
  const trainerBoardEl = $("trainerBoard");
  if (!trainerBoardEl) return;

  const groups = buildTrainingPositions();
  const focusPromptAvailable = findTrainingPosition(focusTrainingGroupKeyFromSelection(groups), groups);
  const selectedPromptBtn = $("selectedPromptBtn");
  const revealPromptBtn = $("revealPromptBtn");
  const trainerSubmitBtn = $("trainerSubmitBtn");
  const trainerAnswerInput = $("trainerAnswerInput");

  if (selectedPromptBtn) selectedPromptBtn.disabled = !focusPromptAvailable;
  if (revealPromptBtn) revealPromptBtn.disabled = !trainerPrompt;
  if (trainerSubmitBtn) trainerSubmitBtn.disabled = !trainerPrompt;
  if (trainerAnswerInput) trainerAnswerInput.disabled = !trainerPrompt;

  setText("trainerQueueCount", `${groups.length} training position${groups.length === 1 ? "" : "s"} ready`);

  const current = currentNode();
  if ($("trainerSelectionStatus")) {
    if (!current) {
      setText("trainerSelectionStatus", "Prompts can come from anywhere in the tree, or focus on the line you selected in the move editor.");
    } else if (focusPromptAvailable) {
      setText("trainerSelectionStatus", `Selected focus: ${pathFor(current)}. Use "Train selected" to stay inside this branch.`);
    } else {
      setText("trainerSelectionStatus", `Selected focus: ${pathFor(current)}. This exact node is not a training prompt yet, so random prompts will use the full queue.`);
    }
  }

  if (!groups.length) {
    setText("trainerPositionTitle", "Trainer waiting");
    setText("trainerTurnPill", "No prompts");
    setHtml("trainerPositionLine", `<div class="line-empty">Create moves and leave them available for training to start drilling.</div>`);
    setText("trainerAcceptedMeta", "Add trainer moves in the editor");
    setText("trainerHint", 'Moves marked "Do not use for training" are skipped here.');
    setHtml("trainerFeedback", renderTrainerFeedback(null));
    setHtml("trainerReveal", "");
    trainerBoardEl.innerHTML = renderBoardSquares(boardFromFen(), null);
    if (revealPromptBtn) revealPromptBtn.textContent = "Reveal answer";
    return;
  }

  synchronizeTrainerPrompt();

  const prompt = trainerPrompt;
  const attempt = prompt.positionNodes.length ? bestBoardAttempt(prompt.positionNodes) : null;
  const game = attempt?.game || createChessGame(prompt.startingTurn || "w");
  const boardReady = Boolean(game);
  const rows = game ? boardRowsFromGame(game) : boardFromFen();

  setText("trainerPositionTitle", trainerAnswerTitle(prompt));
  setText("trainerTurnPill", boardReady ? colorToMoveText(game.turn()) : "Board waiting for chess.js");
  setHtml("trainerPositionLine", renderLineChips(prompt.positionNodes, {
    emptyText: "The prompt starts from the initial position."
  }));
  setText(
    "trainerAcceptedMeta",
    prompt.acceptedNodes.length === 1
      ? "One repertoire move expected"
      : `${prompt.acceptedNodes.length} repertoire moves accepted`
  );
  setText(
    "trainerHint",
    prompt.pendingRepairs.length
      ? `Repair cue: ${prompt.pendingRepairs[0].lesson || prompt.pendingRepairs[0].mistake || prompt.pendingRepairs[0].repair}`
      : "Preferred moves are accepted answers when the position branches."
  );
  setHtml("trainerFeedback", renderTrainerFeedback(prompt));
  setHtml("trainerReveal", renderTrainerReveal(prompt));
  trainerBoardEl.innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);

  if (revealPromptBtn) {
    revealPromptBtn.textContent = trainerRevealOpen ? "Hide answer" : "Reveal answer";
  }
}

function repairLinkedSummary(repair) {
  if (repair.related_node_id && nodeById(repair.related_node_id)) {
    return pathFor(nodeById(repair.related_node_id));
  }

  if (repair.position_path) return repair.position_path;
  return "Unlinked repair note";
}

function setRepairLink(nodeId, fallbackPath = "") {
  const node = nodeId ? nodeById(nodeId) : null;
  const resolvedPath = node ? pathFor(node) : fallbackPath;

  if ($("repairNodeIdInput")) $("repairNodeIdInput").value = node?.id || "";
  if ($("repairPathInput")) $("repairPathInput").value = resolvedPath;

  setText(
    "repairLinkMeta",
    node
      ? `Linked to ${resolvedPath}`
      : (resolvedPath ? `Pinned to ${resolvedPath}` : "Not linked to a move yet.")
  );
}

function resetRepairForm({ keepSelectionLink = true } = {}) {
  const repairForm = $("repairForm");
  if (!repairForm) return;

  selectedRepairId = null;
  repairForm.reset();
  $("repairStatusInput").value = "needs_work";
  setText("repairEditorState", "Capture the mistake, the lesson, and the repair plan.");

  if (keepSelectionLink && currentNode()) {
    setRepairLink(currentNode().id, pathFor(currentNode()));
  } else {
    setRepairLink(null, "");
  }
}

function fillRepairForm(repair) {
  if (!$("repairForm")) return;

  selectedRepairId = repair.id;
  $("repairIdInput").value = repair.id;
  $("repairMistakeInput").value = repair.mistake || "";
  $("repairLessonInput").value = repair.lesson || "";
  $("repairActionInput").value = repair.repair || "";
  $("repairStatusInput").value = repair.status || "needs_work";

  if (repair.related_node_id) {
    setSelectedNodeId(repair.related_node_id);
  }

  setRepairLink(repair.related_node_id, repair.position_path || "");
  setText("repairEditorState", "Editing an existing repair loop.");
}

function repairStatusHtml(status) {
  const label = status === "solved" ? "Solved" : "Needs work";
  const className = status === "solved" ? "status-solved" : "status-open";
  return `<span class="repair-status ${className}">${label}</span>`;
}

function repairFocusNode() {
  const activeRepair = selectedRepairId ? repairById(selectedRepairId) : null;
  if (activeRepair?.related_node_id) return nodeById(activeRepair.related_node_id);
  return currentNode();
}

function renderRepairFocus() {
  const repairBoardEl = $("repairBoard");
  if (!repairBoardEl) return;

  const activeRepair = selectedRepairId ? repairById(selectedRepairId) : null;
  const node = repairFocusNode();
  const path = node ? pathNodesFor(node) : [];
  const fallbackPath = activeRepair?.position_path || "";
  const attempt = bestBoardAttempt(path);
  const game = attempt?.game || createChessGame("w");
  const boardReady = Boolean(game);
  const rows = game ? boardRowsFromGame(game) : boardFromFen();
  const historyLength = attempt?.history.length || 0;
  const turnValue = boardReady ? colorToMoveText(game.turn()) : "Board waiting for chess.js";

  let subtitle = "Select a move in the editor or jump here from an existing repair item to anchor the lesson to a position.";
  if (activeRepair) {
    subtitle = activeRepair.mistake || activeRepair.lesson || activeRepair.repair || subtitle;
  } else if (node?.title) {
    subtitle = node.title;
  }

  let statusValue = "Starting position.";
  if (!boardReady) {
    statusValue = "Showing the starting board until chess.js becomes available.";
  } else if (attempt?.failedMove) {
    statusValue = `Stopped before ${attempt.failedMove}.`;
  } else if (historyLength) {
    statusValue = `Line depth: ${historyLength} half-move${historyLength === 1 ? "" : "s"}.`;
  }

  setText("repairFocusTitle", node ? `Repair focus after ${node.move}` : (fallbackPath ? `Repair focus for ${fallbackPath}` : "Repair focus board"));
  setText("repairFocusSubtitle", subtitle);
  setText("repairFocusMove", node?.move || (fallbackPath ? "Pinned note" : "Root view"));
  setText(
    "repairFocusMoveCaption",
    node
      ? (node.title || pathFor(node))
      : (fallbackPath || "Attach the selected move to tie the repair to a concrete spot in your tree.")
  );
  setText("repairBoardMeta", turnValue);
  setText("repairFocusStatus", statusValue);
  setText("repairFocusLessonTitle", activeRepair ? "Active repair" : "Selected move note");
  setText(
    "repairFocusLesson",
    activeRepair
      ? `${activeRepair.lesson || activeRepair.mistake || activeRepair.repair || "No repair text yet."}`
      : (node?.explanation || node?.title || "The active repair or selected move explanation will appear here.")
  );
  setHtml(
    "repairFocusLine",
    path.length
      ? renderLineChips(path, {
          emptyText: "No linked move yet. Attach a selected move or jump from a repair item below."
        })
      : `<div class="line-empty">${escapeHtml(fallbackPath || "No linked move yet. Attach a selected move or jump from a repair item below.")}</div>`
  );
  repairBoardEl.innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);
}

function renderRepairList() {
  const repairListEl = $("repairList");
  if (!repairListEl) return;

  const filterValue = $("repairFilterInput")?.value || "all";
  const filtered = repairs
    .filter(repair => filterValue === "all" || repair.status === filterValue)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "needs_work" ? -1 : 1;
      return Date.parse(b.created_at || "") - Date.parse(a.created_at || "");
    });

  const openCount = repairs.filter(repair => repair.status === "needs_work").length;
  setText("repairQueueBadge", `${openCount} open`);
  setText("repairOpenCount", `${openCount} open`);

  if (!filtered.length) {
    repairListEl.innerHTML = `<div class="empty-state">No repair notes in this filter yet. Link one to the current move and start capturing the lesson loop.</div>`;
    return;
  }

  repairListEl.innerHTML = filtered.map(repair => `
    <article class="repair-item ${repair.status === "solved" ? "solved" : "open"}">
      <div class="repair-item-top">
        ${repairStatusHtml(repair.status)}
        <span class="repair-linked">${escapeHtml(repairLinkedSummary(repair))}</span>
      </div>
      <h4>${escapeHtml(repair.mistake || "Unnamed repair loop")}</h4>
      <p><span>Lesson.</span> ${escapeHtml(repair.lesson || "No lesson recorded yet.")}</p>
      <p><span>Repair.</span> ${escapeHtml(repair.repair || "No repair action recorded yet.")}</p>
      <div class="repair-actions" data-id="${repair.id}">
        <button class="button button-secondary button-tiny" data-action="edit">Edit</button>
        <button class="button button-secondary button-tiny" data-action="jump" ${repair.related_node_id ? "" : "disabled"}>Jump</button>
        <button class="button button-ghost button-tiny" data-action="toggle">${repair.status === "solved" ? "Reopen" : "Mark solved"}</button>
        <button class="button button-danger button-tiny" data-action="delete">Delete</button>
      </div>
    </article>
  `).join("");
}

function paint() {
  if ($("tree")) {
    $("tree").innerHTML = renderChoices();
  }

  renderStats();
  renderDashboardFocus();
  renderLiveBoard();
  paintTrainer();
  renderRepairFocus();
  renderRepairList();

  if (!selectedRepairId) {
    if (currentNode()) setRepairLink(currentNode().id, pathFor(currentNode()));
    else if ($("repairIdInput") && !$("repairIdInput").value) setRepairLink(null, "");
  }
}

async function refresh() {
  nodes = await OpeningDB.loadNodes();
  repairs = await OpeningDB.loadRepairItems();

  if (selectedId && !nodeById(selectedId)) {
    setSelectedNodeId(null);
  }

  if (selectedRepairId && !repairById(selectedRepairId)) {
    selectedRepairId = null;
  }

  synchronizeTrainerPrompt();

  if ($("moveInput")) {
    if (selectedId) populateEditor(nodeById(selectedId));
    else populateEditor(null);
  }

  if ($("repairForm")) {
    if (selectedRepairId && repairById(selectedRepairId)) {
      fillRepairForm(repairById(selectedRepairId));
    } else if (!$("repairIdInput").value) {
      resetRepairForm({ keepSelectionLink: Boolean(currentNode()) });
    }
  }

  paint();
}

function backupPayload() {
  return {
    version: 4,
    exported_at: new Date().toISOString(),
    nodes,
    repairs
  };
}

function parseImportedBackup(text) {
  const parsed = JSON.parse(text);

  if (Array.isArray(parsed)) {
    return {
      nodes: parsed.map(OpeningDB.normalizeNode),
      repairs: []
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Backup file is not a valid JSON object.");
  }

  const importedNodes = Array.isArray(parsed.nodes)
    ? parsed.nodes
    : Array.isArray(parsed.opening_nodes)
      ? parsed.opening_nodes
      : null;

  if (!importedNodes) {
    throw new Error("Backup file does not contain a nodes array.");
  }

  return {
    nodes: importedNodes.map(OpeningDB.normalizeNode),
    repairs: Array.isArray(parsed.repairs) ? parsed.repairs.map(OpeningDB.normalizeRepairItem) : []
  };
}

const moveForm = $("moveForm");
if (moveForm) {
  moveForm.addEventListener("submit", async event => {
    event.preventDefault();

    const existing = nodeById(selectedId);
    const node = getFormNode(existing?.parent_id || null, selectedId || null);
    await OpeningDB.upsertNode(node);
    setSelectedNodeId(node.id);

    await refresh();
  });
}

const repairForm = $("repairForm");
if (repairForm) {
  repairForm.addEventListener("submit", async event => {
    event.preventDefault();

    const repair = {
      id: $("repairIdInput").value || crypto.randomUUID(),
      related_node_id: $("repairNodeIdInput").value || null,
      position_path: $("repairPathInput").value.trim(),
      mistake: $("repairMistakeInput").value.trim(),
      lesson: $("repairLessonInput").value.trim(),
      repair: $("repairActionInput").value.trim(),
      status: $("repairStatusInput").value,
      created_at: repairById($("repairIdInput").value)?.created_at || new Date().toISOString()
    };

    await OpeningDB.upsertRepairItem(repair);
    selectedRepairId = repair.id;

    await refresh();
  });
}

const trainerForm = $("trainerForm");
if (trainerForm) {
  trainerForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!trainerPrompt) return;

    const answer = $("trainerAnswerInput").value.trim();
    if (!answer) return;

    const acceptedNode = trainerPrompt.acceptedNodes.find(node => moveTextMatches(answer, node.move));

    if (acceptedNode) {
      trainerResult = { kind: "correct", node: acceptedNode };
    } else {
      const siblingNode = trainerPrompt.allChildren.find(node => moveTextMatches(answer, node.move));
      if (siblingNode?.exclude_from_training) {
        trainerResult = { kind: "excluded-branch", node: siblingNode };
      } else if (siblingNode) {
        trainerResult = { kind: "tree-branch", node: siblingNode };
      } else {
        trainerResult = { kind: "incorrect" };
      }
    }

    trainerRevealOpen = true;
    paintTrainer();
  });
}

const treeEl = $("tree");
if (treeEl) {
  treeEl.addEventListener("click", event => {
    const chip = event.target.closest(".line-chip");
    if (chip?.dataset.id) {
      selectNode(chip.dataset.id);
      return;
    }

    const choice = event.target.closest(".choice-card");
    if (choice?.dataset.id) {
      selectNode(choice.dataset.id);
      return;
    }

    if (event.target.closest("#backLineBtn")) {
      const current = currentNode();
      setSelectedNodeId(current?.parent_id || null);
      selectedRepairId = null;
      if (selectedId) populateEditor(nodeById(selectedId));
      else populateEditor(null);
      paint();
      return;
    }

    if (event.target.closest("#rootLineBtn")) {
      setSelectedNodeId(null);
      selectedRepairId = null;
      populateEditor(null);
      paint();
    }
  });
}

const repairListEl = $("repairList");
if (repairListEl) {
  repairListEl.addEventListener("click", async event => {
    const actionButton = event.target.closest("[data-action]");
    const actionRow = event.target.closest("[data-id]");
    if (!actionButton || !actionRow) return;

    const repair = repairById(actionRow.dataset.id);
    if (!repair) return;

    const action = actionButton.dataset.action;

    if (action === "edit") {
      fillRepairForm(repair);
      paint();
      return;
    }

    if (action === "jump") {
      if (repair.related_node_id) {
        fillRepairForm(repair);
        paint();
      }
      return;
    }

    if (action === "toggle") {
      await OpeningDB.upsertRepairItem({
        ...repair,
        status: repair.status === "solved" ? "needs_work" : "solved"
      });
      await refresh();
      return;
    }

    if (action === "delete" && confirm("Delete this repair loop?")) {
      if (selectedRepairId === repair.id) {
        selectedRepairId = null;
        resetRepairForm({ keepSelectionLink: true });
      }
      await OpeningDB.deleteRepairItem(repair.id);
      await refresh();
    }
  });
}

const newRootBtn = $("newRootBtn");
if (newRootBtn) newRootBtn.addEventListener("click", resetEditorForNewRoot);

const addChildBtn = $("addChildBtn");
if (addChildBtn) {
  addChildBtn.addEventListener("click", async () => {
    if (!selectedId) return;

    const child = {
      id: crypto.randomUUID(),
      parent_id: selectedId,
      move: "New move",
      title: "",
      highlight_kind: "",
      explanation: "",
      tags: [],
      exclude_from_training: false,
      is_practice_card: true,
      is_preferred: false,
      created_at: new Date().toISOString()
    };

    await OpeningDB.upsertNode(child);
    setSelectedNodeId(child.id);

    await refresh();
  });
}

const deleteBtn = $("deleteBtn");
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    if (!selectedId || !confirm("Delete this move and all child lines?")) return;

    const deletedNode = nodeById(selectedId);
    setSelectedNodeId(deletedNode?.parent_id || null);
    await OpeningDB.deleteNodeAndChildren(deletedNode.id);

    await refresh();
  });
}

const syncBtn = $("syncBtn");
if (syncBtn) syncBtn.addEventListener("click", refresh);

const splitCompoundBtn = $("splitCompoundBtn");
if (splitCompoundBtn) splitCompoundBtn.addEventListener("click", splitCompoundMovesOnce);

const newPromptBtn = $("newPromptBtn");
if (newPromptBtn) newPromptBtn.addEventListener("click", () => queueTrainerPrompt());

const selectedPromptBtn = $("selectedPromptBtn");
if (selectedPromptBtn) selectedPromptBtn.addEventListener("click", () => queueTrainerPrompt({ focusSelection: true }));

const revealPromptBtn = $("revealPromptBtn");
if (revealPromptBtn) {
  revealPromptBtn.addEventListener("click", () => {
    trainerRevealOpen = !trainerRevealOpen;
    paintTrainer();
  });
}

const repairUseCurrentBtn = $("repairUseCurrentBtn");
if (repairUseCurrentBtn) {
  repairUseCurrentBtn.addEventListener("click", () => {
    if (!currentNode()) {
      setRepairLink(null, "");
      paint();
      return;
    }

    setRepairLink(currentNode().id, pathFor(currentNode()));
    paint();
  });
}

const repairResetBtn = $("repairResetBtn");
if (repairResetBtn) {
  repairResetBtn.addEventListener("click", () => {
    if ($("repairIdInput")) $("repairIdInput").value = "";
    resetRepairForm({ keepSelectionLink: true });
    paint();
  });
}

const repairFilterInput = $("repairFilterInput");
if (repairFilterInput) repairFilterInput.addEventListener("change", renderRepairList);

const exportBtn = $("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gm-opening-tree-backup.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

const importBtn = $("importBtn");
const importInput = $("importInput");
if (importBtn && importInput) {
  bindImportButton(importBtn, importInput);

  importInput.addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseImportedBackup(text);
      await OpeningDB.saveAllNodes(imported.nodes);
      await OpeningDB.saveAllRepairItems(imported.repairs);
      setSelectedNodeId(null);
      selectedRepairId = null;
      setTrainerPrompt(null);
      await refresh();
      alert("Backup imported.");
    } catch (error) {
      console.error("Import failed:", error);
      alert(`Import failed: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
}

if ($("moveInput")) populateEditor(null);
if ($("repairForm")) resetRepairForm({ keepSelectionLink: false });
await refresh();
