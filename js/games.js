import { requireOnlyMe } from "./auth/only-me-guard.js";
import { bindImportButton, initPageChrome } from "./ui-shell.js";
import { checklistForGame, checklistProgress, gameNeedsWork, gameStatusLabel } from "./game-analysis-utils.js";
import { getStoredBoardAppearance } from "./board-appearance.js";
import { setSelectedPositionId, setSelectedRepairId } from "./navigation-state.js";
import {
  $,
  annotationLabel,
  boardViewFromFen,
  downloadJsonFile,
  escapeHtml,
  findDeepestOpeningMatch,
  formatActionError,
  gameSubtitle,
  gameTitle,
  lineTextFromAnnotations,
  parsePgnBundle,
  reportActionError,
  setHtml,
  setText,
  showToast,
  tagsFromCommaText
} from "./chess-brain-utils.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/games.js.");
}

const SELECTED_GAME_STORAGE_KEY = "gm_brain_selected_game_v1";
const SELECTED_GAME_PLY_STORAGE_KEY = "gm_brain_selected_game_ply_v1";

const STATUS_ORDER = [
  "imported_only",
  "quick_classified",
  "human_analysis_started",
  "human_analysis_complete",
  "engine_checked_later",
  "lessons_extracted",
  "repairs_created"
];

let nodes = [];
let repairs = [];
let games = [];
let annotations = [];
let positions = [];
let mistakes = [];
let reviewItems = [];
let repairAttempts = [];
let supportCards = [];
let goals = [];
let appReminders = [];
let books = [];
let bookNotes = [];
let tournamentNotes = [];
let quickIdeas = [];
let selectedGameId = localStorage.getItem(SELECTED_GAME_STORAGE_KEY) || null;
let selectedPly = Number.parseInt(localStorage.getItem(SELECTED_GAME_PLY_STORAGE_KEY) || "0", 10) || 0;

function saveSelection() {
  if (selectedGameId) localStorage.setItem(SELECTED_GAME_STORAGE_KEY, selectedGameId);
  else localStorage.removeItem(SELECTED_GAME_STORAGE_KEY);

  localStorage.setItem(SELECTED_GAME_PLY_STORAGE_KEY, String(selectedPly || 0));
}

function selectedGame() {
  return games.find(game => game.id === selectedGameId) || null;
}

function repairById(id) {
  return repairs.find(repair => repair.id === id) || null;
}

function positionById(id) {
  return positions.find(position => position.id === id) || null;
}

function selectedGameAnnotations() {
  return annotations
    .filter(annotation => annotation.game_id === selectedGameId)
    .sort((left, right) => left.ply - right.ply);
}

function selectedAnnotation() {
  return selectedGameAnnotations().find(annotation => annotation.ply === selectedPly) || null;
}

function clampSelectedPly() {
  const maxPly = selectedGameAnnotations().length;
  selectedPly = Math.max(0, Math.min(selectedPly || 0, maxPly));
  saveSelection();
}

function selectGame(id, ply = null) {
  selectedGameId = id || null;
  if (!selectedGameId) {
    selectedPly = 0;
    saveSelection();
    paint();
    return;
  }

  if (ply === null) {
    clampSelectedPly();
  } else {
    selectedPly = Math.max(0, ply);
    clampSelectedPly();
  }

  paint();
}

function setSelectedPly(ply) {
  selectedPly = Math.max(0, ply);
  clampSelectedPly();
  paint();
}

function humanSideForAnnotation(annotation) {
  return annotation?.ply % 2 === 1 ? "white" : "black";
}

function bumpStatus(current, candidate) {
  const currentIndex = STATUS_ORDER.indexOf(current);
  const candidateIndex = STATUS_ORDER.indexOf(candidate);

  if (candidateIndex > currentIndex) return candidate;
  return current;
}

function openingMatchForCurrentPly() {
  const game = selectedGame();
  if (!game) return null;

  const currentAnnotations = selectedGameAnnotations();
  const limit = selectedPly || currentAnnotations.length;
  return findDeepestOpeningMatch(nodes, currentAnnotations, limit) || null;
}

function pieceCountFromFen(fen) {
  const placement = String(fen || "").split(" ")[0] || "";
  return [...placement].filter(char => /[prnbqkPRNBQK]/.test(char)).length;
}

function inferPhase(annotation) {
  const pieceCount = pieceCountFromFen(annotation?.fen_before || "");
  if (pieceCount <= 12) return "endgame";
  if ((annotation?.ply || 0) <= 16) return "opening";
  return "middlegame";
}

