import { requireOnlyMe } from "./auth/only-me-guard.js";
import { initPageChrome } from "./ui-shell.js";
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
  $,
  boardViewFromFen,
  escapeHtml,
  reportActionError,
  setHtml,
  setText,
  showToast
} from "./chess-brain-utils.js";
import {
  buildLeafLines,
  ensureReviewItem,
  moveColor,
  reviewDueState,
  scheduleReviewResult
} from "./review-utils.js";
import { clearTrainingIntent, getTrainingIntent, setTrainingIntent } from "./navigation-state.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/training.js.");
}

const MODE_LABELS = {
  opening_lines: "Opening Lines",
  positions: "Positions",
  repairs: "Repairs",
  mixed: "Mixed Due Review"
};

let nodes = [];
let positions = [];
let repairs = [];
let games = [];
let annotations = [];
let reviewItems = [];
let repairAttempts = [];

const state = {
  mode: "opening_lines",
  openingColor: "white",
  rootId: "",
  lineMode: "due_only",
  selectedQueueId: "",
  session: null,
  completedCount: 0
};

function nodeById(id) {
  return nodes.find(node => node.id === id) || null;
}

function positionById(id) {
  return positions.find(position => position.id === id) || null;
}

function repairById(id) {
  return repairs.find(repair => repair.id === id) || null;
}

function annotationById(id) {
  return annotations.find(annotation => annotation.id === id) || null;
}

function reviewItemFor(sourceType, sourceId) {
  return reviewItems.find(item => item.source_type === sourceType && item.source_id === sourceId) || null;
}

