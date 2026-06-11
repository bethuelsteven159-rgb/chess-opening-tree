import { requireOnlyMe } from "./auth/only-me-guard.js";
import { initPageChrome } from "./ui-shell.js";
import { ensureReviewItem } from "./review-utils.js";
import {
  $,
  boardViewFromFen,
  escapeHtml,
  gameTitle,
  reportActionError,
  setHtml,
  setText,
  showToast,
  tagsFromCommaText
} from "./chess-brain-utils.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/positions.js.");
}

const SELECTED_POSITION_STORAGE_KEY = "gm_brain_selected_position_v1";
const SELECTED_GAME_STORAGE_KEY = "gm_brain_selected_game_v1";
const SELECTED_GAME_PLY_STORAGE_KEY = "gm_brain_selected_game_ply_v1";
const SELECTED_NODE_STORAGE_KEY = "gm_opening_tree_selected_node_v1";
const SELECTED_REPAIR_STORAGE_KEY = "gm_brain_selected_repair_v1";

let nodes = [];
let games = [];
let repairs = [];
let positions = [];
let mistakes = [];
let reviewItems = [];
let selectedPositionId = localStorage.getItem(SELECTED_POSITION_STORAGE_KEY) || null;

function saveSelection() {
  if (selectedPositionId) localStorage.setItem(SELECTED_POSITION_STORAGE_KEY, selectedPositionId);
  else localStorage.removeItem(SELECTED_POSITION_STORAGE_KEY);
}

function selectedPosition() {
  return positions.find(position => position.id === selectedPositionId) || null;
}

function linkedGame(position) {
  return games.find(game => game.id === position?.linked_game_id) || null;
}

function linkedRepair(position) {
  return repairs.find(repair => repair.id === position?.linked_repair_id) || null;
}

function linkedOpening(position) {
  return nodes.find(node => node.id === position?.linked_opening_node_id) || null;
}

function reviewItemForPosition(id) {
  return reviewItems.find(item => item.source_type === "position" && item.source_id === id) || null;
}

function selectPosition(id) {
  selectedPositionId = id || null;
  saveSelection();
  paint();
}

function filteredPositions() {
  const type = $("positionTypeFilter")?.value || "all";
  const search = ($("positionSearchInput")?.value || "").trim().toLowerCase();

  return positions.filter(position => {
    if (type !== "all" && position.position_type !== type) return false;
    if (!search) return true;

    const haystack = [
      position.title,
      position.short_question,
      position.lesson,
      position.correct_idea,
      position.wrong_idea,
      position.human_evaluation,
      position.pgn_context,
      position.source_type,
      position.source_label,
      position.source_url,
      ...(position.themes || []),
      ...(position.tags || [])
    ].join(" ").toLowerCase();

    return haystack.includes(search);
  });
}

function renderStats() {
  const repairCount = positions.filter(position => position.linked_repair_id).length;
  setText("positionCountPill", `${positions.length} position${positions.length === 1 ? "" : "s"}`);
  setText("positionRepairPill", `${repairCount} linked repair${repairCount === 1 ? "" : "s"}`);
}

function renderPositionList() {
  const list = $("positionList");
  if (!list) return;

  list.innerHTML = filteredPositions().map(position => {
    const selectedClass = position.id === selectedPositionId ? " is-active" : "";
    const sourceGame = linkedGame(position);

    return `
      <button class="position-list-card${selectedClass}" data-position-id="${position.id}" type="button">
        <span class="study-choice-kicker">${escapeHtml(position.position_type || "position")}</span>
        <strong>${escapeHtml(position.title || "Untitled position")}</strong>
        <span class="muted">${escapeHtml(position.short_question || sourceGame?.opening_name || "No question yet")}</span>
        <div class="game-list-meta">
          <span>${escapeHtml(position.side_to_move === "b" ? "Black to move" : "White to move")}</span>
          <span>${escapeHtml(sourceGame ? gameTitle(sourceGame) : position.source_label || position.source_type || "No source")}</span>
        </div>
      </button>
    `;
  }).join("") || `
    <div class="support-empty-state">
      <div>
        <strong>No positions stored yet.</strong>
        <p>Paste a FEN in the manual form above, or open <code>Games</code> and press <code>Save position card</code>.</p>
      </div>
    </div>
  `;
}