function inferPositionType(annotation) {
  const phase = inferPhase(annotation);
  if (phase === "opening") return "opening";
  if (phase === "endgame") return "endgame";
  return "middlegame";
}

function inferMistakeCategory(annotation) {
  const text = [
    annotation?.critical_type,
    annotation?.human_comment_before,
    annotation?.human_comment_after,
    annotation?.emotional_state
  ].join(" ").toLowerCase();

  if (text.includes("opening")) return "opening";
  if (text.includes("endgame")) return "endgame";
  if (text.includes("time")) return "time_management";
  if (text.includes("emotion") || text.includes("fear") || text.includes("tilt") || text.includes("nerv")) return "psychology_emotion";
  if (text.includes("defend")) return "defense";
  if (text.includes("convert")) return "conversion";
  if (text.includes("strateg")) return "strategy";
  if (text.includes("tactic")) return "tactics";

  return "calculation";
}

function inferMistakeSeverity(annotation) {
  if (annotation?.is_critical) return "serious";
  if (annotation?.mistake_flag) return "medium";
  return "small";
}

function parseFenTurn(fen) {
  const turn = String(fen || "").split(" ")[1];
  return turn === "b" ? "b" : "w";
}

function noteFieldsFromForm() {
  return {
    human_comment_before: $("humanBeforeInput")?.value.trim() || "",
    human_comment_after: $("humanAfterInput")?.value.trim() || "",
    candidate_moves: tagsFromCommaText($("candidateMovesInput")?.value || ""),
    rejected_candidate_moves: tagsFromCommaText($("rejectedMovesInput")?.value || ""),
    expected_reply: $("expectedReplyInput")?.value.trim() || "",
    actual_reply: $("actualReplyInput")?.value.trim() || "",
    evaluation_human: $("evaluationInput")?.value.trim() || "",
    confidence_level: $("confidenceInput")?.value.trim() || "",
    critical_type: $("criticalTypeInput")?.value.trim() || "",
    emotional_state: $("emotionalStateInput")?.value.trim() || "",
    is_critical: $("criticalMomentInput")?.checked === true,
    mistake_flag: $("mistakeFlagInput")?.checked === true,
    lesson_flag: Boolean($("humanAfterInput")?.value.trim())
  };
}

function disableIds(ids, disabled) {
  ids.forEach(id => {
    const element = $(id);
    if (element) element.disabled = disabled;
  });
}

function fullBackupPayload() {
  return {
    version: 8,
    exported_at: new Date().toISOString(),
    nodes,
    repairs,
    games,
    game_annotations: annotations,
    positions,
    mistakes,
    review_items: reviewItems,
    repair_attempts: repairAttempts,
    support_cards: supportCards,
    goals,
    app_reminders: appReminders,
    books,
    book_notes: bookNotes,
    tournament_notes: tournamentNotes,
    quick_ideas: quickIdeas,
    board_settings: getStoredBoardAppearance()
  };
}

function renderIntroStats() {
  const criticalMoments = annotations.filter(annotation => annotation.is_critical).length;
  const needsWork = games.filter(game => gameNeedsWork(game, annotations)).length;

  setText("gameCountPill", `${games.length} game${games.length === 1 ? "" : "s"} stored`);
  setText("criticalCountPill", `${criticalMoments} critical moment${criticalMoments === 1 ? "" : "s"}`);
  setText("gameQueueBadge", `${needsWork} need work`);
}

function renderGameList() {
  const list = $("gameList");
  if (!list) return;

  list.innerHTML = games.map(game => {
    const gameAnnotations = annotations.filter(annotation => annotation.game_id === game.id);
    const criticalCount = gameAnnotations.filter(annotation => annotation.is_critical).length;
    const extractedCount = gameAnnotations.filter(annotation => annotation.position_id || annotation.mistake_id || annotation.repair_id).length;
    const selectedClass = game.id === selectedGameId ? " is-active" : "";

    return `
      <button class="game-list-card${selectedClass}" data-game-id="${game.id}" type="button">
        <span class="study-choice-kicker">${escapeHtml(game.analysis_complete ? "Complete" : gameStatusLabel(game.analysis_status))}</span>
        <strong>${escapeHtml(gameTitle(game))}</strong>
        <span class="muted">${escapeHtml(gameSubtitle(game) || "No subtitle yet")}</span>
        <div class="game-list-meta">
          <span>${gameAnnotations.length} ply</span>
          <span>${criticalCount} critical</span>
          <span>${extractedCount} extracted</span>
        </div>
      </button>
    `;
  }).join("") || `<div class="line-empty">No games yet. Paste or import a PGN to start your analysis archive.</div>`;
}