function children(parentId) {
  return nodes.filter(node => (node.parent_id || null) === (parentId || null));
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

function openingColorMatches(line) {
  if (state.openingColor === "all") return true;
  return line.color === state.openingColor;
}

function openingRoots() {
  return nodes
    .filter(node => !node.parent_id)
    .filter(node => state.openingColor === "all" || (moveColor(node.move) === (state.openingColor === "black" ? "b" : "w")))
    .sort((left, right) => String(left.title || left.move).localeCompare(String(right.title || right.move)));
}

function queueEntryBase(entry) {
  return {
    id: `${entry.sourceType}:${entry.sourceId}`,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId
  };
}

function openingLineQueue(mode = state.lineMode, options = {}) {
  const respectFilters = options.respectFilters !== false;
  const lines = buildLeafLines(nodes, reviewItems)
    .filter(line => line.prompts.length > 0)
    .filter(line => !respectFilters || openingColorMatches(line))
    .filter(line => !respectFilters || !state.rootId || line.root_node_id === state.rootId)
    .map(line => ({
      ...queueEntryBase({ sourceType: "opening_line", sourceId: line.leaf_node_id }),
      title: line.title,
      subtitle: `${line.ply_count} ply • ${line.color} • ${line.due_state}`,
      dueState: line.due_state,
      priority: line.review_item?.priority || "normal",
      line,
      reviewItem: line.review_item || null
    }));

  if (mode === "due_only") {
    return lines
      .filter(line => line.dueState === "due")
      .sort((left, right) => String(left.reviewItem?.due_at || "").localeCompare(String(right.reviewItem?.due_at || "")));
  }

  if (mode === "weakest_first") {
    return lines.sort((left, right) => {
      const leftScore = Number(left.reviewItem?.fail_count || 0) + Number(left.reviewItem?.lapse_count || 0);
      const rightScore = Number(right.reviewItem?.fail_count || 0) + Number(right.reviewItem?.lapse_count || 0);
      return rightScore - leftScore || left.title.localeCompare(right.title);
    });
  }

  if (mode === "new_first") {
    return lines.sort((left, right) => {
      const order = { new: 0, due: 1, not_due: 2 };
      return (order[left.dueState] || 9) - (order[right.dueState] || 9) || left.title.localeCompare(right.title);
    });
  }

  return lines.sort((left, right) => left.title.localeCompare(right.title));
}

function positionQueue() {
  return positions
    .filter(position => position.review_enabled !== false)
    .map(position => {
      const reviewItem = reviewItemFor("position", position.id);
      const dueState = reviewDueState(reviewItem);
      return {
        ...queueEntryBase({ sourceType: "position", sourceId: position.id }),
        title: position.title || "Untitled position",
        subtitle: `${position.position_type || "position"} • ${dueState} • ${position.best_human_move || "idea recall"}`,
        dueState,
        priority: reviewItem?.priority || position.priority || "normal",
        position,
        reviewItem
      };
    })
    .sort((left, right) => {
      const order = { due: 0, new: 1, not_due: 2 };
      return (order[left.dueState] || 9) - (order[right.dueState] || 9) || left.title.localeCompare(right.title);
    });
}

function repairQueue() {
  return repairs
    .filter(repair => repair.review_enabled !== false)
    .map(repair => {
      const reviewItem = reviewItemFor("repair", repair.id);
      const dueState = reviewDueState(reviewItem);
      return {
        ...queueEntryBase({ sourceType: "repair", sourceId: repair.id }),
        title: repair.mistake || "Repair card",
        subtitle: `${repair.status} • ${dueState} • ${repair.category || "repair"}`,
        dueState,
        priority: reviewItem?.priority || repair.severity || "normal",
        repair,
        reviewItem
      };
    })
    .sort((left, right) => {
      const order = { due: 0, new: 1, not_due: 2 };
      return (order[left.dueState] || 9) - (order[right.dueState] || 9) || left.title.localeCompare(right.title);
    });
}

function mixedQueue() {
  return [...repairQueue(), ...positionQueue(), ...openingLineQueue("all_leaf_lines", { respectFilters: false })]
    .filter(entry => entry.dueState === "due" || entry.dueState === "new")
    .sort((left, right) => {
      const dueRank = { due: 0, new: 3 };
      const leftBase = dueRank[left.dueState] || 9;
      const rightBase = dueRank[right.dueState] || 9;
      if (left.sourceType === "repair" && left.priority === "critical" && left.dueState === "due") return -1;
      if (right.sourceType === "repair" && right.priority === "critical" && right.dueState === "due") return 1;
      if (left.sourceType === "position" && Number(left.reviewItem?.lapse_count || 0) > Number(right.reviewItem?.lapse_count || 0)) return -1;
      if (right.sourceType === "position" && Number(right.reviewItem?.lapse_count || 0) > Number(left.reviewItem?.lapse_count || 0)) return 1;
      return leftBase - rightBase || left.title.localeCompare(right.title);
    });
}

function queueItems() {
  if (state.mode === "positions") return positionQueue();
  if (state.mode === "repairs") return repairQueue();
  if (state.mode === "mixed") return mixedQueue();
  return openingLineQueue();
}

function ensureSelectedQueueItem() {
  const items = queueItems();
  if (items.some(item => item.id === state.selectedQueueId)) return;
  state.selectedQueueId = items[0]?.id || "";
}

function selectedQueueItem() {
  ensureSelectedQueueItem();
  return queueItems().find(item => item.id === state.selectedQueueId) || null;
}

function acceptedOpeningNodes(answerNode) {
  const siblings = children(answerNode.parent_id)
    .filter(node => moveColor(node.move) === moveColor(answerNode.move))
    .filter(node => node.exclude_from_training !== true);
  const preferred = siblings.filter(node => node.is_preferred);
  if (!preferred.length) return [answerNode];
  return preferred.some(node => node.id === answerNode.id) ? preferred : [answerNode];
}

function buildOpeningSession(entry) {
  return {
    type: "opening_line",
    entry,
    stepIndex: 0,
    revealOpen: false,
    whyOpen: false,
    feedback: "",
    canContinue: false,
    awaitingGrade: false,
    finished: false,
    failed: false,
    gradeContext: ""
  };
}

function buildPositionSession(entry) {
  return {
    type: "position",
    entry,
    revealOpen: false,
    whyOpen: false,
    feedback: "",
    canContinue: false,
    awaitingGrade: false,
    finished: false,
    failed: false,
    gradeContext: ""
  };
}

function buildRepairSession(entry) {
  return {
    type: "repair",
    entry,
    revealOpen: false,
    whyOpen: false,
    feedback: "",
    canContinue: false,
    awaitingGrade: false,
    finished: false,
    failed: false,
    gradeContext: ""
  };
}

function startQueueEntry(entry) {
  if (!entry) return;
  state.selectedQueueId = entry.id;
  if (entry.sourceType === "opening_line") state.session = buildOpeningSession(entry);
  else if (entry.sourceType === "position") state.session = buildPositionSession(entry);
  else state.session = buildRepairSession(entry);
  $("trainerAnswerInput").value = "";
  paint();
}

function currentOpeningStep() {
  if (state.session?.type !== "opening_line") return null;
  return state.session.entry.line.prompts[state.session.stepIndex] || null;
}

function completeSession(message) {
  if (!state.session) return;
  state.session.feedback = message;
  state.session.awaitingGrade = true;
  state.session.finished = true;
  state.session.canContinue = false;
}

function advanceOpeningStep() {
  const session = state.session;
  if (!session || session.type !== "opening_line") return;
  if (session.stepIndex >= session.entry.line.prompts.length - 1) {
    completeSession("Line complete. Grade how the full recall felt.");
    return;
  }

  session.stepIndex += 1;
  session.feedback = "";
  session.revealOpen = false;
  session.whyOpen = false;
  session.canContinue = false;
  $("trainerAnswerInput").value = "";
}

function startNextQueueItem() {
  const items = queueItems();
  if (!items.length) {
    state.session = null;
    paint();
    return;
  }

  const currentIndex = items.findIndex(item => item.id === state.selectedQueueId);
  const nextIndex = currentIndex >= 0 && currentIndex < items.length - 1 ? currentIndex + 1 : 0;
  startQueueEntry(items[nextIndex]);
}

function openingBoardView(step) {
  const path = step?.positionNodes || [];
  if (!path.length) {
    const rootColor = step?.answerNode ? moveColor(step.answerNode.move) : "w";
    const game = createChessGame(rootColor === "b" ? "b" : "w");
    return {
      html: renderBoardSquares(game ? boardRowsFromGame(game) : boardFromFen(), null),
      turnText: game ? colorToMoveText(game.turn()) : rootColor === "b" ? "Black to move" : "White to move"
    };
  }

  const attempt = bestBoardAttempt(path);
  const game = attempt?.game || createChessGame("w");
  return {
    html: renderBoardSquares(game ? boardRowsFromGame(game) : boardFromFen(), attempt?.lastMove || null),
    turnText: game ? colorToMoveText(game.turn()) : "Board ready"
  };
}

function repairBoardView(repair) {
  const linkedPosition = positionById(repair.linked_position_id);
  if (linkedPosition?.fen) return boardViewFromFen(linkedPosition.fen);

  const linkedAnnotation = annotationById(repair.linked_annotation_id);
  if (linkedAnnotation?.fen_before) return boardViewFromFen(linkedAnnotation.fen_before);

  const linkedNode = nodeById(repair.linked_opening_node_id || repair.related_node_id);
  if (linkedNode) {
    const attempt = bestBoardAttempt(pathNodesFor(linkedNode));
    const game = attempt?.game || createChessGame("w");
    return {
      html: renderBoardSquares(game ? boardRowsFromGame(game) : boardFromFen(), attempt?.lastMove || null),
      turnText: game ? colorToMoveText(game.turn()) : "Board ready"
    };
  }

  return boardViewFromFen("");
}

function renderQueue() {
  const items = queueItems();
  ensureSelectedQueueItem();

  setText("trainerQueueCount", `${items.length} item${items.length === 1 ? "" : "s"} ready`);
  setText("trainerQueueSubtitle", `${MODE_LABELS[state.mode]} queue`);

  setHtml("trainingQueueList", items.length
    ? items.map(item => `
        <button class="position-list-card${item.id === state.selectedQueueId ? " is-active" : ""}" type="button" data-queue-id="${item.id}">
          <span class="study-choice-kicker">${escapeHtml(item.sourceType.replace(/_/g, " "))}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="muted">${escapeHtml(item.subtitle)}</span>
        </button>
      `).join("")
    : `<div class="support-empty-state"><div><strong>No items in this queue yet.</strong><p>Create opening leaves, manual positions, or repair cards and they will appear here.</p></div></div>`);
}

function renderSetup() {
  document.querySelectorAll("[data-training-mode]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.trainingMode === state.mode);
  });

  const isOpeningMode = state.mode === "opening_lines";
  const rootSelect = $("trainerRootSelect");
  const lineModeSelect = $("trainerLineModeSelect");
  const colorButtons = ["trainerColorWhiteBtn", "trainerColorBlackBtn", "trainerColorAllBtn"];

  colorButtons.forEach(id => {
    const button = $(id);
    if (!button) return;
    const value = button.id === "trainerColorBlackBtn" ? "black" : button.id === "trainerColorAllBtn" ? "all" : "white";
    button.classList.toggle("is-active", state.openingColor === value);
    button.disabled = !isOpeningMode;
  });

  if (rootSelect) {
    rootSelect.disabled = !isOpeningMode;
    const roots = openingRoots();
    rootSelect.innerHTML = [`<option value="">All roots</option>`]
      .concat(roots.map(root => `<option value="${root.id}" ${root.id === state.rootId ? "selected" : ""}>${escapeHtml(root.title || root.move)} (${escapeHtml(root.move)})</option>`))
      .join("");
  }

  if (lineModeSelect) {
    lineModeSelect.disabled = !isOpeningMode;
    lineModeSelect.value = state.lineMode;
  }

  setText("trainerSelectionStatus", isOpeningMode
    ? "Choose a color, optional root, and queue mode. The trainer drills complete root-to-leaf opening lines."
    : state.mode === "positions"
      ? "Position review uses your saved vault cards, best moves, questions, and lessons."
      : state.mode === "repairs"
        ? "Repair review tests whether the lesson is truly fixed, not just captured."
        : "Mixed Due Review combines openings, positions, and repairs into one priority queue.");
}

