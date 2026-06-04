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

let nodes = [];
let repairs = [];
let selectedId = null;
let selectedRepairId = null;
let trainerPrompt = null;
let trainerResult = null;
let trainerRevealOpen = false;

const $ = id => document.getElementById(id);

const treeEl = $("tree");
const moveForm = $("moveForm");
const repairForm = $("repairForm");

const liveBoardEl = $("liveBoard");
const liveBoardTitleEl = $("liveBoardTitle");
const liveBoardSubtitleEl = $("liveBoardSubtitle");
const liveBoardMetaEl = $("liveBoardMeta");
const liveMoveValueEl = $("liveMoveValue");
const liveMoveCaptionEl = $("liveMoveCaption");
const liveTurnValueEl = $("liveTurnValue");
const liveStatusValueEl = $("liveStatusValue");
const liveBoardLineEl = $("liveBoardLine");

const trainerBoardEl = $("trainerBoard");
const trainerPositionTitleEl = $("trainerPositionTitle");
const trainerQueueCountEl = $("trainerQueueCount");
const trainerTurnPillEl = $("trainerTurnPill");
const trainerPositionLineEl = $("trainerPositionLine");
const trainerAcceptedMetaEl = $("trainerAcceptedMeta");
const trainerHintEl = $("trainerHint");
const trainerFeedbackEl = $("trainerFeedback");
const trainerRevealEl = $("trainerReveal");
const trainerAnswerInput = $("trainerAnswerInput");
const trainerSubmitBtn = $("trainerSubmitBtn");
const revealPromptBtn = $("revealPromptBtn");
const selectedPromptBtn = $("selectedPromptBtn");

const repairListEl = $("repairList");
const repairQueueBadgeEl = $("repairQueueBadge");
const repairLinkMetaEl = $("repairLinkMeta");
const repairEditorStateEl = $("repairEditorState");
const repairFilterInput = $("repairFilterInput");

const editorContextEl = $("editorContext");

const highlightLabels = {
  blunder: "Blunder",
  great: "Great move",
  brilliant: "Brilliant"
};

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

function renderStats() {
  const trainerPositions = buildTrainingPositions().length;
  const openRepairs = repairs.filter(repair => repair.status === "needs_work").length;

  $("nodeCount").textContent = nodes.length;
  $("lineCount").textContent = nodes.filter(node => !node.parent_id).length;
  $("trainerCount").textContent = trainerPositions;
  $("preferredCount").textContent = nodes.filter(node => node.is_preferred).length;
  $("repairCount").textContent = openRepairs;
}

function renderLiveBoard() {
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

  liveBoardTitleEl.textContent = titleValue;
  liveBoardSubtitleEl.textContent = subtitleValue;
  liveBoardMetaEl.textContent = boardReady && historyLength ? `${turnValue} / ${historyLength} ply` : turnValue;
  liveMoveValueEl.textContent = moveValue;
  liveMoveCaptionEl.textContent = current
    ? (current.title || pathFor(current))
    : "Choose a move in the explorer to jump the position here.";
  liveTurnValueEl.textContent = turnValue;
  liveStatusValueEl.textContent = statusValue;
  liveBoardLineEl.innerHTML = renderLineChips(path, {
    emptyText: "No move selected yet. The board is ready at the start position."
  });
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
  $("editorTitle").textContent = node ? `Editing ${node.move}` : (newRoot ? "New root move" : "Select a move");
  $("deleteBtn").disabled = !node;
  $("addChildBtn").disabled = !node;
  $("moveInput").value = node?.move || "";
  $("titleInput").value = node?.title || "";
  $("highlightInput").value = node?.highlight_kind || "";
  $("explanationInput").value = node?.explanation || "";
  $("tagsInput").value = (node?.tags || []).join(", ");
  $("practiceInput").checked = node?.is_practice_card !== false;
  $("preferredInput").checked = node?.is_preferred === true;

  const nodeRepairs = node
    ? repairs.filter(repair => repair.related_node_id === node.id && repair.status === "needs_work").length
    : 0;

  editorContextEl.textContent = node
    ? `${nodeRepairs} open repair item${nodeRepairs === 1 ? "" : "s"} linked here. Mark a move as preferred when this is the repertoire answer the trainer should expect.`
    : "Create a root move or select an existing move to edit its title, tags, preferred status, and trainer settings.";
}

