import { requireOnlyMe } from "./auth/only-me-guard.js";
import { initPageChrome } from "./ui-shell.js";
import {
  bestBoardAttempt,
  boardFromFen,
  boardRowsFromGame,
  colorToMoveText,
  createChessGame,
  renderBoardSquares
} from "./board-tools.js";
import { boardViewFromFen, escapeHtml, reportActionError, setHtml, setText, showToast } from "./chess-brain-utils.js";
import { ensureReviewItem } from "./review-utils.js";
import { getSelectedNodeId, getSelectedRepairId, setSelectedRepairId } from "./navigation-state.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/repair.js.");
}

let nodes = [];
let repairs = [];
let positions = [];
let games = [];
let annotations = [];
let reviewItems = [];
let attempts = [];
let selectedRepairId = getSelectedRepairId();

function nodeById(id) {
  return nodes.find(node => node.id === id) || null;
}

function repairById(id) {
  return repairs.find(repair => repair.id === id) || null;
}

function positionById(id) {
  return positions.find(position => position.id === id) || null;
}

function annotationById(id) {
  return annotations.find(annotation => annotation.id === id) || null;
}

function gameById(id) {
  return games.find(game => game.id === id) || null;
}

function reviewItemForRepair(id) {
  return reviewItems.find(item => item.source_type === "repair" && item.source_id === id) || null;
}

function currentNode() {
  const selectedNodeId = getSelectedNodeId();
  return selectedNodeId ? nodeById(selectedNodeId) : null;
}

function pathNodesFor(node) {
  const path = [];
  let current = node;

  while (current) {
    path.unshift(current);
    current = current.parent_id ? nodeById(current.parent_id) : null;
  }

  return path;
}

function pathText(node) {
  return pathNodesFor(node).map(entry => entry.move).join(" ");
}

function statusLabel(status) {
  return {
    captured: "Captured",
    understood: "Understood",
    scheduled: "Scheduled",
    testing: "Testing",
    solved: "Solved",
    reopened: "Reopened"
  }[status] || "Captured";
}

function focusRepair() {
  return selectedRepairId ? repairById(selectedRepairId) : null;
}

function focusNode() {
  const repair = focusRepair();
  if (repair?.linked_opening_node_id || repair?.related_node_id) return nodeById(repair.linked_opening_node_id || repair.related_node_id);
  return currentNode();
}

function renderFocusBoard() {
  const board = $("repairBoard");
  if (!board) return;

  const repair = focusRepair();
  const linkedPosition = positionById(repair?.linked_position_id);
  const linkedAnnotation = annotationById(repair?.linked_annotation_id);
  const node = focusNode();

  let view = boardViewFromFen("");
  let lineCopy = repair?.position_path || "";

  if (linkedPosition?.fen) {
    view = boardViewFromFen(linkedPosition.fen);
    lineCopy = linkedPosition.pgn_context || lineCopy;
  } else if (linkedAnnotation?.fen_before) {
    view = boardViewFromFen(linkedAnnotation.fen_before);
    lineCopy = lineCopy || linkedAnnotation.san || "";
  } else if (node) {
    const attempt = bestBoardAttempt(pathNodesFor(node));
    const game = attempt?.game || createChessGame("w");
    view = {
      html: renderBoardSquares(game ? boardRowsFromGame(game) : boardFromFen(), attempt?.lastMove || null),
      turnText: game ? colorToMoveText(game.turn()) : "Board ready"
    };
    lineCopy = pathText(node);
  }

  board.innerHTML = view.html;
  setText("repairFocusTitle", repair ? (repair.mistake || "Repair focus board") : "Repair focus board");
  setText("repairFocusSubtitle", repair?.lesson || node?.title || "Select a repair or pin the current opening move.");
  setText("repairFocusMove", node?.move || (repair?.linked_position_id ? "Linked position" : "Root view"));
  setText("repairFocusMoveCaption", lineCopy || "Attach the selected move to tie the repair to a concrete spot in your tree.");
  setText("repairBoardMeta", view.turnText || "Board ready");
  setText("repairFocusStatus", repair ? `${statusLabel(repair.status)} • ${repair.severity || "normal"} severity` : "Starting position.");
  setText("repairFocusLessonTitle", repair ? "Active repair" : "Selected move note");
  setText("repairFocusLesson", repair?.repair_action || repair?.lesson || node?.explanation || "The active repair or selected move explanation will appear here.");
  setHtml("repairFocusLine", lineCopy ? `<span class="line-chip active"><span>${escapeHtml(lineCopy)}</span></span>` : `<div class="line-empty">No linked move yet. Attach a selected move or jump from a repair item below.</div>`);
}