function renderSession() {
  const board = $("trainerBoard");
  if (!board) return;

  const session = state.session;
  const queueItem = selectedQueueItem();

  setText("trainerProgressText", `${state.completedCount} review${state.completedCount === 1 ? "" : "s"} completed in this session.`);
  setText("trainerSessionTitle", queueItem ? queueItem.title : "Choose a review lane");
  setText("trainerSessionSubtitle", queueItem ? queueItem.subtitle : "Pick a queue item on the left or let the trainer choose the next due card.");

  if (!session || !queueItem) {
    board.innerHTML = renderBoardSquares(boardFromFen(), null);
    setText("trainerTurnPill", "No review active");
    setText("trainerOpeningValue", "Nothing selected");
    setText("trainerOpeningCaption", "Choose an opening line, position, repair, or mixed due item.");
    setText("trainerOpponentMove", "Waiting");
    setText("trainerOpponentMeta", "Due state, last result, and queue context appear here.");
    setText("trainerPositionTitle", "Trainer waiting");
    setHtml("trainerPositionLine", `<div class="line-empty">Select a queue item, then start the review.</div>`);
    setText("trainerAcceptedMeta", "Openings check your move. Positions and repairs let you reveal, think, then grade the recall honestly.");
    setText("trainerHint", "Start a review when you are ready.");
    setHtml("trainerFeedback", `<div class="feedback-box feedback-neutral">Nothing is running yet.</div>`);
    setHtml("trainerReveal", "");
    return;
  }

  const canGrade = session.awaitingGrade;
  ["reviewAgainBtn", "reviewHardBtn", "reviewGoodBtn", "reviewEasyBtn"].forEach(id => {
    const button = $(id);
    if (button) button.disabled = !canGrade;
  });

  if (session.type === "opening_line") {
    const step = currentOpeningStep();
    const view = openingBoardView(step);
    const accepted = acceptedOpeningNodes(step.answerNode);
    board.innerHTML = view.html;
    setText("trainerTurnPill", view.turnText);
    setText("trainerOpeningValue", session.entry.title);
    setText("trainerOpeningCaption", `Leaf line • ${session.entry.line.ply_count} ply`);
    setText("trainerOpponentMove", session.entry.reviewItem?.last_result || session.entry.line.due_state);
    setText("trainerOpponentMeta", step?.lastOpponentNode
      ? `Opponent reply: ${step.lastOpponentNode.move}`
      : "Root move prompt.");
    setText("trainerPositionTitle", step?.positionNodes.length ? `Position after ${step.positionNodes[step.positionNodes.length - 1].move}` : "Start position");
    setHtml("trainerPositionLine", step?.positionNodes.length
      ? step.positionNodes.map(node => `<span class="line-chip active"><span>${escapeHtml(node.move)}</span></span>`).join("")
      : `<div class="line-empty">The line starts from the initial position.</div>`);
    setText("trainerAcceptedMeta", `Expected move${accepted.length === 1 ? "" : "s"}: ${accepted.map(node => node.move).join(", ")}`);
    setText("trainerHint", session.feedback || (step?.answerNode?.title || "Enter your repertoire move from the board."));
    setHtml("trainerFeedback", `<div class="feedback-box ${session.failed ? "feedback-incorrect" : session.feedback ? "feedback-correct" : "feedback-neutral"}">${escapeHtml(session.feedback || "Enter your move, reveal if needed, then continue through the full leaf line.")}</div>`);
    setHtml("trainerReveal", session.revealOpen || session.whyOpen ? `
      <div class="answer-key">
        ${session.whyOpen && step.lastOpponentNode ? `
          <article class="answer-card">
            <strong>${escapeHtml(step.lastOpponentNode.move)}</strong>
            <p>${escapeHtml(step.lastOpponentNode.explanation || step.lastOpponentNode.title || "No explanation saved for this reply yet.")}</p>
          </article>
        ` : ""}
        ${session.revealOpen ? accepted.map(node => `
          <article class="answer-card">
            <strong>${escapeHtml(node.move)}</strong>
            <p>${escapeHtml(node.explanation || node.title || "No explanation saved yet.")}</p>
          </article>
        `).join("") : ""}
      </div>
    ` : "");
  } else if (session.type === "position") {
    const position = session.entry.position;
    const view = boardViewFromFen(position.fen || "");
    board.innerHTML = view.html;
    setText("trainerTurnPill", view.turnText);
    setText("trainerOpeningValue", position.title || "Position");
    setText("trainerOpeningCaption", `${position.position_type || "position"} • ${session.entry.dueState}`);
    setText("trainerOpponentMove", session.entry.reviewItem?.last_result || session.entry.dueState);
    setText("trainerOpponentMeta", position.source_label || position.source_type || "Manual or saved position");
    setText("trainerPositionTitle", position.short_question || "What should be remembered here?");
    setHtml("trainerPositionLine", `<div class="line-empty">${escapeHtml(position.pgn_context || position.lesson || "Board-first review card")}</div>`);
    setText("trainerAcceptedMeta", position.best_human_move ? `Best move: ${position.best_human_move}` : "Use reveal, then grade your recall honestly.");
    setText("trainerHint", session.feedback || position.correct_idea || "Think first. Reveal only after honest effort.");
    setHtml("trainerFeedback", `<div class="feedback-box ${session.failed ? "feedback-incorrect" : session.feedback ? "feedback-correct" : "feedback-neutral"}">${escapeHtml(session.feedback || "Recall the move or idea, then grade the result.")}</div>`);
    setHtml("trainerReveal", session.revealOpen ? `
      <div class="answer-key">
        <article class="answer-card">
          <strong>${escapeHtml(position.best_human_move || "Human idea")}</strong>
          <p>${escapeHtml(position.correct_idea || position.lesson || "No explanation saved yet.")}</p>
        </article>
        ${position.wrong_idea ? `<article class="answer-card"><strong>Wrong idea</strong><p>${escapeHtml(position.wrong_idea)}</p></article>` : ""}
      </div>
    ` : "");
  } else {
    const repair = session.entry.repair;
    const view = repairBoardView(repair);
    board.innerHTML = view.html;
    setText("trainerTurnPill", view.turnText || "Board ready");
    setText("trainerOpeningValue", repair.mistake || "Repair");
    setText("trainerOpeningCaption", `${repair.status} • ${session.entry.dueState}`);
    setText("trainerOpponentMove", session.entry.reviewItem?.last_result || session.entry.dueState);
    setText("trainerOpponentMeta", repair.category || "Repair review");
    setText("trainerPositionTitle", repair.test_question || "Can you recall the correction cleanly?");
    setHtml("trainerPositionLine", `<div class="line-empty">${escapeHtml(repair.position_path || repair.lesson || "Repair card review")}</div>`);
    setText("trainerAcceptedMeta", repair.correct_response ? `Expected response: ${repair.correct_response}` : "Use reveal, then grade your recall honestly.");
    setText("trainerHint", session.feedback || repair.lesson || "Name the repair before you reveal it.");
    setHtml("trainerFeedback", `<div class="feedback-box ${session.failed ? "feedback-incorrect" : session.feedback ? "feedback-correct" : "feedback-neutral"}">${escapeHtml(session.feedback || "Recall the fix, then grade whether it truly came back.")}</div>`);
    setHtml("trainerReveal", session.revealOpen ? `
      <div class="answer-key">
        <article class="answer-card">
          <strong>${escapeHtml(repair.correct_response || repair.repair_action || "Repair response")}</strong>
          <p>${escapeHtml(repair.lesson || repair.repair_action || repair.repair || "No repair explanation saved yet.")}</p>
        </article>
      </div>
    ` : "");
  }

  $("trainerSubmitBtn").disabled = session.awaitingGrade || session.canContinue;
  $("trainerAnswerInput").disabled = session.awaitingGrade || session.canContinue;
  $("continueTrainingBtn").disabled = !(session.type === "opening_line" && session.canContinue);
  $("whyPromptBtn").disabled = false;
  $("revealPromptBtn").disabled = false;
  $("nextTrainingBtn").disabled = queueItems().length === 0;
}