function renderBoard() {
  const position = selectedPosition();
  const board = $("positionBoard");
  if (!board) return;

  if (!position) {
    const view = boardViewFromFen("");
    board.innerHTML = view.html;
    setText("positionBoardTitle", "No position selected");
    setText("positionBoardSubtitle", "Manual positions and game-linked positions both appear here.");
    setText("positionBoardMeta", "Waiting for position");
    setText("positionTypeValue", "Position");
    setText("positionTypeCaption", "The stored position family will appear here.");
    setText("positionSourceValue", "No source yet");
    setText("positionSourceCaption", "Book, video, game, or manual source details appear here.");
    setText("positionLinkedValue", "No repair yet");
    setText("positionLinkedCaption", "Mistakes and repairs linked to this position will be summarized here.");
    setText("positionContextValue", "Stored move context will show here when a position is tied to a game or line.");
    return;
  }

  const sourceGame = linkedGame(position);
  const repair = linkedRepair(position);
  const opening = linkedOpening(position);
  const relatedMistakes = mistakes.filter(mistake => mistake.position_id === position.id);
  const view = boardViewFromFen(position.fen || "");

  board.innerHTML = view.html;
  setText("positionBoardTitle", position.title || "Untitled position");
  setText("positionBoardSubtitle", position.short_question || "No question saved yet.");
  setText("positionBoardMeta", view.turnText);
  setText("positionTypeValue", position.position_type || "Position");
  setText("positionTypeCaption", position.human_evaluation || "Add a quick human evaluation to orient the board.");
  setText("positionSourceValue", sourceGame ? gameTitle(sourceGame) : (position.source_label || position.source_type || "No source yet"));
  setText(
    "positionSourceCaption",
    [
      position.source_url,
      sourceGame?.opening_name,
      opening?.title || opening?.move,
      sourceGame?.result
    ].filter(Boolean).join(" • ") || "No linked opening or source game metadata yet."
  );
  setText("positionLinkedValue", repair ? "Repair linked" : `${relatedMistakes.length} mistake${relatedMistakes.length === 1 ? "" : "s"}`);
  setText(
    "positionLinkedCaption",
    repair
      ? `${repair.status === "solved" ? "Solved" : "Needs work"} • ${repair.mistake}`
      : (relatedMistakes[0]?.title || "Create a repair later if this pattern keeps recurring.")
  );
  setText("positionContextValue", position.pgn_context || "No move context saved yet.");
}