function setLinkFields(repair = null) {
  const node = repair?.linked_opening_node_id || repair?.related_node_id ? nodeById(repair.linked_opening_node_id || repair.related_node_id) : currentNode();
  const path = repair?.position_path || (node ? pathText(node) : "");

  $("repairNodeIdInput").value = node?.id || "";
  $("repairPathInput").value = path;
  $("repairLinkedPositionIdInput").value = repair?.linked_position_id || "";
  $("repairLinkedGameIdInput").value = repair?.linked_game_id || "";
  $("repairLinkedAnnotationIdInput").value = repair?.linked_annotation_id || "";

  setText("repairLinkMeta", path ? `Linked to ${path}` : "Not linked to a move yet.");
}

function resetForm() {
  $("repairForm")?.reset();
  $("repairIdInput").value = "";
  $("repairStatusInput").value = "captured";
  $("repairSeverityInput").value = "normal";
  $("repairCategoryInput").value = "other";
  $("repairReviewEnabledInput").checked = true;
  setText("repairEditorState", "Capture the mistake, the lesson, the test question, and the repair action.");
  setSelectedRepairId(null);
  selectedRepairId = null;
  setLinkFields();
}

function fillForm(repair) {
  if (!repair) return;

  selectedRepairId = repair.id;
  setSelectedRepairId(repair.id);
  $("repairIdInput").value = repair.id;
  $("repairMistakeInput").value = repair.mistake || "";
  $("repairLessonInput").value = repair.lesson || "";
  $("repairActionInput").value = repair.repair_action || repair.repair || "";
  $("repairQuestionInput").value = repair.test_question || "";
  $("repairResponseInput").value = repair.correct_response || "";
  $("repairStatusInput").value = repair.status || "captured";
  $("repairSeverityInput").value = repair.severity || "normal";
  $("repairCategoryInput").value = repair.category || "other";
  $("repairReviewEnabledInput").checked = repair.review_enabled !== false;
  setText("repairEditorState", `Editing ${repair.mistake || "selected repair"}.`);
  setLinkFields(repair);
}

function renderAttempts() {
  const repair = focusRepair();
  const items = attempts.filter(item => item.repair_id === repair?.id);
  setHtml("repairAttemptList", items.length
    ? items.map(item => `<span class="line-chip active"><span>${escapeHtml(`${item.result} • ${String(item.attempted_at || "").slice(0, 10)}`)}</span></span>`).join("")
    : `<div class="line-empty">Review attempts will appear here after you use Training > Repairs.</div>`);
}