function paint() {
  renderSetup();
  renderQueue();
  renderSession();
}

function resetSession(keepQueue = true) {
  state.session = null;
  if (!keepQueue) state.selectedQueueId = "";
  $("trainerAnswerInput").value = "";
  paint();
}

function normalizeTextAnswer(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function handleOpeningSubmit(answer) {
  const session = state.session;
  const step = currentOpeningStep();
  if (!session || !step) return;

  const accepted = acceptedOpeningNodes(step.answerNode);
  const exactMatch = moveTextMatches(answer, step.answerNode.move);

  if (exactMatch) {
    session.feedback = `Correct: ${step.answerNode.move}.`;
    session.canContinue = true;
    if (session.stepIndex === session.entry.line.prompts.length - 1) {
      completeSession("Line complete. Grade how the full recall felt.");
    }
    paint();
    return;
  }

  const siblingMatch = accepted.find(node => moveTextMatches(answer, node.move));
  if (siblingMatch) {
    session.feedback = `${siblingMatch.move} is accepted here, but it leaves the selected leaf line. Grade the recall and revisit that other leaf line later.`;
    session.failed = false;
    session.revealOpen = true;
    completeSession(session.feedback);
    paint();
    return;
  }

  session.failed = true;
  session.feedback = `Incorrect. The line expected ${accepted.map(node => node.move).join(", ")}.`;
  session.revealOpen = true;
  completeSession(session.feedback);
  paint();
}

function handlePositionSubmit(answer) {
  const session = state.session;
  const position = session?.entry?.position;
  if (!session || !position) return;

  const accepted = [position.best_human_move, ...(position.candidate_moves || [])].filter(Boolean);
  if (!accepted.length) {
    session.feedback = "No exact move is stored here yet. Reveal the card, then grade your recall honestly.";
    session.revealOpen = true;
    session.awaitingGrade = true;
    session.finished = true;
    paint();
    return;
  }

  if (accepted.some(move => moveTextMatches(answer, move))) {
    session.feedback = `Correct: ${accepted.join(" / ")}.`;
    session.awaitingGrade = true;
    session.finished = true;
    paint();
    return;
  }

  session.failed = true;
  session.feedback = `Incorrect. Stored answer: ${accepted.join(" / ")}.`;
  paint();
}

function handleRepairSubmit(answer) {
  const session = state.session;
  const repair = session?.entry?.repair;
  if (!session || !repair) return;

  const accepted = [repair.correct_response, repair.repair_action, repair.repair].filter(Boolean);
  if (!accepted.length) {
    session.feedback = "No exact response is stored here yet. Reveal the repair, then grade the recall honestly.";
    session.revealOpen = true;
    session.awaitingGrade = true;
    session.finished = true;
    paint();
    return;
  }

  const normalizedAnswer = normalizeTextAnswer(answer);
  const matched = accepted.some(value => moveTextMatches(answer, value) || normalizeTextAnswer(value) === normalizedAnswer);
  if (matched) {
    session.feedback = "Correct repair response.";
    session.awaitingGrade = true;
    session.finished = true;
    paint();
    return;
  }

  session.failed = true;
  session.feedback = `Incorrect. Stored repair response: ${accepted[0]}.`;
  paint();
}

async function applyGrade(grade) {
  const session = state.session;
  if (!session?.awaitingGrade) return;

  const now = new Date();

  if (session.type === "opening_line") {
    const line = session.entry.line;
    const reviewItem = ensureReviewItem(reviewItems, "opening_line", line.leaf_node_id, line.title, {
      priority: session.entry.priority
    });
    await window.OpeningDB.upsertReviewItem(scheduleReviewResult(reviewItem, grade, now));
  }

  if (session.type === "position") {
    const position = session.entry.position;
    const reviewItem = ensureReviewItem(reviewItems, "position", position.id, position.title || "Position", {
      priority: position.priority || "normal"
    });
    const updatedReview = scheduleReviewResult(reviewItem, grade, now);
    await window.OpeningDB.upsertReviewItem(updatedReview);
    await window.OpeningDB.upsertPosition({
      ...position,
      review_enabled: true,
      last_reviewed_at: updatedReview.last_reviewed_at,
      next_review_at: updatedReview.due_at,
      updated_at: now.toISOString()
    });
  }

  if (session.type === "repair") {
    const repair = session.entry.repair;
    const reviewItem = ensureReviewItem(reviewItems, "repair", repair.id, repair.mistake || "Repair", {
      priority: repair.severity || "normal"
    });
    const updatedReview = scheduleReviewResult(reviewItem, grade, now);
    await window.OpeningDB.upsertReviewItem(updatedReview);
    await window.OpeningDB.upsertRepairAttempt({
      repair_id: repair.id,
      attempted_at: now.toISOString(),
      result: grade,
      answer_text: $("trainerAnswerInput").value.trim(),
      confidence: null,
      note: session.feedback
    });
    await window.OpeningDB.upsertRepairItem({
      ...repair,
      review_enabled: true,
      last_reviewed_at: updatedReview.last_reviewed_at,
      next_review_at: updatedReview.due_at,
      status: grade === "again"
        ? "reopened"
        : grade === "good" || grade === "easy"
          ? "solved"
          : repair.status === "captured"
            ? "testing"
            : repair.status,
      updated_at: now.toISOString()
    });
  }

  state.completedCount += 1;
  showToast("Review saved.");
  await refresh();
  startNextQueueItem();
}

async function refresh() {
  [
    nodes,
    positions,
    repairs,
    games,
    annotations,
    reviewItems,
    repairAttempts
  ] = await Promise.all([
    window.OpeningDB.loadNodes(),
    window.OpeningDB.loadPositions(),
    window.OpeningDB.loadRepairItems(),
    window.OpeningDB.loadGames(),
    window.OpeningDB.loadGameAnnotations(),
    window.OpeningDB.loadReviewItems ? window.OpeningDB.loadReviewItems() : Promise.resolve([]),
    window.OpeningDB.loadRepairAttempts ? window.OpeningDB.loadRepairAttempts() : Promise.resolve([])
  ]);

  const intent = getTrainingIntent();
  if (intent?.mode) {
    state.mode = intent.mode;
    state.selectedQueueId = intent.source_type && intent.source_id ? `${intent.source_type}:${intent.source_id}` : state.selectedQueueId;
    clearTrainingIntent();
  }

  ensureSelectedQueueItem();
  paint();
}

$("trainerModeTabs")?.addEventListener("click", event => {
  const button = event.target.closest("[data-training-mode]");
  if (!button) return;
  state.mode = button.dataset.trainingMode;
  state.session = null;
  state.selectedQueueId = "";
  setTrainingIntent({ mode: state.mode });
  paint();
});

$("trainingQueueList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-queue-id]");
  if (!button) return;
  state.selectedQueueId = button.dataset.queueId;
  state.session = null;
  paint();
});