function renderEditor() {
  const position = selectedPosition();
  const disabled = !position;

  setText("positionEditorState", position
    ? `Editing ${position.title || "selected position"}.`
    : "Select a saved vault entry to edit the human question, move idea, lesson, and review settings.");
  setText("positionLinkBanner", position
    ? `${position.source_label || position.source_type || "position"} source • ${position.side_to_move === "b" ? "Black to move" : "White to move"}`
    : "No position selected yet. Manual or game-linked positions will appear here.");

  if ($("positionTitleInput")) $("positionTitleInput").value = position?.title || "";
  if ($("positionQuestionInput")) $("positionQuestionInput").value = position?.short_question || "";
  if ($("positionTypeInput")) $("positionTypeInput").value = position?.position_type || "middlegame";
  if ($("positionSourceTypeInput")) $("positionSourceTypeInput").value = position?.source_type || "manual";
  if ($("positionSourceLabelInput")) $("positionSourceLabelInput").value = position?.source_label || "";
  if ($("positionSourceUrlInput")) $("positionSourceUrlInput").value = position?.source_url || "";
  if ($("positionThemesInput")) $("positionThemesInput").value = (position?.themes || []).join(", ");
  if ($("positionTagsInput")) $("positionTagsInput").value = (position?.tags || []).join(", ");
  if ($("positionEvaluationInput")) $("positionEvaluationInput").value = position?.human_evaluation || "";
  if ($("positionBestMoveInput")) $("positionBestMoveInput").value = position?.best_human_move || "";
  if ($("positionCandidateMovesInput")) $("positionCandidateMovesInput").value = (position?.candidate_moves || []).join(", ");
  if ($("positionDifficultyInput")) $("positionDifficultyInput").value = position?.difficulty || "";
  if ($("positionPriorityInput")) $("positionPriorityInput").value = position?.priority || "";
  if ($("positionCorrectIdeaInput")) $("positionCorrectIdeaInput").value = position?.correct_idea || "";
  if ($("positionWrongIdeaInput")) $("positionWrongIdeaInput").value = position?.wrong_idea || "";
  if ($("positionLessonInput")) $("positionLessonInput").value = position?.lesson || "";
  if ($("positionReviewEnabledInput")) $("positionReviewEnabledInput").checked = position?.review_enabled !== false;

  [
    "positionTitleInput",
    "positionQuestionInput",
    "positionTypeInput",
    "positionSourceTypeInput",
    "positionSourceLabelInput",
    "positionSourceUrlInput",
    "positionThemesInput",
    "positionTagsInput",
    "positionEvaluationInput",
    "positionBestMoveInput",
    "positionCandidateMovesInput",
    "positionDifficultyInput",
    "positionPriorityInput",
    "positionCorrectIdeaInput",
    "positionWrongIdeaInput",
    "positionLessonInput",
    "positionReviewEnabledInput",
    "savePositionBtn",
    "deletePositionBtn"
  ].forEach(id => {
    const element = $(id);
    if (element) element.disabled = disabled;
  });
}

function renderLinks() {
  const position = selectedPosition();
  const disabled = !position;
  const sourceGame = linkedGame(position);
  const opening = linkedOpening(position);
  const repair = linkedRepair(position);
  const relatedMistakes = mistakes.filter(mistake => mistake.position_id === position?.id);

  ["openPositionGameBtn", "openPositionEditorBtn", "openPositionRepairBtn"].forEach(id => {
    const element = $(id);
    if (!element) return;
    element.disabled = disabled;
  });

  if ($("openPositionGameBtn")) $("openPositionGameBtn").disabled = disabled || !sourceGame;
  if ($("openPositionEditorBtn")) $("openPositionEditorBtn").disabled = disabled || !opening;
  if ($("openPositionRepairBtn")) $("openPositionRepairBtn").disabled = disabled || !repair;

  setHtml("positionLinksSummary", `
    <div class="line-label">Linked summary</div>
    <div class="position-links-copy">
      ${position ? `
        <p><strong>Game:</strong> ${escapeHtml(sourceGame ? gameTitle(sourceGame) : "Not linked")}</p>
        <p><strong>Opening:</strong> ${escapeHtml(opening?.title || opening?.move || "Not linked")}</p>
        <p><strong>Repair:</strong> ${escapeHtml(repair?.mistake || "No repair linked yet")}</p>
        <p><strong>Mistakes:</strong> ${relatedMistakes.length} linked record${relatedMistakes.length === 1 ? "" : "s"}</p>
      ` : `<div class="line-empty">No linked position selected yet.</div>`}
    </div>
  `);
}

function paint() {
  renderStats();
  renderPositionList();
  renderBoard();
  renderEditor();
  renderLinks();
}

function completeFen(fenText, sideToMove = "w") {
  const trimmed = String(fenText || "").trim();
  if (!trimmed) return "";

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return `${parts[0]} ${sideToMove} - - 0 1`;
  if (parts.length === 2) return `${parts[0]} ${parts[1]} - - 0 1`;
  return trimmed;
}