function selectNode(id, shouldPaint = true) {
  selectedId = id;
  populateEditor(nodeById(id));
  if (shouldPaint) paint();
}

function resetEditorForNewRoot() {
  selectedId = null;
  populateEditor(null, { newRoot: true });
  paint();
}

function getFormNode(parentId = null, existingId = null) {
  return {
    id: existingId || crypto.randomUUID(),
    parent_id: parentId,
    move: $("moveInput").value.trim() || "New move",
    title: $("titleInput").value.trim(),
    highlight_kind: $("highlightInput").value,
    explanation: $("explanationInput").value.trim(),
    tags: $("tagsInput").value.split(",").map(tag => tag.trim()).filter(Boolean),
    is_practice_card: $("practiceInput").checked,
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
      is_practice_card: isLastPart ? original.is_practice_card !== false : true,
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
  selectedId = null;
  await refresh();

  alert(`Done. Split ${splitNodeCount} move cell(s) and created ${addedNodeCount} extra child node(s).`);
}

function buildTrainingPositions() {
  const grouped = new Map();

  for (const node of nodes.filter(entry => entry.is_practice_card !== false)) {
    const key = node.parent_id || "__root__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(node);
  }

  return [...grouped.values()].map(group => {
    const parentId = group[0]?.parent_id || null;
    const acceptedNodes = group.some(node => node.is_preferred)
      ? group.filter(node => node.is_preferred)
      : group;
    const positionNode = parentId ? nodeById(parentId) : null;
    const positionNodes = positionNode ? pathNodesFor(positionNode) : [];
    const allChildren = children(parentId);
    const pendingRepairs = repairs.filter(repair =>
      repair.status === "needs_work" &&
      acceptedNodes.some(node => node.id === repair.related_node_id)
    );

    return {
      parentId,
      acceptedNodes,
      allChildren,
      positionNodes,
      pendingRepairs
    };
  });
}

function findTrainingPosition(parentId, groups = buildTrainingPositions()) {
  return groups.find(group => group.parentId === parentId) || null;
}

function focusParentIdFromSelection(groups = buildTrainingPositions()) {
  const current = currentNode();
  if (!current) return undefined;

  if (findTrainingPosition(current.id, groups)) return current.id;
  if (findTrainingPosition(current.parent_id || null, groups)) return current.parent_id || null;
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
  if (trainerAnswerInput) trainerAnswerInput.value = "";
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
    const focusParentId = focusParentIdFromSelection(groups);
    if (focusParentId !== undefined && findTrainingPosition(focusParentId, groups)) {
      pool = groups.filter(group => group.parentId === focusParentId);
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

  trainerPrompt = findTrainingPosition(trainerPrompt.parentId, groups) || pickWeightedPrompt(groups);
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
  if (!trainerBoardEl) return;

  const groups = buildTrainingPositions();
  const focusPromptAvailable = findTrainingPosition(focusParentIdFromSelection(groups), groups);

  selectedPromptBtn.disabled = !focusPromptAvailable;
  revealPromptBtn.disabled = !trainerPrompt;
  trainerSubmitBtn.disabled = !trainerPrompt;
  trainerAnswerInput.disabled = !trainerPrompt;
  trainerQueueCountEl.textContent = `${groups.length} training position${groups.length === 1 ? "" : "s"} ready`;

  if (!groups.length) {
    trainerPositionTitleEl.textContent = "Trainer waiting";
    trainerTurnPillEl.textContent = "No prompts";
    trainerPositionLineEl.innerHTML = `<div class="line-empty">Mark moves for training or create a preferred line to start drilling.</div>`;
    trainerAcceptedMetaEl.textContent = "Add trainer moves in the editor";
    trainerHintEl.textContent = "Open repairs linked to moves will be surfaced here once they exist.";
    trainerFeedbackEl.innerHTML = renderTrainerFeedback(null);
    trainerRevealEl.innerHTML = "";
    trainerBoardEl.innerHTML = renderBoardSquares(boardFromFen(), null);
    return;
  }

  synchronizeTrainerPrompt();

  const prompt = trainerPrompt;
  const attempt = bestBoardAttempt(prompt.positionNodes);
  const game = attempt?.game || createChessGame("w");
  const boardReady = Boolean(game);
  const rows = game ? boardRowsFromGame(game) : boardFromFen();

  trainerPositionTitleEl.textContent = trainerAnswerTitle(prompt);
  trainerTurnPillEl.textContent = boardReady ? colorToMoveText(game.turn()) : "Board waiting for chess.js";
  trainerPositionLineEl.innerHTML = renderLineChips(prompt.positionNodes, {
    emptyText: "The prompt starts from the initial position."
  });
  trainerAcceptedMetaEl.textContent = prompt.acceptedNodes.length === 1
    ? "One repertoire move expected"
    : `${prompt.acceptedNodes.length} repertoire moves accepted`;
  trainerHintEl.textContent = prompt.pendingRepairs.length
    ? `Repair cue: ${prompt.pendingRepairs[0].lesson || prompt.pendingRepairs[0].mistake || prompt.pendingRepairs[0].repair}`
    : "No open repair is linked to this prompt yet.";
  trainerFeedbackEl.innerHTML = renderTrainerFeedback(prompt);
  trainerRevealEl.innerHTML = renderTrainerReveal(prompt);
  trainerBoardEl.innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);
  revealPromptBtn.textContent = trainerRevealOpen ? "Hide answer" : "Reveal answer";
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

  $("repairNodeIdInput").value = node?.id || "";
  $("repairPathInput").value = resolvedPath;
  repairLinkMetaEl.textContent = node
    ? `Linked to ${resolvedPath}`
    : (resolvedPath ? `Pinned to ${resolvedPath}` : "Not linked to a move yet.");
}

function resetRepairForm({ keepSelectionLink = true } = {}) {
  selectedRepairId = null;
  repairForm.reset();
  $("repairStatusInput").value = "needs_work";
  repairEditorStateEl.textContent = "Capture the mistake, the lesson, and the repair plan.";

  if (keepSelectionLink && currentNode()) {
    setRepairLink(currentNode().id, pathFor(currentNode()));
  } else {
    setRepairLink(null, "");
  }
}

function fillRepairForm(repair) {
  selectedRepairId = repair.id;
  $("repairIdInput").value = repair.id;
  $("repairMistakeInput").value = repair.mistake || "";
  $("repairLessonInput").value = repair.lesson || "";
  $("repairActionInput").value = repair.repair || "";
  $("repairStatusInput").value = repair.status || "needs_work";
  setRepairLink(repair.related_node_id, repair.position_path || "");
  repairEditorStateEl.textContent = "Editing an existing repair loop.";
}

function repairStatusHtml(status) {
  const label = status === "solved" ? "Solved" : "Needs work";
  const className = status === "solved" ? "status-solved" : "status-open";
  return `<span class="repair-status ${className}">${label}</span>`;
}

function renderRepairList() {
  if (!repairListEl) return;

  const filterValue = repairFilterInput.value;
  const filtered = repairs
    .filter(repair => filterValue === "all" || repair.status === filterValue)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "needs_work" ? -1 : 1;
      return Date.parse(b.created_at || "") - Date.parse(a.created_at || "");
    });

  repairQueueBadgeEl.textContent = `${repairs.filter(repair => repair.status === "needs_work").length} open`;

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
  treeEl.innerHTML = renderChoices();
  renderStats();
  renderLiveBoard();
  paintTrainer();
  renderRepairList();

  if (!selectedRepairId) {
    if (currentNode()) setRepairLink(currentNode().id, pathFor(currentNode()));
    else if (!$("repairIdInput").value) setRepairLink(null, "");
  }
}