$("trainerRootSelect")?.addEventListener("change", event => {
  state.rootId = event.target.value || "";
  state.selectedQueueId = "";
  state.session = null;
  paint();
});

$("trainerLineModeSelect")?.addEventListener("change", event => {
  state.lineMode = event.target.value || "due_only";
  state.selectedQueueId = "";
  state.session = null;
  paint();
});

$("trainerColorWhiteBtn")?.addEventListener("click", () => {
  state.openingColor = "white";
  state.selectedQueueId = "";
  state.session = null;
  paint();
});

$("trainerColorBlackBtn")?.addEventListener("click", () => {
  state.openingColor = "black";
  state.selectedQueueId = "";
  state.session = null;
  paint();
});

$("trainerColorAllBtn")?.addEventListener("click", () => {
  state.openingColor = "all";
  state.selectedQueueId = "";
  state.session = null;
  paint();
});

$("startTrainingBtn")?.addEventListener("click", () => startQueueEntry(selectedQueueItem()));
$("clearTrainingBtn")?.addEventListener("click", () => resetSession(false));

$("trainerForm")?.addEventListener("submit", event => {
  event.preventDefault();
  const answer = $("trainerAnswerInput").value.trim();
  if (!answer && state.session?.type !== "opening_line") {
    if (state.session) {
      state.session.revealOpen = true;
      state.session.awaitingGrade = true;
      state.session.finished = true;
      paint();
    }
    return;
  }

  if (state.session?.type === "opening_line") handleOpeningSubmit(answer);
  else if (state.session?.type === "position") handlePositionSubmit(answer);
  else if (state.session?.type === "repair") handleRepairSubmit(answer);
});