function validateFen(fenText, sideToMove = "w") {
  const normalized = completeFen(fenText, sideToMove);
  if (!normalized) throw new Error("Paste a FEN first.");
  if (typeof window.Chess !== "function") throw new Error("chess.js is not available in this session.");

  const game = new window.Chess();
  const loaded = typeof game.load === "function" ? game.load(normalized) : false;
  if (loaded === false) throw new Error("That FEN could not be loaded. Fix the board text and try again.");
  return game.fen();
}

async function syncPositionReview(position) {
  const existing = reviewItemForPosition(position.id);

  if (position.review_enabled === false) {
    if (existing) await OpeningDB.deleteReviewItem(existing.id);
    return;
  }

  const reviewItem = ensureReviewItem(reviewItems, "position", position.id, position.title || "Position", {
    priority: position.priority || "normal"
  });
  await OpeningDB.upsertReviewItem({
    ...reviewItem,
    source_label: position.title || reviewItem.source_label,
    priority: position.priority || reviewItem.priority,
    updated_at: new Date().toISOString()
  });
}

async function refresh() {
  [nodes, games, repairs, positions, mistakes, reviewItems] = await Promise.all([
    OpeningDB.loadNodes(),
    OpeningDB.loadGames(),
    OpeningDB.loadRepairItems(),
    OpeningDB.loadPositions(),
    OpeningDB.loadMistakes(),
    OpeningDB.loadReviewItems ? OpeningDB.loadReviewItems() : Promise.resolve([])
  ]);

  if (selectedPositionId && !selectedPosition()) {
    selectedPositionId = null;
  }

  if (!selectedPositionId && positions.length) {
    selectedPositionId = positions[0].id;
  }

  saveSelection();
  paint();
}

$("positionList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-position-id]");
  if (!button) return;
  selectPosition(button.dataset.positionId);
});

$("positionTypeFilter")?.addEventListener("change", renderPositionList);
$("positionSearchInput")?.addEventListener("input", renderPositionList);

$("savePositionBtn")?.addEventListener("click", async () => {
  const position = selectedPosition();
  if (!position) return;

  try {
    const updated = {
      ...position,
      title: $("positionTitleInput")?.value.trim() || "",
      short_question: $("positionQuestionInput")?.value.trim() || "",
      position_type: $("positionTypeInput")?.value || position.position_type,
      source_type: $("positionSourceTypeInput")?.value || position.source_type,
      source_label: $("positionSourceLabelInput")?.value.trim() || "",
      source_url: $("positionSourceUrlInput")?.value.trim() || "",
      themes: tagsFromCommaText($("positionThemesInput")?.value || ""),
      tags: tagsFromCommaText($("positionTagsInput")?.value || ""),
      human_evaluation: $("positionEvaluationInput")?.value.trim() || "",
      best_human_move: $("positionBestMoveInput")?.value.trim() || "",
      candidate_moves: tagsFromCommaText($("positionCandidateMovesInput")?.value || ""),
      difficulty: $("positionDifficultyInput")?.value.trim() || "",
      priority: $("positionPriorityInput")?.value.trim() || "",
      correct_idea: $("positionCorrectIdeaInput")?.value.trim() || "",
      wrong_idea: $("positionWrongIdeaInput")?.value.trim() || "",
      lesson: $("positionLessonInput")?.value.trim() || "",
      review_enabled: $("positionReviewEnabledInput")?.checked === true,
      updated_at: new Date().toISOString()
    };

    await OpeningDB.upsertPosition(updated);
    await syncPositionReview(updated);
    await refresh();
    showToast(navigator.onLine ? "Position saved." : "Position saved locally.");
  } catch (error) {
    reportActionError("Saving position", error);
  }
});