function renderReplayBoard() {
  const board = $("gameBoard");
  if (!board) return;

  const game = selectedGame();
  const currentAnnotations = selectedGameAnnotations();
  const annotation = selectedAnnotation();
  const currentMatch = openingMatchForCurrentPly();
  const boardFen = annotation?.fen_after || "";
  const boardView = boardViewFromFen(boardFen, annotation ? {
    from: annotation.from_square || "",
    to: annotation.to_square || ""
  } : null);

  if (!game) {
    setText("gameBoardTitle", "No game selected");
    setText("gameBoardSubtitle", "Import a PGN and the board will build a replayable move-by-move analysis workspace.");
    setText("gameBoardMeta", "Waiting for PGN");
    setText("gameMoveValue", "Start position");
    setText("gameMoveCaption", "The selected ply will appear here.");
    setText("gameOpeningValue", "No match yet");
    setText("gameOpeningCaption", "When the imported game overlaps your opening tree, the deepest matching node will show here.");
    setText("gameStatusValue", "Imported only");
    setText("gameStatusCaption", "Move notes and extracted lessons will push the game through the workflow.");
    board.innerHTML = boardView.html;
    setHtml("gameMoveList", `<div class="line-empty">No moves yet.</div>`);
    return;
  }

  const title = gameTitle(game);
  const subtitleBits = [
    gameSubtitle(game),
    currentAnnotations.length ? `${selectedPly}/${currentAnnotations.length} ply selected` : "No moves parsed"
  ].filter(Boolean);

  setText("gameBoardTitle", title);
  setText("gameBoardSubtitle", subtitleBits.join(" • "));
  setText("gameBoardMeta", annotation ? `${boardView.turnText} / ${annotationLabel(annotation)}` : "Start position");
  setText("gameMoveValue", annotation ? annotationLabel(annotation) : "Start position");
  setText("gameMoveCaption", annotation
    ? (annotation.human_comment_after || annotation.human_comment_before || "No human note saved on this move yet.")
    : "Use the move list or replay controls to step through the game.");
  setText("gameOpeningValue", currentMatch?.title || currentMatch?.move || game.linked_opening_title || "No match yet");
  setText("gameOpeningCaption", currentMatch
    ? `Matched your tree through ${currentMatch.move}.`
    : "This line has not matched a stored opening branch yet.");
  setText("gameStatusValue", game.analysis_complete ? "Analysis complete" : gameStatusLabel(game.analysis_status));
  setText("gameStatusCaption", game.analysis_complete
    ? (game.summary || "This game is marked analysis complete.")
    : (game.summary || "Capture the overall lesson when the game story becomes clear."));
  board.innerHTML = boardView.html;

  setHtml("gameMoveList", currentAnnotations.map(move => {
    const activeClass = move.ply === selectedPly ? " is-active" : "";
    const flags = [
      move.is_critical ? `<span class="mini-tag">Critical</span>` : "",
      move.mistake_flag ? `<span class="mini-tag">Mistake</span>` : "",
      move.position_id ? `<span class="mini-tag">Position</span>` : "",
      move.repair_id ? `<span class="mini-tag">Repair</span>` : ""
    ].filter(Boolean).join("");

    return `
      <button class="move-ply-chip${activeClass}" data-ply="${move.ply}" type="button">
        <strong>${escapeHtml(annotationLabel(move))}</strong>
        <span class="move-ply-caption">${escapeHtml(move.human_comment_after || move.human_comment_before || "No note yet")}</span>
        <span class="move-ply-flags">${flags}</span>
      </button>
    `;
  }).join("") || `<div class="line-empty">This PGN did not yield readable moves.</div>`);
}

function renderGameMeta() {
  const game = selectedGame();
  const disabled = !game;

  if ($("analysisStatusInput")) {
    $("analysisStatusInput").value = game?.analysis_status || "imported_only";
  }
  if ($("gameSummaryInput")) {
    $("gameSummaryInput").value = game?.summary || "";
  }

  if ($("markGameCompleteBtn")) {
    $("markGameCompleteBtn").disabled = disabled;
    $("markGameCompleteBtn").textContent = game?.analysis_complete ? "Marked complete" : "Mark analysis complete";
  }

  disableIds(["analysisStatusInput", "gameSummaryInput", "saveGameMetaBtn", "deleteGameBtn"], disabled);
}

function renderChecklist() {
  const game = selectedGame();
  const host = $("gameChecklist");
  if (!host) return;

  if (!game) {
    host.innerHTML = `<div class="line-empty">Import a game and the analysis checklist will appear here.</div>`;
    return;
  }

  const checklist = checklistForGame(game, annotations);
  host.innerHTML = checklist.map(item => `
    <article class="heatmap-row">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${item.done ? "Done" : "Open"}</span>
    </article>
  `).join("");
}