$("continueTrainingBtn")?.addEventListener("click", () => {
  if (state.session?.type !== "opening_line") return;
  advanceOpeningStep();
  paint();
});

$("nextTrainingBtn")?.addEventListener("click", startNextQueueItem);

$("revealPromptBtn")?.addEventListener("click", () => {
  if (!state.session) return;
  state.session.revealOpen = !state.session.revealOpen;
  if (state.session.type !== "opening_line") {
    state.session.awaitingGrade = state.session.revealOpen || state.session.awaitingGrade;
    state.session.finished = state.session.revealOpen || state.session.finished;
  } else if (state.session.revealOpen && !state.session.awaitingGrade) {
    state.session.failed = true;
    completeSession("Answer revealed. Grade the line honestly before moving on.");
  }
  paint();
});

$("whyPromptBtn")?.addEventListener("click", () => {
  if (!state.session) return;
  state.session.whyOpen = !state.session.whyOpen;
  paint();
});

$("reviewAgainBtn")?.addEventListener("click", () => applyGrade("again"));
$("reviewHardBtn")?.addEventListener("click", () => applyGrade("hard"));
$("reviewGoodBtn")?.addEventListener("click", () => applyGrade("good"));
$("reviewEasyBtn")?.addEventListener("click", () => applyGrade("easy"));

try {
  await refresh();
  clearTrainingIntent();
} catch (error) {
  reportActionError("Loading training", error, "Run the updated supabase/schema.sql if the final review tables are not available in Supabase yet.");
}
