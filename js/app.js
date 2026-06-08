import { requireOnlyMe } from "./auth/only-me-guard.js";
import {
  bestBoardAttempt,
  boardFromFen,
  boardRowsFromGame,
  colorToMoveText,
  createChessGame,
  moveTextMatches,
  renderBoardSquares
} from "./board-tools.js";
import {
  applyBoardAppearance,
  boardAppearanceSummary,
  getStoredBoardAppearance
} from "./board-appearance.js";
import {
  isReminderDue,
  supportCommandItems
} from "./support-utils.js";
import { bindImportButton, initPageChrome } from "./ui-shell.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/app.js.");
}

const SELECTED_NODE_STORAGE_KEY = "gm_opening_tree_selected_node_v1";
const SELECTED_REPAIR_STORAGE_KEY = "gm_brain_selected_repair_v1";
const BACKUP_PROMPT_SESSION_KEY = "gm_opening_tree_backup_prompt_seen_v1";

let nodes = [];
let repairs = [];
let games = [];
let gameAnnotations = [];
let positions = [];
let mistakes = [];
let supportCards = [];
let goals = [];
let appReminders = [];
let books = [];
let bookNotes = [];
let tournamentNotes = [];
let quickIdeas = [];
let reviewItems = [];
let repairAttempts = [];
let selectedId = loadSelectedNodeId();
let selectedRepairId = loadSelectedRepairId();
let trainingState = {
  color: "w",
  rootId: null,
  prompt: null,
  result: null,
  revealOpen: false,
  whyOpen: false,
  lastOpponentNodeId: null,
  completedLines: 0,
  solvedPrompts: 0
};

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

function loadSelectedRepairId() {
  return localStorage.getItem(SELECTED_REPAIR_STORAGE_KEY) || null;
}

function saveSelectedRepairId(id) {
  if (id) localStorage.setItem(SELECTED_REPAIR_STORAGE_KEY, id);
  else localStorage.removeItem(SELECTED_REPAIR_STORAGE_KEY);
}

function setSelectedNodeId(id) {
  selectedId = id || null;
  saveSelectedNodeId(selectedId);
}

function setSelectedRepairId(id) {
  selectedRepairId = id || null;
  saveSelectedRepairId(selectedRepairId);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setHtml(id, value) {
  const element = $(id);
  if (element) element.innerHTML = value;
}

function formatActionError(error, fallback = "Unknown error.") {
  const parts = [
    error?.message,
    error?.details,
    error?.hint
  ].filter(Boolean).map(value => String(value).trim());

  return parts.join(" ") || fallback;
}

function reportActionError(actionLabel, error) {
  console.error(`${actionLabel} failed:`, error);
  alert(`${actionLabel} failed.\n\n${formatActionError(error)}\n\nYour local recovery copy was kept so the app should not wipe your tree.`);
}

function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "toastHost";
  host.className = "toast-host";
  document.body.appendChild(host);
  return host;
}

function showToast(message, kind = "success") {
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.textContent = message;
  host.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("is-visible"));

  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 2400);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>'"]/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]
  ));
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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