function renderMistakeList() {
  const host = $("gameMistakeList");
  if (!host) return;

  const game = selectedGame();
  if (!game) {
    host.innerHTML = `<div class="line-empty">Select a game to see its saved mistake records.</div>`;
    return;
  }

  const gameMistakes = mistakes
    .filter(mistake => mistake.source_type === "game" && mistake.source_id === game.id)
    .sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")));

  host.innerHTML = gameMistakes.length
    ? gameMistakes.map(mistake => {
      const linkedAnnotation = selectedGameAnnotations().find(annotation => annotation.mistake_id === mistake.id) || null;
      const linkedPosition = positionById(mistake.position_id);
      const linkedRepair = linkedAnnotation?.repair_id
        ? repairById(linkedAnnotation.repair_id)
        : repairs.find(repair => repair.linked_position_id === mistake.position_id) || null;
      const summary = mistake.correct_thinking_rule || mistake.why_it_happened || mistake.what_i_missed || "No summary saved yet.";

      return `
        <article class="game-mistake-item" data-mistake-id="${mistake.id}">
          <div class="game-mistake-meta">
            <span class="study-choice-kicker">${escapeHtml(mistake.category || "mistake")}</span>
            <span class="mini-tag">${escapeHtml(mistake.severity || "normal")}</span>
            ${mistake.side ? `<span class="mini-tag">${escapeHtml(mistake.side)}</span>` : ""}
          </div>
          <h4>${escapeHtml(mistake.title || "Mistake record")}</h4>
          <p>${escapeHtml(summary)}</p>
          <div class="game-mistake-meta">
            <span>${escapeHtml(linkedAnnotation ? annotationLabel(linkedAnnotation) : "No move jump saved yet")}</span>
            <span>${escapeHtml(linkedPosition?.title || "No linked position yet")}</span>
            <span>${escapeHtml(linkedRepair?.mistake || "No repair card yet")}</span>
          </div>
          <div class="form-actions game-mistake-actions">
            <button class="button button-secondary button-tiny" type="button" data-mistake-action="jump"${linkedAnnotation ? "" : " disabled"}>Jump to move</button>
            <button class="button button-ghost button-tiny" type="button" data-mistake-action="position"${linkedPosition ? "" : " disabled"}>Open position</button>
            <button class="button button-primary button-tiny" type="button" data-mistake-action="repair"${linkedRepair ? "" : " disabled"}>Open repair</button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="line-empty">No mistake records for this game yet. Save one from a move, then use this list to revisit it.</div>`;
}

function renderAnnotationEditor() {
  const annotation = selectedAnnotation();
  const disabled = !annotation;

  setText(
    "annotationEditorStatus",
    annotation
      ? `Editing ${annotationLabel(annotation)}. Record what you thought before the move and what the lesson became after it.`
      : "Select a move in the replay to record what you thought, feared, or missed."
  );

  setText(
    "annotationHintBanner",
    annotation
      ? `Working on ${annotationLabel(annotation)}`
      : "No move selected yet."
  );

  if ($("humanBeforeInput")) $("humanBeforeInput").value = annotation?.human_comment_before || "";
  if ($("humanAfterInput")) $("humanAfterInput").value = annotation?.human_comment_after || "";
  if ($("candidateMovesInput")) $("candidateMovesInput").value = (annotation?.candidate_moves || []).join(", ");
  if ($("rejectedMovesInput")) $("rejectedMovesInput").value = (annotation?.rejected_candidate_moves || []).join(", ");
  if ($("expectedReplyInput")) $("expectedReplyInput").value = annotation?.expected_reply || "";
  if ($("actualReplyInput")) $("actualReplyInput").value = annotation?.actual_reply || "";
  if ($("evaluationInput")) $("evaluationInput").value = annotation?.evaluation_human || "";
  if ($("confidenceInput")) $("confidenceInput").value = annotation?.confidence_level || "";
  if ($("criticalTypeInput")) $("criticalTypeInput").value = annotation?.critical_type || "";
  if ($("emotionalStateInput")) $("emotionalStateInput").value = annotation?.emotional_state || "";
  if ($("criticalMomentInput")) $("criticalMomentInput").checked = annotation?.is_critical === true;
  if ($("mistakeFlagInput")) $("mistakeFlagInput").checked = annotation?.mistake_flag === true;

  disableIds([
    "humanBeforeInput",
    "humanAfterInput",
    "candidateMovesInput",
    "rejectedMovesInput",
    "expectedReplyInput",
    "actualReplyInput",
    "evaluationInput",
    "confidenceInput",
    "criticalTypeInput",
    "emotionalStateInput",
    "criticalMomentInput",
    "mistakeFlagInput",
    "saveAnnotationBtn",
    "createPositionBtn",
    "createMistakeBtn",
    "createRepairBtn"
  ], disabled);
}

function updateReplayControls() {
  const moveCount = selectedGameAnnotations().length;
  const hasGame = Boolean(selectedGame());

  disableIds(["gameStartBtn", "gamePrevBtn", "gameNextBtn", "gameEndBtn"], !hasGame);

  if ($("gameStartBtn")) $("gameStartBtn").disabled = !hasGame || selectedPly === 0;
  if ($("gamePrevBtn")) $("gamePrevBtn").disabled = !hasGame || selectedPly === 0;
  if ($("gameNextBtn")) $("gameNextBtn").disabled = !hasGame || selectedPly >= moveCount;
  if ($("gameEndBtn")) $("gameEndBtn").disabled = !hasGame || selectedPly >= moveCount;
}

function paint() {
  renderIntroStats();
  renderGameList();
  renderReplayBoard();
  renderGameMeta();
  renderChecklist();
  renderMistakeList();
  renderAnnotationEditor();
  updateReplayControls();
}

function buildImportedGame(headers, bundle) {
  const matchedOpening = findDeepestOpeningMatch(nodes, bundle.annotations);
  const now = new Date().toISOString();

  return OpeningDB.normalizeGame({
    id: crypto.randomUUID(),
    event: headers.Event || "",
    site: headers.Site || "",
    date: headers.Date || "",
    round: headers.Round || "",
    time_control: headers.TimeControl || "",
    platform: $("gamePlatformInput")?.value.trim() || "",
    user_color: $("gameUserColorInput")?.value || "white",
    white_player: headers.White || "",
    black_player: headers.Black || "",
    result: headers.Result || "*",
    opening_name: headers.Opening || "",
    eco: headers.ECO || "",
    pgn: bundle.rawPgn,
    final_fen: bundle.finalFen,
    summary: "",
    tags: tagsFromCommaText($("gameTagsInput")?.value || ""),
    analysis_status: "imported_only",
    analysis_complete: false,
    analysis_completed_at: null,
    linked_opening_node_id: matchedOpening?.id || null,
    linked_opening_title: matchedOpening?.title || matchedOpening?.move || "",
    created_at: now,
    updated_at: now
  });
}

async function importCurrentPgn(textOverride = "") {
  const sourceText = textOverride || $("pgnInput")?.value || "";
  const bundle = parsePgnBundle(sourceText);
  const game = buildImportedGame(bundle.headers, bundle);
  const now = new Date().toISOString();
  const importedAnnotations = bundle.annotations.map(annotation => OpeningDB.normalizeGameAnnotation({
    ...annotation,
    game_id: game.id,
    created_at: now,
    updated_at: now
  }));

  await OpeningDB.upsertGame(game);
  await OpeningDB.saveAllGameAnnotations([...annotations, ...importedAnnotations], { allowEmpty: true });

  selectedGameId = game.id;
  selectedPly = 0;
  saveSelection();

  if ($("pgnInput")) $("pgnInput").value = "";
  if ($("gameTagsInput")) $("gameTagsInput").value = "";
  if ($("gamePlatformInput")) $("gamePlatformInput").value = "";

  await refresh();
  showToast(navigator.onLine ? "Game imported." : "Game imported locally.");
}

async function saveGameMeta() {
  const game = selectedGame();
  if (!game) return;

  const updated = {
    ...game,
    analysis_status: $("analysisStatusInput")?.value || game.analysis_status,
    summary: $("gameSummaryInput")?.value.trim() || "",
    analysis_complete: game.analysis_complete === true,
    analysis_completed_at: game.analysis_completed_at || null,
    updated_at: new Date().toISOString()
  };

  await OpeningDB.upsertGame(updated);
  await refresh();
  showToast(navigator.onLine ? "Game meta saved." : "Game meta saved locally.");
}

async function saveMoveNote() {
  const game = selectedGame();
  const annotation = selectedAnnotation();
  if (!game || !annotation) return;

  const fields = noteFieldsFromForm();
  const updatedAnnotation = {
    ...annotation,
    ...fields,
    updated_at: new Date().toISOString()
  };
  const nextStatus = Object.values(fields).some(value => Array.isArray(value) ? value.length : Boolean(value))
    ? bumpStatus(game.analysis_status, "human_analysis_started")
    : game.analysis_status;

  await OpeningDB.upsertGameAnnotation(updatedAnnotation);
  if (nextStatus !== game.analysis_status) {
    await OpeningDB.upsertGame({
      ...game,
      analysis_status: nextStatus,
      updated_at: new Date().toISOString()
    });
  }

  await refresh();
  showToast(navigator.onLine ? "Move note saved." : "Move note saved locally.");
}

async function ensurePositionFromCurrentMove() {
  const game = selectedGame();
  const annotation = selectedAnnotation();
  if (!game || !annotation) {
    throw new Error("Choose a move first so the app knows which decision point to save.");
  }

  if (annotation.position_id) {
    return positions.find(position => position.id === annotation.position_id) || null;
  }

  const linkedOpening = openingMatchForCurrentPly();
  const now = new Date().toISOString();
  const position = await OpeningDB.upsertPosition({
    id: crypto.randomUUID(),
    fen: annotation.fen_before,
    pgn_context: lineTextFromAnnotations(selectedGameAnnotations(), annotation.ply),
    side_to_move: parseFenTurn(annotation.fen_before),
    move_number: annotation.move_number,
    source_type: "game",
    source_label: gameTitle(game),
    source_url: "",
    source_id: game.id,
    title: `Position before ${annotationLabel(annotation)}`,
    short_question: `What should be understood before ${annotationLabel(annotation)}?`,
    position_type: inferPositionType(annotation),
    themes: tagsFromCommaText(annotation.critical_type),
    tags: [game.opening_name, game.event].filter(Boolean),
    difficulty: "",
    priority: annotation.is_critical ? "high" : "normal",
    human_evaluation: annotation.evaluation_human,
    correct_idea: annotation.human_comment_after,
    wrong_idea: annotation.human_comment_before,
    candidate_moves: annotation.candidate_moves,
    best_human_move: annotation.san,
    lesson: annotation.human_comment_after || annotation.critical_type,
    linked_repair_id: null,
    linked_opening_node_id: linkedOpening?.id || game.linked_opening_node_id || null,
    linked_game_id: game.id,
    linked_book_id: null,
    linked_book_note_id: null,
    review_enabled: true,
    last_reviewed_at: null,
    next_review_at: null,
    created_at: now,
    updated_at: now
  });

  await OpeningDB.upsertGameAnnotation({
    ...annotation,
    position_id: position.id,
    lesson_flag: true,
    updated_at: now
  });

  await OpeningDB.upsertGame({
    ...game,
    analysis_status: bumpStatus(game.analysis_status, "lessons_extracted"),
    updated_at: now
  });

  return position;
}

async function ensureMistakeFromCurrentMove(positionOverride = null) {
  const game = selectedGame();
  const annotation = selectedAnnotation();
  if (!game || !annotation) {
    throw new Error("Choose a move first so the mistake can be tied to a concrete decision.");
  }

  if (annotation.mistake_id) {
    return mistakes.find(mistake => mistake.id === annotation.mistake_id) || null;
  }

  const position = positionOverride || await ensurePositionFromCurrentMove();
  const linkedOpening = openingMatchForCurrentPly();
  const now = new Date().toISOString();

  const mistake = await OpeningDB.upsertMistake({
    id: crypto.randomUUID(),
    title: `Mistake at ${annotationLabel(annotation)}`,
    source_type: "game",
    source_id: game.id,
    position_id: position?.id || null,
    linked_opening_node_id: linkedOpening?.id || game.linked_opening_node_id || null,
    move_number: annotation.move_number,
    category: inferMistakeCategory(annotation),
    cause: annotation.critical_type || annotation.emotional_state || "Cause not named yet",
    severity: inferMistakeSeverity(annotation),
    phase: inferPhase(annotation),
    side: humanSideForAnnotation(annotation),
    what_i_played: annotation.san,
    what_i_missed: annotation.candidate_moves[0] || annotation.expected_reply || "",
    why_it_happened: annotation.human_comment_before || annotation.emotional_state || "",
    correct_thinking_rule: annotation.human_comment_after || "",
    recurrence_key: annotation.critical_type || game.opening_name || "",
    tags: [game.opening_name, annotation.critical_type].filter(Boolean),
    created_at: now,
    updated_at: now
  });

  await OpeningDB.upsertGameAnnotation({
    ...annotation,
    mistake_id: mistake.id,
    mistake_flag: true,
    updated_at: now
  });

  await OpeningDB.upsertGame({
    ...game,
    analysis_status: bumpStatus(game.analysis_status, "lessons_extracted"),
    updated_at: now
  });

  return mistake;
}

async function ensureRepairFromCurrentMove() {
  const game = selectedGame();
  const annotation = selectedAnnotation();
  if (!game || !annotation) {
    throw new Error("Choose a move first so the repair card knows which moment it belongs to.");
  }

  if (annotation.repair_id) {
    return repairs.find(repair => repair.id === annotation.repair_id) || null;
  }

  const position = await ensurePositionFromCurrentMove();
  const mistake = await ensureMistakeFromCurrentMove(position);
  const linkedOpening = openingMatchForCurrentPly();
  const now = new Date().toISOString();

  const repair = await OpeningDB.upsertRepairItem({
    id: crypto.randomUUID(),
    related_node_id: linkedOpening?.id || game.linked_opening_node_id || null,
    linked_opening_node_id: linkedOpening?.id || game.linked_opening_node_id || null,
    position_path: lineTextFromAnnotations(selectedGameAnnotations(), annotation.ply),
    mistake: mistake?.title || `Mistake at ${annotationLabel(annotation)}`,
    lesson: annotation.human_comment_after || mistake?.correct_thinking_rule || "Capture the lesson from this move.",
    repair: position?.lesson || "Replay the position and rehearse the correct human plan.",
    repair_action: position?.lesson || "Replay the position and rehearse the correct human plan.",
    test_question: annotation.human_comment_before || `What should be remembered before ${annotationLabel(annotation)}?`,
    correct_response: annotation.human_comment_after || position?.best_human_move || "",
    linked_position_id: position?.id || null,
    linked_game_id: game.id,
    linked_annotation_id: annotation.id,
    severity: annotation.is_critical ? "high" : "normal",
    category: inferMistakeCategory(annotation) === "tactics" ? "tactic" : inferPositionType(annotation),
    status: "captured",
    review_enabled: true,
    last_reviewed_at: null,
    next_review_at: null,
    created_at: now,
    updated_at: now
  });

  await OpeningDB.upsertGameAnnotation({
    ...annotation,
    repair_id: repair.id,
    updated_at: now
  });

  if (position) {
    await OpeningDB.upsertPosition({
      ...position,
      linked_repair_id: repair.id,
      updated_at: now
    });
  }

  await OpeningDB.upsertGame({
    ...game,
    analysis_status: bumpStatus(game.analysis_status, "repairs_created"),
    updated_at: now
  });

  return repair;
}

async function refresh() {
  [
    nodes,
    repairs,
    games,
    annotations,
    positions,
    mistakes,
    reviewItems,
    repairAttempts,
    supportCards,
    goals,
    appReminders,
    books,
    bookNotes,
    tournamentNotes,
    quickIdeas
  ] = await Promise.all([
    OpeningDB.loadNodes(),
    OpeningDB.loadRepairItems(),
    OpeningDB.loadGames(),
    OpeningDB.loadGameAnnotations(),
    OpeningDB.loadPositions(),
    OpeningDB.loadMistakes(),
    OpeningDB.loadReviewItems ? OpeningDB.loadReviewItems() : Promise.resolve([]),
    OpeningDB.loadRepairAttempts ? OpeningDB.loadRepairAttempts() : Promise.resolve([]),
    OpeningDB.loadSupportCards(),
    OpeningDB.loadGoals(),
    OpeningDB.loadAppReminders(),
    OpeningDB.loadBooks(),
    OpeningDB.loadBookNotes(),
    OpeningDB.loadTournamentNotes(),
    OpeningDB.loadQuickIdeas()
  ]);

  if (selectedGameId && !selectedGame()) {
    selectedGameId = null;
    selectedPly = 0;
  }

  if (!selectedGameId && games.length) {
    selectedGameId = games[0].id;
  }

  clampSelectedPly();
  paint();
}

const gameList = $("gameList");
if (gameList) {
  gameList.addEventListener("click", event => {
    const button = event.target.closest("[data-game-id]");
    if (!button) return;
    selectGame(button.dataset.gameId, 0);
  });
}

const moveList = $("gameMoveList");
if (moveList) {
  moveList.addEventListener("click", event => {
    const button = event.target.closest("[data-ply]");
    if (!button) return;
    setSelectedPly(Number.parseInt(button.dataset.ply, 10) || 0);
  });
}

$("gameMistakeList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-mistake-action]");
  const row = event.target.closest("[data-mistake-id]");
  if (!button || !row) return;

  const mistake = mistakes.find(entry => entry.id === row.dataset.mistakeId);
  if (!mistake) return;

  const linkedAnnotation = selectedGameAnnotations().find(annotation => annotation.mistake_id === mistake.id) || null;
  const linkedRepair = linkedAnnotation?.repair_id
    ? repairById(linkedAnnotation.repair_id)
    : repairs.find(repair => repair.linked_position_id === mistake.position_id) || null;

  if (button.dataset.mistakeAction === "jump" && linkedAnnotation) {
    setSelectedPly(linkedAnnotation.ply || 0);
    return;
  }

  if (button.dataset.mistakeAction === "position" && mistake.position_id) {
    setSelectedPositionId(mistake.position_id);
    window.location.href = "./positions.html";
    return;
  }

  if (button.dataset.mistakeAction === "repair" && linkedRepair) {
    setSelectedRepairId(linkedRepair.id);
    window.location.href = "./repair.html";
  }
});