function renderList() {
  const filter = $("repairFilterInput")?.value || "all";
  const filtered = repairs
    .filter(repair => filter === "all" || repair.status === filter)
    .sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")));

  const openCount = repairs.filter(repair => repair.status !== "solved").length;
  setText("repairQueueBadge", `${openCount} open`);
  setText("repairOpenCount", `${openCount} open`);

  setHtml("repairList", filtered.length
    ? filtered.map(repair => {
      const review = reviewItemForRepair(repair.id);
      return `
        <article class="repair-item ${repair.id === selectedRepairId ? "open" : ""}">
          <div class="repair-item-top">
            <span class="repair-status ${repair.status === "solved" ? "status-solved" : "status-open"}">${escapeHtml(statusLabel(repair.status))}</span>
            <span class="repair-linked">${escapeHtml(repair.category || "repair")} • ${escapeHtml(repair.severity || "normal")}</span>
          </div>
          <h4>${escapeHtml(repair.mistake || "Unnamed repair loop")}</h4>
          <p><span>Lesson.</span> ${escapeHtml(repair.lesson || "No lesson recorded yet.")}</p>
          <p><span>Repair.</span> ${escapeHtml(repair.repair_action || repair.repair || "No repair action recorded yet.")}</p>
          <p class="muted">${escapeHtml(review?.due_at ? `Next review ${review.due_at.slice(0, 10)}` : "No review scheduled yet.")}</p>
          <div class="repair-actions" data-repair-id="${repair.id}">
            <button class="button button-secondary button-tiny" type="button" data-repair-action="edit">Edit</button>
            <button class="button button-ghost button-tiny" type="button" data-repair-action="toggle">${repair.status === "solved" ? "Reopen" : "Mark solved"}</button>
            <button class="button button-primary button-tiny" type="button" data-repair-action="train">Train</button>
            <button class="button button-danger button-tiny" type="button" data-repair-action="delete">Delete</button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">No repair notes in this filter yet. Capture one from a game or tie one to your selected opening move.</div>`);
}

function paint() {
  renderFocusBoard();
  renderList();
  renderAttempts();
}

async function ensureReviewMirror(repair) {
  if (repair.review_enabled === false) {
    const existing = reviewItemForRepair(repair.id);
    if (existing) {
      await window.OpeningDB.deleteReviewItem(existing.id);
    }
    return;
  }

  const reviewItem = ensureReviewItem(reviewItems, "repair", repair.id, repair.mistake || "Repair", {
    priority: repair.severity || "normal"
  });
  await window.OpeningDB.upsertReviewItem({
    ...reviewItem,
    source_label: repair.mistake || reviewItem.source_label,
    priority: repair.severity || reviewItem.priority,
    updated_at: new Date().toISOString()
  });
}

async function refresh() {
  [nodes, repairs, positions, games, annotations, reviewItems, attempts] = await Promise.all([
    window.OpeningDB.loadNodes(),
    window.OpeningDB.loadRepairItems(),
    window.OpeningDB.loadPositions(),
    window.OpeningDB.loadGames(),
    window.OpeningDB.loadGameAnnotations(),
    window.OpeningDB.loadReviewItems ? window.OpeningDB.loadReviewItems() : Promise.resolve([]),
    window.OpeningDB.loadRepairAttempts ? window.OpeningDB.loadRepairAttempts() : Promise.resolve([])
  ]);

  if (selectedRepairId && !repairById(selectedRepairId)) {
    selectedRepairId = null;
    setSelectedRepairId(null);
  }

  if (selectedRepairId) fillForm(repairById(selectedRepairId));
  else if (!$("repairIdInput").value) setLinkFields();

  paint();
}

$("repairUseCurrentBtn")?.addEventListener("click", () => {
  setLinkFields();
  paint();
});

$("repairResetBtn")?.addEventListener("click", resetForm);
$("repairFilterInput")?.addEventListener("change", renderList);

$("repairForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const existing = repairById($("repairIdInput").value);
    const now = new Date().toISOString();
    const repair = {
      id: $("repairIdInput").value || crypto.randomUUID(),
      linked_opening_node_id: $("repairNodeIdInput").value || null,
      related_node_id: $("repairNodeIdInput").value || null,
      position_path: $("repairPathInput").value.trim(),
      mistake: $("repairMistakeInput").value.trim(),
      lesson: $("repairLessonInput").value.trim(),
      repair_action: $("repairActionInput").value.trim(),
      repair: $("repairActionInput").value.trim(),
      test_question: $("repairQuestionInput").value.trim(),
      correct_response: $("repairResponseInput").value.trim(),
      linked_position_id: $("repairLinkedPositionIdInput").value || null,
      linked_game_id: $("repairLinkedGameIdInput").value || null,
      linked_annotation_id: $("repairLinkedAnnotationIdInput").value || null,
      severity: $("repairSeverityInput").value,
      category: $("repairCategoryInput").value,
      status: $("repairStatusInput").value,
      review_enabled: $("repairReviewEnabledInput").checked,
      last_reviewed_at: existing?.last_reviewed_at || null,
      next_review_at: existing?.next_review_at || null,
      created_at: existing?.created_at || now,
      updated_at: now
    };

    await window.OpeningDB.upsertRepairItem(repair);
    await ensureReviewMirror(repair);
    selectedRepairId = repair.id;
    setSelectedRepairId(repair.id);
    await refresh();
    showToast(navigator.onLine ? "Repair saved." : "Repair saved locally.");
  } catch (error) {
    reportActionError("Saving repair", error);
  }
});

$("repairList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-repair-action]");
  const row = event.target.closest("[data-repair-id]");
  if (!button || !row) return;

  const repair = repairById(row.dataset.repairId);
  if (!repair) return;

  try {
    if (button.dataset.repairAction === "edit") {
      fillForm(repair);
      paint();
      return;
    }

    if (button.dataset.repairAction === "toggle") {
      await window.OpeningDB.upsertRepairItem({
        ...repair,
        status: repair.status === "solved" ? "reopened" : "solved",
        updated_at: new Date().toISOString()
      });
      await refresh();
      showToast(repair.status === "solved" ? "Repair reopened." : "Repair marked solved.");
      return;
    }

    if (button.dataset.repairAction === "train") {
      setTrainingIntent({ mode: "repairs", source_type: "repair", source_id: repair.id });
      window.location.href = "./training.html";
      return;
    }

    if (button.dataset.repairAction === "delete" && confirm(`Delete "${repair.mistake || "this repair"}"?`)) {
      if (selectedRepairId === repair.id) {
        selectedRepairId = null;
        setSelectedRepairId(null);
      }
      await window.OpeningDB.deleteRepairItem(repair.id);
      await refresh();
      showToast("Repair deleted.");
    }
  } catch (error) {
    reportActionError("Updating repair", error);
  }
});

$("syncBtn")?.addEventListener("click", async () => {
  try {
    await refresh();
    showToast(navigator.onLine ? "Repair loop synced." : "Offline mode active. Using your local copy.");
  } catch (error) {
    reportActionError("Syncing repair loop", error);
  }
});

try {
  await refresh();
} catch (error) {
  reportActionError("Loading repair loop", error, "Run the updated supabase/schema.sql if the final repair review tables are not available in Supabase yet.");
}