function gameById(id) {
  return games.find(game => game.id === id) || null;
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

function rootNodeFor(node) {
  return pathNodesFor(node)[0] || null;
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
  setSelectedRepairId(null);
  populateEditor(nodeById(id));
  if (shouldPaint) paint();
}

function renderStats() {
  const trainerPositions = buildTrainingPromptGroups().length;
  const openRepairs = repairs.filter(repair => repair.status === "needs_work").length;
  const rootLines = nodes.filter(node => !node.parent_id).length;
  const openMistakes = mistakes.length;
  const analyzedGames = games.length;
  const storedPositions = positions.length;
  const activeGoals = goals.filter(goal => goal.status === "active");
  const dueReminders = appReminders.filter(isReminderDue);
  const currentBooks = books.filter(book => book.status === "currently_reading");
  const pinnedCards = supportCards.filter(card => card.status === "active" && card.pinned);

  setText("nodeCount", String(nodes.length));
  setText("lineCount", String(rootLines));
  setText("trainerCount", String(trainerPositions));
  setText("repairCount", String(openRepairs));
  setText("gameCount", String(analyzedGames));
  setText("positionCount", String(storedPositions));
  setText("mistakeCount", String(openMistakes));

  setText("dashboardEditorCount", `${nodes.length} moves`);
  setText("dashboardGamesCount", `${analyzedGames} games`);
  setText("dashboardPositionCount", `${storedPositions} positions`);
  setText("dashboardTrainerCount", `${trainerPositions} prompts`);
  setText("dashboardRepairCount", `${openRepairs} open`);
  setText("dashboardSupportCount", `${activeGoals.length} goals • ${dueReminders.length} due`);
  setText("dashboardDueReminderCount", `${dueReminders.length} due reminder${dueReminders.length === 1 ? "" : "s"}`);
  setText("dashboardCurrentBooksCount", `${currentBooks.length} current book${currentBooks.length === 1 ? "" : "s"}`);
  setText("dashboardActiveGoalsCount", `${activeGoals.length} active goal${activeGoals.length === 1 ? "" : "s"}`);
  setText("dashboardPinnedCardsCount", `${pinnedCards.length} pinned card${pinnedCards.length === 1 ? "" : "s"}`);
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

function gameStatusLabel(status) {
  return {
    imported_only: "Imported only",
    quick_classified: "Quick classified",
    human_analysis_started: "Analysis started",
    human_analysis_complete: "Analysis complete",
    engine_checked_later: "Engine checked later",
    lessons_extracted: "Lessons extracted",
    repairs_created: "Repairs created"
  }[status] || "Imported only";
}

function renderDashboardHeatmap() {
  const host = $("dashboardHeatmap");
  if (!host) return;

  const counts = new Map();
  for (const mistake of mistakes) {
    const key = mistake.category || "uncategorized";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const rows = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([category, count]) => `
      <article class="heatmap-row">
        <strong>${escapeHtml(category.replace(/_/g, " "))}</strong>
        <span>${count}</span>
      </article>
    `)
    .join("");

  host.innerHTML = rows || `<div class="line-empty">No mistake records yet. Once game analysis starts feeding the mistake database, repeated patterns will pile up here.</div>`;
}

function renderDashboardGameQueue() {
  const host = $("dashboardGameQueue");
  if (!host) return;

  const queued = games
    .filter(game => !["lessons_extracted", "repairs_created"].includes(game.analysis_status))
    .slice()
    .sort((left, right) => Date.parse(right.updated_at || right.created_at || "") - Date.parse(left.updated_at || left.created_at || ""))
    .slice(0, 6);

  host.innerHTML = queued.map(game => {
    const totalPly = gameAnnotations.filter(annotation => annotation.game_id === game.id).length;
    const extracted = gameAnnotations.filter(annotation => annotation.game_id === game.id && (annotation.position_id || annotation.mistake_id || annotation.repair_id)).length;

    return `
      <button class="queue-card" data-game-id="${game.id}" type="button">
        <span class="study-choice-kicker">${escapeHtml(gameStatusLabel(game.analysis_status))}</span>
        <strong>${escapeHtml(game.event || `${game.white_player || "White"} vs ${game.black_player || "Black"}`)}</strong>
        <p>${escapeHtml([game.opening_name, game.result].filter(Boolean).join(" • ") || "No opening label yet")}</p>
        <div class="study-choice-meta">
          <strong>${totalPly} ply</strong>
          <span>${extracted} extracted</span>
        </div>
      </button>
    `;
  }).join("") || `<div class="line-empty">No games in the queue yet. Import a PGN in Game Analysis Studio and the dashboard will surface unfinished work here.</div>`;
}

function renderDashboardSupportSummary() {
  const host = $("dashboardSupportSummary");
  if (!host) return;

  const items = supportCommandItems({
    supportCards,
    goals,
    reminders: appReminders,
    books
  }).slice(0, 6);
  const criticalGoals = goals.filter(goal => goal.status === "active" && goal.priority === "critical").length;

  setText("dashboardSupportCriticalGoals", `${criticalGoals} critical goal${criticalGoals === 1 ? "" : "s"}`);

  if (!items.length) {
    host.innerHTML = `<div class="line-empty">No support items yet. Add goals, reminders, books, or cards in the Support Hub.</div>`;
    return;
  }

  host.innerHTML = items.map(item => `
    <article class="heatmap-row support-summary-row">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p class="muted">${escapeHtml(item.meta || "Visible in the Support Hub")}</p>
      </div>
      <span class="mini-tag">${escapeHtml(item.kind.replace(/_/g, " "))}</span>
    </article>
  `).join("");
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
  setSelectedRepairId(null);
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

function nodeMoveColor(node) {
  return rootTurnForMove(node?.move || "");
}

function oppositeColor(color) {
  return color === "b" ? "w" : "b";
}

function preferredTrainingNodes(group) {
  if (!group.length) return [];
  return group.some(node => node.is_preferred) ? group.filter(node => node.is_preferred) : group;
}

function trainingRoots(color = trainingState.color) {
  return nodes
    .filter(node => !node.parent_id && isTrainingEnabled(node) && (!color || nodeMoveColor(node) === color))
    .sort((a, b) => (a.title || a.move).localeCompare(b.title || b.move));
}

function trainingChildrenFor(parentId, { color = null, rootId = null, includeExcluded = false } = {}) {
  return children(parentId)
    .filter(node => includeExcluded || isTrainingEnabled(node))
    .filter(node => !color || nodeMoveColor(node) === color)
    .filter(node => !rootId || rootNodeFor(node)?.id === rootId);
}

function buildTrainingPromptGroups({ color = null, rootId = null } = {}) {
  const groups = [];
  const parentGroups = new Map();

  for (const node of nodes.filter(isTrainingEnabled)) {
    if (color && nodeMoveColor(node) !== color) continue;
    if (rootId && rootNodeFor(node)?.id !== rootId) continue;

    if (!node.parent_id) {
      groups.push({
        positionId: null,
        positionNode: null,
        positionNodes: [],
        openingNode: node,
        acceptedNodes: [node],
        eligibleChildren: [node],
        allChildren: trainingRoots(nodeMoveColor(node)),
        excludedChildren: nodes.filter(
          entry => !entry.parent_id && nodeMoveColor(entry) === nodeMoveColor(node) && !isTrainingEnabled(entry)
        ),
        pendingRepairs: openRepairsForNode(node.id),
        lastOpponentNode: null
      });
      continue;
    }

    if (!parentGroups.has(node.parent_id)) parentGroups.set(node.parent_id, []);
    parentGroups.get(node.parent_id).push(node);
  }

  for (const [parentId, group] of parentGroups.entries()) {
    const positionNode = nodeById(parentId);
    if (!positionNode) continue;
    const moveColor = nodeMoveColor(group[0]);
    const siblingNodes = children(parentId).filter(node => nodeMoveColor(node) === moveColor);
    const acceptedNodes = preferredTrainingNodes(group);

    groups.push({
      positionId: parentId,
      positionNode,
      positionNodes: pathNodesFor(positionNode),
      openingNode: rootNodeFor(positionNode),
      acceptedNodes,
      eligibleChildren: group,
      allChildren: siblingNodes,
      excludedChildren: siblingNodes.filter(node => !isTrainingEnabled(node)),
      pendingRepairs: repairs.filter(
        repair => repair.status === "needs_work" && acceptedNodes.some(node => node.id === repair.related_node_id)
      ),
      lastOpponentNode: null
    });
  }

  return groups;
}

function selectedRootForTrainerColor(color = trainingState.color) {
  const current = currentNode();
  const root = current ? rootNodeFor(current) : null;
  return root && isTrainingEnabled(root) && nodeMoveColor(root) === color ? root : null;
}

function resolveTrainingRootId(color = trainingState.color, desiredId = trainingState.rootId) {
  const roots = trainingRoots(color);
  if (!roots.length) return null;
  if (desiredId && roots.some(root => root.id === desiredId)) return desiredId;

  const focusedRoot = selectedRootForTrainerColor(color);
  if (focusedRoot) return focusedRoot.id;

  return roots[0].id;
}

function trainingBranchWeight(node, trainingColor = trainingState.color) {
  const descendants = trainingChildrenFor(node.id).length;
  const promptBias = nodeMoveColor(node) === trainingColor ? 2 : 1;
  return 1 + promptBias + (node.is_preferred ? 3 : 0) + openRepairsForNode(node.id).length * 4 + descendants;
}

function pickWeightedNode(pool, weightFn = entry => trainingBranchWeight(entry)) {
  if (!pool.length) return null;

  const weighted = pool.map(entry => ({
    entry,
    weight: Math.max(1, Number(weightFn(entry)) || 1)
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.entry;
  }

  return weighted[weighted.length - 1].entry;
}

function resetTrainerState({ keepSelections = true } = {}) {
  trainingState = {
    color: trainingState.color,
    rootId: keepSelections ? trainingState.rootId : null,
    prompt: null,
    result: null,
    revealOpen: false,
    whyOpen: false,
    lastOpponentNodeId: null,
    completedLines: keepSelections ? trainingState.completedLines : 0,
    solvedPrompts: keepSelections ? trainingState.solvedPrompts : 0
  };

  const input = $("trainerAnswerInput");
  if (input) input.value = "";
}

function setTrainingPrompt(prompt) {
  trainingState.prompt = prompt;
  trainingState.result = null;
  trainingState.revealOpen = false;
  trainingState.whyOpen = false;

  const input = $("trainerAnswerInput");
  if (input) input.value = "";
}

function buildRootTrainingPrompt(rootNode) {
  if (!rootNode) return null;

  return {
    positionId: null,
    positionNode: null,
    positionNodes: [],
    openingNode: rootNode,
    acceptedNodes: [rootNode],
    eligibleChildren: [rootNode],
    allChildren: trainingRoots(trainingState.color),
    excludedChildren: nodes.filter(
      node => !node.parent_id && nodeMoveColor(node) === trainingState.color && !isTrainingEnabled(node)
    ),
    pendingRepairs: openRepairsForNode(rootNode.id),
    lastOpponentNode: null
  };
}

function buildPositionTrainingPrompt(positionNode) {
  if (!positionNode) return null;

  const moveColor = trainingState.color;
  const allChildren = trainingChildrenFor(positionNode.id, {
    color: moveColor,
    rootId: trainingState.rootId,
    includeExcluded: true
  });
  const eligibleChildren = allChildren.filter(isTrainingEnabled);
  if (!eligibleChildren.length) return null;

  const acceptedNodes = preferredTrainingNodes(eligibleChildren);
  const lastOpponentNode = trainingState.lastOpponentNodeId ? nodeById(trainingState.lastOpponentNodeId) : null;

  return {
    positionId: positionNode.id,
    positionNode,
    positionNodes: pathNodesFor(positionNode),
    openingNode: rootNodeFor(positionNode),
    acceptedNodes,
    eligibleChildren,
    allChildren,
    excludedChildren: allChildren.filter(node => !isTrainingEnabled(node)),
    pendingRepairs: repairs.filter(
      repair => repair.status === "needs_work" && acceptedNodes.some(node => node.id === repair.related_node_id)
    ),
    lastOpponentNode
  };
}

function beginTrainingLine() {
  trainingState.rootId = resolveTrainingRootId(trainingState.color, trainingState.rootId);

  if (!trainingState.rootId) {
    resetTrainerState({ keepSelections: true });
    paintTrainer();
    return;
  }

  trainingState.lastOpponentNodeId = null;
  setTrainingPrompt(buildRootTrainingPrompt(nodeById(trainingState.rootId)));
  paintTrainer();
}

function switchTrainingColor(color) {
  if (!["w", "b"].includes(color)) return;

  trainingState.color = color;
  trainingState.rootId = resolveTrainingRootId(color, null);
  trainingState.prompt = null;
  trainingState.result = null;
  trainingState.revealOpen = false;
  trainingState.whyOpen = false;
  trainingState.lastOpponentNodeId = null;

  const input = $("trainerAnswerInput");
  if (input) input.value = "";

  paintTrainer();
}

function completeTrainingLine(finalNode, message) {
  trainingState.prompt = null;
  trainingState.revealOpen = false;
  trainingState.whyOpen = false;
  trainingState.lastOpponentNodeId = null;
  trainingState.completedLines += 1;
  trainingState.result = {
    kind: "line-complete",
    node: finalNode,
    message
  };

  const input = $("trainerAnswerInput");
  if (input) input.value = "";
}

function continueTrainingLine(chosenNode) {
  if (!chosenNode) return;

  if (trainingState.result?.kind === "correct") {
    trainingState.solvedPrompts += 1;
  }

  const opponentOptions = trainingChildrenFor(chosenNode.id, {
    color: oppositeColor(trainingState.color),
    rootId: trainingState.rootId
  });

  if (!opponentOptions.length) {
    completeTrainingLine(chosenNode, `Line complete. No stored opponent reply follows ${chosenNode.move}.`);
    paintTrainer();
    return;
  }

  const opponentNode = pickWeightedNode(opponentOptions);
  trainingState.lastOpponentNodeId = opponentNode.id;

  const nextPrompt = buildPositionTrainingPrompt(opponentNode);
  if (!nextPrompt) {
    completeTrainingLine(opponentNode, `Line complete after ${opponentNode.move}.`);
    paintTrainer();
    return;
  }

  setTrainingPrompt(nextPrompt);
  paintTrainer();
}

function synchronizeTrainingState() {
  trainingState.rootId = resolveTrainingRootId(trainingState.color, trainingState.rootId);

  if (trainingState.lastOpponentNodeId && !nodeById(trainingState.lastOpponentNodeId)) {
    trainingState.lastOpponentNodeId = null;
  }

  if (!trainingState.rootId) {
    trainingState.prompt = null;
    trainingState.result = null;
    trainingState.revealOpen = false;
    trainingState.whyOpen = false;
    return;
  }

  if (!trainingState.prompt) return;

  if (trainingState.prompt.positionId === null) {
    trainingState.prompt = buildRootTrainingPrompt(nodeById(trainingState.rootId));
    return;
  }

  const positionNode = nodeById(trainingState.prompt.positionId);
  if (!positionNode || rootNodeFor(positionNode)?.id !== trainingState.rootId) {
    setTrainingPrompt(buildRootTrainingPrompt(nodeById(trainingState.rootId)));
    return;
  }

  const rebuiltPrompt = buildPositionTrainingPrompt(positionNode);
  if (!rebuiltPrompt) {
    completeTrainingLine(positionNode, `This stored line now ends after ${positionNode.move}.`);
    return;
  }

  trainingState.prompt = rebuiltPrompt;
}

function trainerAcceptedMovesText(prompt) {
  return prompt.acceptedNodes.map(node => node.move).join(", ");
}

function trainerAnswerTitle(prompt, result = trainingState.result) {
  if (prompt) {
    return prompt.positionNodes.length
      ? `Position after ${prompt.positionNodes[prompt.positionNodes.length - 1].move}`
      : "Start position";
  }

  if (result?.kind === "line-complete" && result.node) {
    return `Line complete after ${result.node.move}`;
  }

  return "Trainer waiting";
}

function renderTrainerFeedback(prompt) {
  if (!trainingState.rootId) {
    return `<div class="feedback-box feedback-neutral">Choose a color and a study root, then start a training line.</div>`;
  }

  if (trainingState.result?.kind === "line-complete") {
    return `<div class="feedback-box feedback-correct">&#10003; ${escapeHtml(trainingState.result.message || "Line complete.")}</div>`;
  }

  if (!prompt) {
    return `<div class="feedback-box feedback-neutral">Start a line to see the next position prompt.</div>`;
  }

  if (!trainingState.result) {
    return `<div class="feedback-box feedback-neutral">Enter your move in SAN, then decide whether to reveal the idea or continue the line.</div>`;
  }

  const acceptedMoves = trainerAcceptedMovesText(prompt);

  if (trainingState.result.kind === "correct") {
    const branchText = prompt.acceptedNodes.length > 1
      ? ` ${escapeHtml(trainingState.result.node.move)} is one of your accepted repertoire choices here.`
      : "";
    return `<div class="feedback-box feedback-correct">&#10003; Correct.${branchText}</div>`;
  }

  if (trainingState.result.kind === "excluded-branch") {
    return `
      <div class="feedback-box feedback-incorrect">
        &#10007; ${escapeHtml(trainingState.result.node.move)} exists in your tree, but it is marked <strong>do not use for training</strong>. The prompt expected <strong>${escapeHtml(acceptedMoves)}</strong>.
      </div>`;
  }

  if (trainingState.result.kind === "tree-branch") {
    return `
      <div class="feedback-box feedback-incorrect">
        &#10007; ${escapeHtml(trainingState.result.node.move)} exists in your tree, but this session is training <strong>${escapeHtml(acceptedMoves)}</strong>.
      </div>`;
  }

  return `
    <div class="feedback-box feedback-incorrect">
      &#10007; Incorrect. The trainer expected <strong>${escapeHtml(acceptedMoves)}</strong>.
    </div>`;
}

function renderTrainerDetails(prompt) {
  if (!prompt) return "";

  const sections = [];

  if (trainingState.whyOpen) {
    const whyNode = prompt.lastOpponentNode || prompt.openingNode;
    const whyLabel = prompt.lastOpponentNode ? `Why ${whyNode.move}?` : `Why start with ${whyNode.move}?`;

    sections.push(`
      <article class="answer-card">
        <div class="answer-card-top">
          <strong>${escapeHtml(whyLabel)}</strong>
          ${highlightBadgeHtml(whyNode?.highlight_kind || "")}
        </div>
        <p class="answer-card-title">${escapeHtml(whyNode?.title || "No title yet")}</p>
        <p>${escapeHtml(whyNode?.explanation || "No explanation yet. Add one in the editor so the trainer can explain the plan here.")}</p>
      </article>
    `);
  }

  if (trainingState.revealOpen) {
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

    sections.push(`
      <div class="answer-key-row">
        <span>Accepted move${prompt.acceptedNodes.length === 1 ? "" : "s"}</span>
        <strong>${escapeHtml(trainerAcceptedMovesText(prompt))}</strong>
      </div>
      <div class="answer-card-grid">${answerCards}</div>
    `);
  }

  if (prompt.pendingRepairs.length && (trainingState.revealOpen || trainingState.whyOpen)) {
    sections.push(`
      <div class="repair-hint-stack">
        <div class="line-label">Open repair notes</div>
        ${prompt.pendingRepairs.map(repair => `
          <article class="repair-hint-card">
            <strong>${escapeHtml(repair.mistake || "Study repair")}</strong>
            <p><span>Lesson.</span> ${escapeHtml(repair.lesson || "No lesson captured yet.")}</p>
            <p><span>Repair.</span> ${escapeHtml(repair.repair || "No repair action captured yet.")}</p>
          </article>
        `).join("")}
      </div>
    `);
  }

  return sections.length ? `<div class="answer-key">${sections.join("")}</div>` : "";
}

function paintTrainer() {
  const trainerBoardEl = $("trainerBoard");
  if (!trainerBoardEl) return;

  synchronizeTrainingState();

  const rootCount = trainingRoots(trainingState.color).length;
  const promptCount = buildTrainingPromptGroups({
    color: trainingState.color,
    rootId: trainingState.rootId || undefined
  }).length;
  const prompt = trainingState.prompt;
  const selectedRoot = trainingState.rootId ? nodeById(trainingState.rootId) : null;
  const colorLabel = trainingState.color === "w" ? "White" : "Black";
  const whiteBtn = $("trainerColorWhiteBtn");
  const blackBtn = $("trainerColorBlackBtn");
  const rootSelect = $("trainerRootSelect");
  const startBtn = $("startTrainingBtn");
  const continueBtn = $("continueTrainingBtn");
  const nextBtn = $("nextTrainingBtn");
  const revealBtn = $("revealPromptBtn");
  const whyBtn = $("whyPromptBtn");
  const trainerSubmitBtn = $("trainerSubmitBtn");
  const trainerAnswerInput = $("trainerAnswerInput");

  if (whiteBtn) whiteBtn.classList.toggle("is-active", trainingState.color === "w");
  if (blackBtn) blackBtn.classList.toggle("is-active", trainingState.color === "b");

  if (rootSelect) {
    const roots = trainingRoots(trainingState.color);
    rootSelect.disabled = !roots.length;
    rootSelect.innerHTML = roots.length
      ? roots.map(root => `
          <option value="${root.id}" ${root.id === trainingState.rootId ? "selected" : ""}>
            ${escapeHtml(root.title || root.move)} (${escapeHtml(root.move)})
          </option>
        `).join("")
      : `<option value="">No ${colorLabel.toLowerCase()} roots ready yet</option>`;
  }

  if (startBtn) startBtn.disabled = !trainingState.rootId;
  if (nextBtn) nextBtn.disabled = !trainingState.rootId;
  if (revealBtn) revealBtn.disabled = !prompt;
  if (whyBtn) whyBtn.disabled = !prompt;
  if (trainerSubmitBtn) trainerSubmitBtn.disabled = !prompt;
  if (trainerAnswerInput) trainerAnswerInput.disabled = !prompt;

  const canContinue = Boolean(
    prompt &&
    (trainingState.result?.kind === "correct" || trainingState.revealOpen)
  );
  if (continueBtn) {
    continueBtn.disabled = !canContinue;
    continueBtn.textContent = "Continue line";
  }

  setText(
    "trainerQueueCount",
    rootCount
      ? `${promptCount} prompt${promptCount === 1 ? "" : "s"} ready in ${rootCount} ${rootCount === 1 ? "root" : "roots"}`
      : `0 ${colorLabel.toLowerCase()} roots ready`
  );

  if ($("trainerSelectionStatus")) {
    if (!selectedRoot) {
      setText("trainerSelectionStatus", `Choose a ${colorLabel.toLowerCase()} study root, then start a line that continues until your stored moves run out.`);
    } else if (trainingState.color === "b" && !selectedRoot.parent_id) {
      setText("trainerSelectionStatus", `Training ${colorLabel.toLowerCase()} in ${selectedRoot.title || selectedRoot.move}. This root is stored as a black-side starting anchor, then the line continues with opponent replies and your responses.`);
    } else {
      setText("trainerSelectionStatus", `Training ${colorLabel.toLowerCase()} in ${selectedRoot.title || selectedRoot.move}. Preferred moves count as correct answers whenever the position branches.`);
    }
  }

  setText("trainerSessionTitle", selectedRoot ? (selectedRoot.title || selectedRoot.move) : "Choose a study root");
  setText("trainerSessionSubtitle", selectedRoot ? `Current root move: ${selectedRoot.move}` : "Pick the opening or study root you want to drill.");
  setText("trainerProgressText", `${trainingState.solvedPrompts} solved prompt${trainingState.solvedPrompts === 1 ? "" : "s"} in this session.`);

  if (!selectedRoot) {
    setText("trainerPositionTitle", "Trainer waiting");
    setText("trainerTurnPill", "No line active");
    setText("trainerOpeningValue", `No ${colorLabel.toLowerCase()} root selected`);
    setText("trainerOpeningCaption", "Create or keep a root line available for training in the move editor.");
    setText("trainerOpponentMove", "Waiting");
    setText("trainerOpponentMeta", "The trainer will start speaking in positions as soon as you choose a root.");
    setHtml("trainerPositionLine", `<div class="line-empty">Create moves and leave them available for training to start drilling.</div>`);
    setText("trainerAcceptedMeta", `Only moves marked "Do not use for training" are hidden from this queue.`);
    setText("trainerHint", "Pick a color, pick a study root, then start the line.");
    setHtml("trainerFeedback", renderTrainerFeedback(null));
    setHtml("trainerReveal", "");
    trainerBoardEl.innerHTML = renderBoardSquares(boardFromFen(), null);
    return;
  }

  if (!prompt && trainingState.result?.kind !== "line-complete") {
    setText("trainerPositionTitle", "Line not started");
    setText("trainerTurnPill", "Ready to train");
    setText("trainerOpeningValue", selectedRoot.title || selectedRoot.move);
    setText("trainerOpeningCaption", `Stored root move: ${selectedRoot.move}`);
    setText("trainerOpponentMove", "Waiting");
    setText("trainerOpponentMeta", "Start a line and the trainer will surface the first board prompt.");
    setHtml("trainerPositionLine", `<div class="line-empty">Press "Start line" to drill this root from the board.</div>`);
    setText("trainerAcceptedMeta", "The trainer will accept preferred moves when the position branches.");
    setText("trainerHint", "Use Next line any time you want a fresh branch from the same root.");
    setHtml("trainerFeedback", renderTrainerFeedback(null));
    setHtml("trainerReveal", "");
    trainerBoardEl.innerHTML = renderBoardSquares(boardFromFen(), null);
    return;
  }

  const displayNode = prompt?.positionNode || trainingState.result?.node || null;
  const displayPath = displayNode ? pathNodesFor(displayNode) : [];
  const startingTurn = prompt?.positionId === null ? trainingState.color : "w";
  const attempt = displayPath.length ? bestBoardAttempt(displayPath) : null;
  const game = attempt?.game || createChessGame(startingTurn);
  const boardReady = Boolean(game);
  const rows = game ? boardRowsFromGame(game) : boardFromFen();

  setText("trainerPositionTitle", trainerAnswerTitle(prompt));
  setText("trainerTurnPill", boardReady ? colorToMoveText(game.turn()) : "Board waiting for chess.js");
  setText("trainerOpeningValue", selectedRoot.title || selectedRoot.move);
  setText("trainerOpeningCaption", `Training ${colorLabel.toLowerCase()} from ${selectedRoot.move}`);
  setText(
    "trainerOpponentMove",
    prompt?.lastOpponentNode
      ? prompt.lastOpponentNode.move
      : (trainingState.result?.kind === "line-complete" ? "Line complete" : "No opponent reply yet")
  );
  setText(
    "trainerOpponentMeta",
    prompt?.lastOpponentNode
      ? (prompt.lastOpponentNode.title || prompt.lastOpponentNode.explanation || "Tap 'Wanna know why?' to reveal the idea behind that reply.")
      : (trainingState.result?.kind === "line-complete"
          ? "The stored branch ended here."
          : "Your first prompt starts from the selected root.")
  );
  setHtml("trainerPositionLine", renderLineChips(displayPath, {
    emptyText: "The line starts from the initial position."
  }));
  setText(
    "trainerAcceptedMeta",
    prompt
      ? (prompt.acceptedNodes.length === 1
          ? "One repertoire move expected"
          : `${prompt.acceptedNodes.length} preferred moves accepted in this position`)
      : "Start another line whenever you want the next branch."
  );
  setText(
    "trainerHint",
    prompt?.pendingRepairs.length
      ? `Repair cue: ${prompt.pendingRepairs[0].lesson || prompt.pendingRepairs[0].mistake || prompt.pendingRepairs[0].repair}`
      : "Reveal the answer if you want the move note, or continue the branch after a correct answer."
  );
  setHtml("trainerFeedback", renderTrainerFeedback(prompt));
  setHtml("trainerReveal", renderTrainerDetails(prompt));
  trainerBoardEl.innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);

  if (revealBtn) {
    revealBtn.textContent = trainingState.revealOpen ? "Hide answer" : "Reveal answer";
  }

  if (whyBtn) {
    whyBtn.textContent = trainingState.whyOpen ? "Hide why" : "Wanna know why?";
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

function resetRepairForm({ keepSelectionLink = true, clearSelectedRepair = true } = {}) {
  const repairForm = $("repairForm");
  if (!repairForm) return;

  if (clearSelectedRepair) {
    setSelectedRepairId(null);
  }
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

  setSelectedRepairId(repair.id);
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
  renderDashboardHeatmap();
  renderDashboardGameQueue();
  renderDashboardSupportSummary();
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
  [
    nodes,
    repairs,
    games,
    gameAnnotations,
    positions,
    mistakes,
    supportCards,
    goals,
    appReminders,
    books,
    bookNotes,
    tournamentNotes,
    quickIdeas,
    reviewItems,
    repairAttempts
  ] = await Promise.all([
    OpeningDB.loadNodes(),
    OpeningDB.loadRepairItems(),
    OpeningDB.loadGames(),
    OpeningDB.loadGameAnnotations(),
    OpeningDB.loadPositions(),
    OpeningDB.loadMistakes(),
    OpeningDB.loadSupportCards(),
    OpeningDB.loadGoals(),
    OpeningDB.loadAppReminders(),
    OpeningDB.loadBooks(),
    OpeningDB.loadBookNotes(),
    OpeningDB.loadTournamentNotes(),
    OpeningDB.loadQuickIdeas(),
    OpeningDB.loadReviewItems ? OpeningDB.loadReviewItems() : Promise.resolve([]),
    OpeningDB.loadRepairAttempts ? OpeningDB.loadRepairAttempts() : Promise.resolve([])
  ]);

  if (selectedId && !nodeById(selectedId)) {
    setSelectedNodeId(null);
  }

  if (selectedRepairId && !repairById(selectedRepairId)) {
    setSelectedRepairId(null);
  }

  synchronizeTrainingState();

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
  maybePromptForBackups();
}

function backupPayload() {
  return {
    version: 8,
    exported_at: new Date().toISOString(),
    nodes,
    repairs,
    games,
    game_annotations: gameAnnotations,
    positions,
    mistakes,
    support_cards: supportCards,
    goals,
    app_reminders: appReminders,
    books,
    book_notes: bookNotes,
    tournament_notes: tournamentNotes,
    quick_ideas: quickIdeas,
    review_items: reviewItems,
    repair_attempts: repairAttempts,
    board_settings: getStoredBoardAppearance()
  };
}

function openingNodesPayload() {
  return {
    table: window.APP_CONFIG?.TABLE_NAME || "opening_nodes",
    exported_at: new Date().toISOString(),
    count: nodes.length,
    rows: nodes
  };
}

function repairItemsPayload() {
  return {
    table: window.APP_CONFIG?.REPAIR_TABLE_NAME || "repair_items",
    exported_at: new Date().toISOString(),
    count: repairs.length,
    rows: repairs
  };
}

function gamesPayload() {
  return {
    table: window.APP_CONFIG?.GAMES_TABLE_NAME || "games",
    exported_at: new Date().toISOString(),
    count: games.length,
    rows: games
  };
}

function gameAnnotationsPayload() {
  return {
    table: window.APP_CONFIG?.GAME_ANNOTATIONS_TABLE_NAME || "game_annotations",
    exported_at: new Date().toISOString(),
    count: gameAnnotations.length,
    rows: gameAnnotations
  };
}

function positionsPayload() {
  return {
    table: window.APP_CONFIG?.POSITIONS_TABLE_NAME || "positions",
    exported_at: new Date().toISOString(),
    count: positions.length,
    rows: positions
  };
}

function mistakesPayload() {
  return {
    table: window.APP_CONFIG?.MISTAKES_TABLE_NAME || "mistakes",
    exported_at: new Date().toISOString(),
    count: mistakes.length,
    rows: mistakes
  };
}

function supportCardsPayload() {
  return {
    table: window.APP_CONFIG?.SUPPORT_CARDS_TABLE_NAME || "support_cards",
    exported_at: new Date().toISOString(),
    count: supportCards.length,
    rows: supportCards
  };
}

function goalsPayload() {
  return {
    table: window.APP_CONFIG?.GOALS_TABLE_NAME || "goals",
    exported_at: new Date().toISOString(),
    count: goals.length,
    rows: goals
  };
}

function appRemindersPayload() {
  return {
    table: window.APP_CONFIG?.APP_REMINDERS_TABLE_NAME || "app_reminders",
    exported_at: new Date().toISOString(),
    count: appReminders.length,
    rows: appReminders
  };
}

function booksPayload() {
  return {
    table: window.APP_CONFIG?.BOOKS_TABLE_NAME || "books",
    exported_at: new Date().toISOString(),
    count: books.length,
    rows: books
  };
}

function bookNotesPayload() {
  return {
    table: window.APP_CONFIG?.BOOK_NOTES_TABLE_NAME || "book_notes",
    exported_at: new Date().toISOString(),
    count: bookNotes.length,
    rows: bookNotes
  };
}

function tournamentNotesPayload() {
  return {
    table: window.APP_CONFIG?.TOURNAMENT_NOTES_TABLE_NAME || "tournament_notes",
    exported_at: new Date().toISOString(),
    count: tournamentNotes.length,
    rows: tournamentNotes
  };
}

function quickIdeasPayload() {
  return {
    table: window.APP_CONFIG?.QUICK_IDEAS_TABLE_NAME || "quick_ideas",
    exported_at: new Date().toISOString(),
    count: quickIdeas.length,
    rows: quickIdeas
  };
}

function reviewItemsPayload() {
  return {
    table: window.APP_CONFIG?.REVIEW_ITEMS_TABLE_NAME || "review_items",
    exported_at: new Date().toISOString(),
    count: reviewItems.length,
    rows: reviewItems
  };
}

function repairAttemptsPayload() {
  return {
    table: window.APP_CONFIG?.REPAIR_ATTEMPTS_TABLE_NAME || "repair_attempts",
    exported_at: new Date().toISOString(),
    count: repairAttempts.length,
    rows: repairAttempts
  };
}

function exportOpeningNodesJson() {
  downloadJsonFile("gm-opening-tree-opening-nodes.json", openingNodesPayload());
  showToast("Opening nodes exported.");
}

function exportRepairItemsJson() {
  downloadJsonFile("gm-opening-tree-repair-items.json", repairItemsPayload());
  showToast("Repair items exported.");
}

function exportGamesJson() {
  downloadJsonFile("gm-brain-games.json", gamesPayload());
  showToast("Games exported.");
}

function exportGameAnnotationsJson() {
  downloadJsonFile("gm-brain-game-annotations.json", gameAnnotationsPayload());
  showToast("Game annotations exported.");
}

function exportPositionsJson() {
  downloadJsonFile("gm-brain-positions.json", positionsPayload());
  showToast("Positions exported.");
}

function exportMistakesJson() {
  downloadJsonFile("gm-brain-mistakes.json", mistakesPayload());
  showToast("Mistakes exported.");
}

function exportSupportCardsJson() {
  downloadJsonFile("gm-brain-support-cards.json", supportCardsPayload());
  showToast("Support cards exported.");
}

function exportGoalsJson() {
  downloadJsonFile("gm-brain-goals.json", goalsPayload());
  showToast("Goals exported.");
}

function exportAppRemindersJson() {
  downloadJsonFile("gm-brain-app-reminders.json", appRemindersPayload());
  showToast("App reminders exported.");
}

function exportBooksJson() {
  downloadJsonFile("gm-brain-books.json", booksPayload());
  showToast("Books exported.");
}

function exportBookNotesJson() {
  downloadJsonFile("gm-brain-book-notes.json", bookNotesPayload());
  showToast("Book notes exported.");
}

function exportTournamentNotesJson() {
  downloadJsonFile("gm-brain-tournament-notes.json", tournamentNotesPayload());
  showToast("Tournament notes exported.");
}

function exportQuickIdeasJson() {
  downloadJsonFile("gm-brain-quick-ideas.json", quickIdeasPayload());
  showToast("Quick ideas exported.");
}

function exportReviewItemsJson() {
  downloadJsonFile("gm-brain-review-items.json", reviewItemsPayload());
  showToast("Review items exported.");
}

function exportRepairAttemptsJson() {
  downloadJsonFile("gm-brain-repair-attempts.json", repairAttemptsPayload());
  showToast("Repair attempts exported.");
}

function exportFullBackupJson() {
  downloadJsonFile("gm-brain-full-backup.json", backupPayload());
  showToast("Full backup exported.");
}

function exportAllSafetyBackups() {
  const tasks = [
    exportFullBackupJson,
    exportOpeningNodesJson,
    exportRepairItemsJson,
    exportGamesJson,
    exportGameAnnotationsJson,
    exportPositionsJson,
    exportMistakesJson,
    exportSupportCardsJson,
    exportGoalsJson,
    exportAppRemindersJson,
    exportBooksJson,
    exportBookNotesJson,
    exportTournamentNotesJson,
    exportQuickIdeasJson,
    exportReviewItemsJson,
    exportRepairAttemptsJson
  ];

  tasks.forEach((task, index) => {
    window.setTimeout(task, index * 140);
  });
}

function exportAllTableSnapshots() {
  const tasks = [
    exportOpeningNodesJson,
    exportRepairItemsJson,
    exportGamesJson,
    exportGameAnnotationsJson,
    exportPositionsJson,
    exportMistakesJson,
    exportSupportCardsJson,
    exportGoalsJson,
    exportAppRemindersJson,
    exportBooksJson,
    exportBookNotesJson,
    exportTournamentNotesJson,
    exportQuickIdeasJson,
    exportReviewItemsJson,
    exportRepairAttemptsJson
  ];

  tasks.forEach((task, index) => {
    window.setTimeout(task, index * 120);
  });
}

function ensureBackupPrompt() {
  let dialog = $("backupPromptDialog");
  if (dialog) return dialog;

  dialog = document.createElement("div");
  dialog.id = "backupPromptDialog";
  dialog.className = "backup-prompt hidden";
  dialog.innerHTML = `
    <div class="backup-prompt-card" role="dialog" aria-modal="true" aria-labelledby="backupPromptTitle">
      <p class="eyebrow">Safety export</p>
      <h3 id="backupPromptTitle">Download your full backup before you work.</h3>
      <p class="muted">
        This quick safety step exports one full JSON restore file plus the current table snapshots for moves, repairs, games, annotations, positions, reviews, repair attempts, and the Support Hub collections.
      </p>
      <div class="backup-prompt-meta">
        <span id="backupPromptNodeCount" class="status-pill">0 opening nodes</span>
        <span id="backupPromptRepairCount" class="status-pill">0 repair items</span>
        <span id="backupPromptGameCount" class="status-pill">0 games</span>
        <span id="backupPromptPositionCount" class="status-pill">0 positions</span>
        <span id="backupPromptSupportCardCount" class="status-pill">0 support cards</span>
        <span id="backupPromptGoalCount" class="status-pill">0 active goals</span>
        <span id="backupPromptReminderCount" class="status-pill">0 reminders</span>
        <span id="backupPromptBookCount" class="status-pill">0 books</span>
      </div>
      <div class="backup-prompt-actions">
        <button id="backupExportAllBtn" class="button button-primary" type="button">Export everything now</button>
        <button id="backupExportFullBtn" class="button button-secondary" type="button">Full backup JSON</button>
        <button id="backupExportTablesBtn" class="button button-secondary" type="button">All table snapshots</button>
        <button id="backupDismissBtn" class="button button-ghost" type="button">Later</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  $("backupExportAllBtn")?.addEventListener("click", () => {
    exportAllSafetyBackups();
    hideBackupPrompt();
  });
  $("backupExportFullBtn")?.addEventListener("click", exportFullBackupJson);
  $("backupExportTablesBtn")?.addEventListener("click", exportAllTableSnapshots);
  $("backupDismissBtn")?.addEventListener("click", hideBackupPrompt);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) hideBackupPrompt();
  });

  return dialog;
}

function showBackupPrompt() {
  const dialog = ensureBackupPrompt();
  setText("backupPromptNodeCount", `${nodes.length} opening node${nodes.length === 1 ? "" : "s"}`);
  setText("backupPromptRepairCount", `${repairs.length} repair item${repairs.length === 1 ? "" : "s"}`);
  setText("backupPromptGameCount", `${games.length} game${games.length === 1 ? "" : "s"}`);
  setText("backupPromptPositionCount", `${positions.length} position${positions.length === 1 ? "" : "s"}`);
  setText("backupPromptSupportCardCount", `${supportCards.length} support card${supportCards.length === 1 ? "" : "s"}`);
  setText("backupPromptGoalCount", `${goals.filter(goal => goal.status === "active").length} active goal${goals.filter(goal => goal.status === "active").length === 1 ? "" : "s"}`);
  setText("backupPromptReminderCount", `${appReminders.length} reminder${appReminders.length === 1 ? "" : "s"}`);
  setText("backupPromptBookCount", `${books.length} book${books.length === 1 ? "" : "s"}`);
  dialog.classList.remove("hidden");
  sessionStorage.setItem(BACKUP_PROMPT_SESSION_KEY, "seen");
}

function hideBackupPrompt() {
  $("backupPromptDialog")?.classList.add("hidden");
}

function maybePromptForBackups() {
  if (sessionStorage.getItem(BACKUP_PROMPT_SESSION_KEY)) return;
  showBackupPrompt();
}

function parseImportedBackup(text) {
  const parsed = JSON.parse(text);

  if (Array.isArray(parsed)) {
    return {
      nodes: parsed.map(OpeningDB.normalizeNode),
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Backup file is not a valid JSON object.");
  }

  if (parsed.table === (window.APP_CONFIG?.TABLE_NAME || "opening_nodes") && Array.isArray(parsed.rows)) {
    return {
      nodes: parsed.rows.map(OpeningDB.normalizeNode),
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.REPAIR_TABLE_NAME || "repair_items") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs: parsed.rows.map(OpeningDB.normalizeRepairItem),
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.GAMES_TABLE_NAME || "games") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games: parsed.rows.map(OpeningDB.normalizeGame),
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.GAME_ANNOTATIONS_TABLE_NAME || "game_annotations") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations: parsed.rows.map(OpeningDB.normalizeGameAnnotation),
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.POSITIONS_TABLE_NAME || "positions") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions: parsed.rows.map(OpeningDB.normalizePosition),
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.MISTAKES_TABLE_NAME || "mistakes") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes: parsed.rows.map(OpeningDB.normalizeMistake),
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.SUPPORT_CARDS_TABLE_NAME || "support_cards") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards: parsed.rows.map(OpeningDB.normalizeSupportCard),
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.GOALS_TABLE_NAME || "goals") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals: parsed.rows.map(OpeningDB.normalizeGoal),
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.APP_REMINDERS_TABLE_NAME || "app_reminders") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders: parsed.rows.map(OpeningDB.normalizeAppReminder),
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.BOOKS_TABLE_NAME || "books") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books: parsed.rows.map(OpeningDB.normalizeBook),
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.BOOK_NOTES_TABLE_NAME || "book_notes") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes: parsed.rows.map(OpeningDB.normalizeBookNote),
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.TOURNAMENT_NOTES_TABLE_NAME || "tournament_notes") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes: parsed.rows.map(OpeningDB.normalizeTournamentNote),
      quickIdeas,
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.QUICK_IDEAS_TABLE_NAME || "quick_ideas") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas: parsed.rows.map(OpeningDB.normalizeQuickIdea),
      reviewItems,
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.REVIEW_ITEMS_TABLE_NAME || "review_items") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems: parsed.rows.map(OpeningDB.normalizeReviewItem),
      repairAttempts,
      boardSettings: getStoredBoardAppearance()
    };
  }

  if (parsed.table === (window.APP_CONFIG?.REPAIR_ATTEMPTS_TABLE_NAME || "repair_attempts") && Array.isArray(parsed.rows)) {
    return {
      nodes,
      repairs,
      games,
      gameAnnotations,
      positions,
      mistakes,
      supportCards,
      goals,
      appReminders,
      books,
      bookNotes,
      tournamentNotes,
      quickIdeas,
      reviewItems,
      repairAttempts: parsed.rows.map(OpeningDB.normalizeRepairAttempt),
      boardSettings: getStoredBoardAppearance()
    };
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
    repairs: Array.isArray(parsed.repairs) ? parsed.repairs.map(OpeningDB.normalizeRepairItem) : repairs,
    games: Array.isArray(parsed.games) ? parsed.games.map(OpeningDB.normalizeGame) : games,
    gameAnnotations: Array.isArray(parsed.game_annotations)
      ? parsed.game_annotations.map(OpeningDB.normalizeGameAnnotation)
      : gameAnnotations,
    positions: Array.isArray(parsed.positions) ? parsed.positions.map(OpeningDB.normalizePosition) : positions,
    mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes.map(OpeningDB.normalizeMistake) : mistakes,
    supportCards: Array.isArray(parsed.support_cards) ? parsed.support_cards.map(OpeningDB.normalizeSupportCard) : supportCards,
    goals: Array.isArray(parsed.goals) ? parsed.goals.map(OpeningDB.normalizeGoal) : goals,
    appReminders: Array.isArray(parsed.app_reminders) ? parsed.app_reminders.map(OpeningDB.normalizeAppReminder) : appReminders,
    books: Array.isArray(parsed.books) ? parsed.books.map(OpeningDB.normalizeBook) : books,
    bookNotes: Array.isArray(parsed.book_notes) ? parsed.book_notes.map(OpeningDB.normalizeBookNote) : bookNotes,
    tournamentNotes: Array.isArray(parsed.tournament_notes)
      ? parsed.tournament_notes.map(OpeningDB.normalizeTournamentNote)
      : tournamentNotes,
    quickIdeas: Array.isArray(parsed.quick_ideas) ? parsed.quick_ideas.map(OpeningDB.normalizeQuickIdea) : quickIdeas,
    reviewItems: Array.isArray(parsed.review_items) ? parsed.review_items.map(OpeningDB.normalizeReviewItem) : reviewItems,
    repairAttempts: Array.isArray(parsed.repair_attempts)
      ? parsed.repair_attempts.map(OpeningDB.normalizeRepairAttempt)
      : repairAttempts,
    boardSettings: parsed.board_settings && typeof parsed.board_settings === "object"
      ? parsed.board_settings
      : getStoredBoardAppearance()
  };
}

function applyImportedBoardSettings(settings) {
  const resolved = applyBoardAppearance(settings || getStoredBoardAppearance());
  const boardAppearanceBtn = $("boardAppearanceBtn");
  if (boardAppearanceBtn) {
    boardAppearanceBtn.textContent = boardAppearanceSummary(resolved);
  }
}

const dashboardGameQueue = $("dashboardGameQueue");
if (dashboardGameQueue) {
  dashboardGameQueue.addEventListener("click", event => {
    const button = event.target.closest("[data-game-id]");
    if (!button) return;

    localStorage.setItem("gm_brain_selected_game_v1", button.dataset.gameId);
    localStorage.setItem("gm_brain_selected_game_ply_v1", "0");
    window.location.href = "./games.html";
  });
}

const moveForm = $("moveForm");
if (moveForm) {
  moveForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const existing = nodeById(selectedId);
      const node = getFormNode(existing?.parent_id || null, selectedId || null);
      await OpeningDB.upsertNode(node);
      setSelectedNodeId(node.id);

      await refresh();
      showToast(navigator.onLine ? "Move saved." : "Move saved locally.");
    } catch (error) {
      reportActionError("Saving move", error);
    }
  });
}

const repairForm = $("repairForm");
if (repairForm) {
  repairForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
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
      setSelectedRepairId(repair.id);

      await refresh();
      showToast(navigator.onLine ? "Repair saved." : "Repair saved locally.");
    } catch (error) {
      reportActionError("Saving repair", error);
    }
  });
}

const trainerForm = $("trainerForm");
if (trainerForm) {
  trainerForm.addEventListener("submit", event => {
    event.preventDefault();

    const prompt = trainingState.prompt;
    if (!prompt) return;

    const answer = $("trainerAnswerInput").value.trim();
    if (!answer) return;

    const acceptedNode = prompt.acceptedNodes.find(node => moveTextMatches(answer, node.move));

    if (acceptedNode) {
      trainingState.result = { kind: "correct", node: acceptedNode };
    } else {
      const siblingNode = prompt.allChildren.find(node => moveTextMatches(answer, node.move));
      if (siblingNode?.exclude_from_training) {
        trainingState.result = { kind: "excluded-branch", node: siblingNode };
      } else if (siblingNode) {
        trainingState.result = { kind: "tree-branch", node: siblingNode };
      } else {
        trainingState.result = { kind: "incorrect" };
      }
    }

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
      setSelectedRepairId(null);
      if (selectedId) populateEditor(nodeById(selectedId));
      else populateEditor(null);
      paint();
      return;
    }

    if (event.target.closest("#rootLineBtn")) {
      setSelectedNodeId(null);
      setSelectedRepairId(null);
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
      try {
        await OpeningDB.upsertRepairItem({
          ...repair,
          status: repair.status === "solved" ? "needs_work" : "solved"
        });
        await refresh();
        showToast(repair.status === "solved" ? "Repair reopened." : "Repair marked solved.");
      } catch (error) {
        reportActionError("Updating repair status", error);
      }
      return;
    }

    if (action === "delete" && confirm("Delete this repair loop?")) {
      try {
        if (selectedRepairId === repair.id) {
          setSelectedRepairId(null);
          resetRepairForm({ keepSelectionLink: true });
        }
        await OpeningDB.deleteRepairItem(repair.id);
        await refresh();
        showToast("Repair deleted.");
      } catch (error) {
        reportActionError("Deleting repair", error);
      }
    }
  });
}

const newRootBtn = $("newRootBtn");
if (newRootBtn) newRootBtn.addEventListener("click", resetEditorForNewRoot);

const addChildBtn = $("addChildBtn");
if (addChildBtn) {
  addChildBtn.addEventListener("click", async () => {
    if (!selectedId) return;

    try {
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
      showToast(navigator.onLine ? "Child move added." : "Child move added locally.");
    } catch (error) {
      reportActionError("Adding child move", error);
    }
  });
}

const deleteBtn = $("deleteBtn");
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    if (!selectedId || !confirm("Delete this move and all child lines?")) return;

    try {
      const deletedNode = nodeById(selectedId);
      setSelectedNodeId(deletedNode?.parent_id || null);
      await OpeningDB.deleteNodeAndChildren(deletedNode.id);

      await refresh();
      showToast("Move deleted.");
    } catch (error) {
      reportActionError("Deleting move", error);
    }
  });
}

const syncBtn = $("syncBtn");
if (syncBtn) {
  syncBtn.addEventListener("click", async () => {
    try {
      await refresh();
      showToast(navigator.onLine ? "Workspace synced." : "Offline mode active. Using your local copy.");
    } catch (error) {
      reportActionError("Syncing data", error);
    }
  });
}

const trainerColorWhiteBtn = $("trainerColorWhiteBtn");
if (trainerColorWhiteBtn) {
  trainerColorWhiteBtn.addEventListener("click", () => switchTrainingColor("w"));
}

const trainerColorBlackBtn = $("trainerColorBlackBtn");
if (trainerColorBlackBtn) {
  trainerColorBlackBtn.addEventListener("click", () => switchTrainingColor("b"));
}

const trainerRootSelect = $("trainerRootSelect");
if (trainerRootSelect) {
  trainerRootSelect.addEventListener("change", event => {
    trainingState.rootId = event.target.value || null;
    trainingState.prompt = null;
    trainingState.result = null;
    trainingState.revealOpen = false;
    trainingState.whyOpen = false;
    trainingState.lastOpponentNodeId = null;
    paintTrainer();
  });
}

const startTrainingBtn = $("startTrainingBtn");
if (startTrainingBtn) {
  startTrainingBtn.addEventListener("click", beginTrainingLine);
}

const continueTrainingBtn = $("continueTrainingBtn");
if (continueTrainingBtn) {
  continueTrainingBtn.addEventListener("click", () => {
    const prompt = trainingState.prompt;
    if (!prompt) return;

    const chosenNode = trainingState.result?.kind === "correct"
      ? trainingState.result.node
      : prompt.acceptedNodes[0];
    continueTrainingLine(chosenNode);
  });
}

const nextTrainingBtn = $("nextTrainingBtn");
if (nextTrainingBtn) {
  nextTrainingBtn.addEventListener("click", beginTrainingLine);
}

const revealPromptBtn = $("revealPromptBtn");
if (revealPromptBtn) {
  revealPromptBtn.addEventListener("click", () => {
    if (!trainingState.prompt) return;
    trainingState.revealOpen = !trainingState.revealOpen;
    paintTrainer();
  });
}

const whyPromptBtn = $("whyPromptBtn");
if (whyPromptBtn) {
  whyPromptBtn.addEventListener("click", () => {
    if (!trainingState.prompt) return;
    trainingState.whyOpen = !trainingState.whyOpen;
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
  exportBtn.addEventListener("click", exportAllSafetyBackups);
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
      await OpeningDB.saveAllGames(imported.games, { allowEmpty: true });
      await OpeningDB.saveAllGameAnnotations(imported.gameAnnotations, { allowEmpty: true });
      await OpeningDB.saveAllPositions(imported.positions, { allowEmpty: true });
      await OpeningDB.saveAllMistakes(imported.mistakes, { allowEmpty: true });
      await OpeningDB.saveAllSupportCards(imported.supportCards, { allowEmpty: true });
      await OpeningDB.saveAllGoals(imported.goals, { allowEmpty: true });
      await OpeningDB.saveAllAppReminders(imported.appReminders, { allowEmpty: true });
      await OpeningDB.saveAllBooks(imported.books, { allowEmpty: true });
      await OpeningDB.saveAllBookNotes(imported.bookNotes, { allowEmpty: true });
      await OpeningDB.saveAllTournamentNotes(imported.tournamentNotes, { allowEmpty: true });
      await OpeningDB.saveAllQuickIdeas(imported.quickIdeas, { allowEmpty: true });
      await OpeningDB.saveAllReviewItems(imported.reviewItems, { allowEmpty: true });
      await OpeningDB.saveAllRepairAttempts(imported.repairAttempts, { allowEmpty: true });
      applyImportedBoardSettings(imported.boardSettings);
      setSelectedNodeId(null);
      setSelectedRepairId(null);
      trainingState.prompt = null;
      trainingState.result = null;
      trainingState.revealOpen = false;
      trainingState.whyOpen = false;
      trainingState.lastOpponentNodeId = null;
      await refresh();
      showToast("Backup imported.");
    } catch (error) {
      console.error("Import failed:", error);
      alert(`Import failed: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
}

if ($("moveInput")) populateEditor(null);
if ($("repairForm")) resetRepairForm({ keepSelectionLink: false, clearSelectedRepair: false });
try {
  await refresh();
} catch (error) {
  reportActionError("Loading data", error);
}