$("importGameBtn")?.addEventListener("click", async () => {
  try {
    await importCurrentPgn();
  } catch (error) {
    reportActionError("Importing PGN", error);
  }
});

const pgnFileBtn = $("pgnFileBtn");
const pgnFileInput = $("pgnFileInput");
if (pgnFileBtn && pgnFileInput) {
  bindImportButton(pgnFileBtn, pgnFileInput);
  pgnFileInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importCurrentPgn(text);
    } catch (error) {
      reportActionError("Importing PGN file", error);
    } finally {
      event.target.value = "";
    }
  });
}

$("saveGameMetaBtn")?.addEventListener("click", async () => {
  try {
    await saveGameMeta();
  } catch (error) {
    reportActionError("Saving game meta", error);
  }
});

$("markGameCompleteBtn")?.addEventListener("click", async () => {
  const game = selectedGame();
  if (!game) return;

  try {
    await OpeningDB.upsertGame({
      ...game,
      analysis_complete: true,
      analysis_completed_at: new Date().toISOString(),
      analysis_status: game.analysis_status === "imported_only" ? "human_analysis_complete" : game.analysis_status,
      updated_at: new Date().toISOString()
    });
    await refresh();
    showToast("Game marked analysis complete.");
  } catch (error) {
    reportActionError("Marking game complete", error);
  }
});