async function refresh() {
  nodes = await OpeningDB.loadNodes();
  repairs = await OpeningDB.loadRepairItems();

  if (selectedId && !nodeById(selectedId)) selectedId = null;
  if (selectedRepairId && !repairById(selectedRepairId)) selectedRepairId = null;

  synchronizeTrainerPrompt();

  if (selectedId) populateEditor(nodeById(selectedId));
  else if (!$("moveInput").value) populateEditor(null);

  if (selectedRepairId) fillRepairForm(repairById(selectedRepairId));
  else if (!$("repairIdInput").value) resetRepairForm({ keepSelectionLink: Boolean(currentNode()) });

  paint();
}

function backupPayload() {
  return {
    version: 3,
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

moveForm.addEventListener("submit", async event => {
  event.preventDefault();

  const existing = nodeById(selectedId);
  const node = getFormNode(existing?.parent_id || null, selectedId || null);
  await OpeningDB.upsertNode(node);
  selectedId = node.id;

  await refresh();
});

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

$("trainerForm").addEventListener("submit", event => {
  event.preventDefault();

  if (!trainerPrompt) return;

  const answer = trainerAnswerInput.value.trim();
  if (!answer) return;

  const acceptedNode = trainerPrompt.acceptedNodes.find(node => moveTextMatches(answer, node.move));

  if (acceptedNode) {
    trainerResult = { kind: "correct", node: acceptedNode };
  } else {
    const siblingNode = trainerPrompt.allChildren.find(node => moveTextMatches(answer, node.move));
    trainerResult = siblingNode
      ? { kind: "tree-branch", node: siblingNode }
      : { kind: "incorrect" };
  }

  trainerRevealOpen = true;
  paintTrainer();
});

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
    selectedId = current?.parent_id || null;
    if (selectedId) populateEditor(nodeById(selectedId));
    else populateEditor(null);
    paint();
    return;
  }

  if (event.target.closest("#rootLineBtn")) {
    selectedId = null;
    populateEditor(null);
    paint();
  }
});

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
    if (repair.related_node_id) selectNode(repair.related_node_id);
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