$("manualPositionForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const fen = validateFen($("manualFenInput")?.value || "", $("manualSideToMoveInput")?.value || "w");
    const now = new Date().toISOString();
    const position = {
      id: crypto.randomUUID(),
      fen,
      pgn_context: "",
      side_to_move: String(fen.split(" ")[1] || $("manualSideToMoveInput")?.value || "w"),
      move_number: null,
      source_type: $("manualSourceTypeInput")?.value || "manual",
      source_id: null,
      source_label: $("manualSourceLabelInput")?.value.trim() || "",
      source_url: $("manualSourceUrlInput")?.value.trim() || "",
      title: $("manualPositionTitleInput")?.value.trim() || "Untitled manual position",
      short_question: $("manualQuestionInput")?.value.trim() || "",
      position_type: $("manualPositionTypeInput")?.value || "middlegame",
      themes: tagsFromCommaText($("manualThemesInput")?.value || ""),
      tags: tagsFromCommaText($("manualTagsInput")?.value || ""),
      difficulty: "",
      priority: "normal",
      human_evaluation: "",
      correct_idea: "",
      wrong_idea: "",
      candidate_moves: [],
      best_human_move: $("manualBestMoveInput")?.value.trim() || "",
      lesson: $("manualLessonInput")?.value.trim() || "",
      linked_repair_id: null,
      linked_opening_node_id: null,
      linked_game_id: null,
      linked_book_id: null,
      linked_book_note_id: null,
      review_enabled: $("manualReviewEnabledInput")?.checked === true,
      last_reviewed_at: null,
      next_review_at: null,
      created_at: now,
      updated_at: now
    };

    await OpeningDB.upsertPosition(position);
    await syncPositionReview(position);
    selectedPositionId = position.id;
    saveSelection();
    $("manualPositionForm")?.reset();
    $("manualSideToMoveInput").value = "w";
    $("manualPositionTypeInput").value = "opening";
    $("manualSourceTypeInput").value = "manual";
    $("manualReviewEnabledInput").checked = true;
    await refresh();
    showToast(navigator.onLine ? "Manual position saved." : "Manual position saved locally.");
  } catch (error) {
    reportActionError("Saving manual position", error);
  }
});

$("fillStartFenBtn")?.addEventListener("click", () => {
  $("manualFenInput").value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  $("manualSideToMoveInput").value = "w";
});

$("deletePositionBtn")?.addEventListener("click", async () => {
  const position = selectedPosition();
  if (!position || !confirm(`Delete "${position.title || "this position"}" from the vault?`)) return;

  try {
    await OpeningDB.deletePosition(position.id);
    selectedPositionId = null;
    saveSelection();
    await refresh();
    showToast("Position deleted.");
  } catch (error) {
    reportActionError("Deleting position", error);
  }
});

$("openPositionGameBtn")?.addEventListener("click", () => {
  const position = selectedPosition();
  const game = linkedGame(position);
  if (!position || !game) return;

  localStorage.setItem(SELECTED_GAME_STORAGE_KEY, game.id);
  const ply = position.move_number
    ? (position.side_to_move === "w" ? Math.max(0, (position.move_number * 2) - 2) : Math.max(0, (position.move_number * 2) - 1))
    : 0;
  localStorage.setItem(SELECTED_GAME_PLY_STORAGE_KEY, String(Math.max(0, ply)));
  window.location.href = "./games.html";
});

$("openPositionEditorBtn")?.addEventListener("click", () => {
  const position = selectedPosition();
  if (!position?.linked_opening_node_id) return;

  localStorage.setItem(SELECTED_NODE_STORAGE_KEY, position.linked_opening_node_id);
  window.location.href = "./editor.html";
});

$("openPositionRepairBtn")?.addEventListener("click", () => {
  const position = selectedPosition();
  if (!position?.linked_repair_id) return;

  localStorage.setItem(SELECTED_REPAIR_STORAGE_KEY, position.linked_repair_id);
  window.location.href = "./repair.html";
});

$("syncBtn")?.addEventListener("click", async () => {
  try {
    await OpeningDB.commitAllChanges?.();
    await refresh();
    showToast(navigator.onLine ? "Position changes committed." : "Offline mode active. Your position data is stored locally.");
  } catch (error) {
    reportActionError("Committing position changes", error);
  }
});

try {
  await refresh();
} catch (error) {
  reportActionError("Loading position vault", error, "Run the updated supabase/schema.sql if the final Position Vault tables do not exist in Supabase yet.");
}