$("saveAnnotationBtn")?.addEventListener("click", async () => {
  try {
    await saveMoveNote();
  } catch (error) {
    reportActionError("Saving move note", error);
  }
});

$("createPositionBtn")?.addEventListener("click", async () => {
  try {
    const position = await ensurePositionFromCurrentMove();
    await refresh();
    showToast(position ? "Position saved to the vault." : "Position already linked.");
  } catch (error) {
    reportActionError("Saving position card", error);
  }
});

$("createMistakeBtn")?.addEventListener("click", async () => {
  try {
    const mistake = await ensureMistakeFromCurrentMove();
    await refresh();
    showToast(mistake ? "Mistake record created." : "Mistake already linked.");
  } catch (error) {
    reportActionError("Creating mistake record", error);
  }
});

$("createRepairBtn")?.addEventListener("click", async () => {
  try {
    const repair = await ensureRepairFromCurrentMove();
    await refresh();
    showToast(repair ? "Repair card created." : "Repair already linked.");
  } catch (error) {
    reportActionError("Creating repair card", error);
  }
});

$("deleteGameBtn")?.addEventListener("click", async () => {
  const game = selectedGame();
  if (!game || !confirm(`Delete "${gameTitle(game)}" and its move notes?`)) return;

  try {
    await OpeningDB.deleteGame(game.id);
    selectedGameId = null;
    selectedPly = 0;
    saveSelection();
    await refresh();
    showToast("Game deleted.");
  } catch (error) {
    reportActionError("Deleting game", error);
  }
});

$("gameStartBtn")?.addEventListener("click", () => setSelectedPly(0));
$("gamePrevBtn")?.addEventListener("click", () => setSelectedPly(selectedPly - 1));
$("gameNextBtn")?.addEventListener("click", () => setSelectedPly(selectedPly + 1));
$("gameEndBtn")?.addEventListener("click", () => setSelectedPly(selectedGameAnnotations().length));

$("gameExportBtn")?.addEventListener("click", () => {
  downloadJsonFile("gm-brain-full-backup.json", fullBackupPayload());
  showToast("Full backup exported.");
});

$("syncBtn")?.addEventListener("click", async () => {
  try {
    await OpeningDB.commitAllChanges?.();
    await refresh();
    showToast(navigator.onLine ? "Game changes committed." : "Offline mode active. Your game data is stored locally.");
  } catch (error) {
    reportActionError("Committing game changes", error);
  }
});

try {
  await refresh();
} catch (error) {
  const extra = formatActionError(error).includes("schema")
    ? "Run the updated supabase/schema.sql so the new game-analysis tables exist in Supabase."
    : "";
  reportActionError("Loading game analysis studio", error, extra);
}