$("newRootBtn").addEventListener("click", resetEditorForNewRoot);

$("addChildBtn").addEventListener("click", async () => {
  if (!selectedId) return;

  const child = {
    id: crypto.randomUUID(),
    parent_id: selectedId,
    move: "New move",
    title: "",
    highlight_kind: "",
    explanation: "",
    tags: [],
    is_practice_card: true,
    is_preferred: false,
    created_at: new Date().toISOString()
  };

  await OpeningDB.upsertNode(child);
  selectedId = child.id;

  await refresh();
});

$("deleteBtn").addEventListener("click", async () => {
  if (!selectedId || !confirm("Delete this move and all child lines?")) return;

  const deletedNode = nodeById(selectedId);
  selectedId = deletedNode?.parent_id || null;
  await OpeningDB.deleteNodeAndChildren(deletedNode.id);

  await refresh();
});

$("syncBtn").addEventListener("click", refresh);
$("splitCompoundBtn").addEventListener("click", splitCompoundMovesOnce);
$("newPromptBtn").addEventListener("click", () => queueTrainerPrompt());
$("selectedPromptBtn").addEventListener("click", () => queueTrainerPrompt({ focusSelection: true }));
$("revealPromptBtn").addEventListener("click", () => {
  trainerRevealOpen = !trainerRevealOpen;
  paintTrainer();
});

$("repairUseCurrentBtn").addEventListener("click", () => {
  if (!currentNode()) {
    setRepairLink(null, "");
    return;
  }

  setRepairLink(currentNode().id, pathFor(currentNode()));
});

$("repairResetBtn").addEventListener("click", () => {
  $("repairIdInput").value = "";
  resetRepairForm({ keepSelectionLink: true });
  paint();
});

repairFilterInput.addEventListener("change", renderRepairList);

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "gm-opening-tree-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

bindImportButton($("importBtn"), $("importInput"));

$("importInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = parseImportedBackup(text);
    await OpeningDB.saveAllNodes(imported.nodes);
    await OpeningDB.saveAllRepairItems(imported.repairs);
    selectedId = null;
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

populateEditor(null);
resetRepairForm({ keepSelectionLink: false });
await refresh();
