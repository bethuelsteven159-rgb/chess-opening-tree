import { requireOnlyMe } from "./auth/only-me-guard.js";
import { initPageChrome } from "./ui-shell.js";
import {
  $,
  escapeHtml,
  reportActionError,
  setHtml,
  setText,
  showToast
} from "./chess-brain-utils.js";
import {
  compareDateKeys,
  computeBookProgress,
  computeGoalProgress,
  formatDateLabel,
  isPastDate,
  isReminderDue,
  isWithinDays,
  nextDueDate,
  parseTagsInput,
  priorityRank,
  reminderVisibility,
  sortSupportCards,
  supportCommandItems,
  todayKey
} from "./support-utils.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/support.js.");
}

const SELECTED_BOOK_STORAGE_KEY = "gm_brain_selected_support_book_v1";
const SELECTED_SUPPORT_PANE_STORAGE_KEY = "gm_brain_selected_support_pane_v1";
const SUPPORT_FOCUS_STORAGE_KEY = "gm_support_focus_v1";
const SUPPORT_PANES = new Set(["quick", "goals", "reminders", "books", "cards", "tournaments", "ideas"]);
const STARTING_POSITION_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SUPPORT_CARD_LABELS = {
  identity: "Identity",
  principle: "Principle",
  quote: "Quote",
  anti_tilt: "Anti-tilt",
  advice: "Advice",
  checklist: "Checklist",
  mindset: "Mindset",
  study_rule: "Study rule",
  tournament: "Tournament",
  note: "Note"
};

const CATEGORY_LABELS = {
  vision: "Vision",
  discipline: "Discipline",
  emotional_control: "Emotional control",
  study_process: "Study process",
  tournament_strength: "Tournament strength",
  confidence: "Confidence",
  recovery: "Recovery",
  other: "Other"
};

const GOAL_STATUS_LABELS = {
  not_started: "Not started",
  active: "Active",
  paused: "Paused",
  achieved: "Achieved",
  abandoned: "Abandoned"
};

const REMINDER_STATUS_LABELS = {
  active: "Active",
  done: "Done",
  snoozed: "Snoozed",
  archived: "Archived"
};

const BOOK_STATUS_LABELS = {
  want_to_read: "Want to read",
  currently_reading: "Currently reading",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
  reference: "Reference"
};

const QUICK_IDEA_STATUS_LABELS = {
  inbox: "Inbox",
  converted: "Converted",
  archived: "Archived"
};

const STARTER_SUPPORT_CARDS = [
  {
    title: "Why this app exists",
    body: "This app is my chess brain. I am not collecting random notes; I am building a system that remembers, trains, and repairs what matters.",
    card_type: "identity",
    category: "vision",
    pinned: true,
    priority: "high"
  },
  {
    title: "After a painful loss",
    body: "Do not rage queue. Save the critical moment, name the mistake, create one repair, then leave the pain inside the system.",
    card_type: "anti_tilt",
    category: "emotional_control",
    pinned: true,
    priority: "critical"
  },
  {
    title: "Book rule",
    body: "A chess book only counts if it produces positions, ideas, cards, or repairs inside the app. Reading without extraction is entertainment.",
    card_type: "study_rule",
    category: "study_process",
    pinned: true,
    priority: "high"
  },
  {
    title: "Tournament reset",
    body: "Before the round: breathe, eat, check time, respect the opponent, and play the position. After the round: extract one lesson, not one excuse.",
    card_type: "tournament",
    category: "tournament_strength",
    pinned: false,
    priority: "normal"
  }
];

let supportCards = [];
let goals = [];
let appReminders = [];
let books = [];
let bookNotes = [];
let tournamentNotes = [];
let quickIdeas = [];
let linkedGames = [];
let linkedPositions = [];
let linkedRepairs = [];
let selectedBookId = localStorage.getItem(SELECTED_BOOK_STORAGE_KEY) || null;
let randomCardId = null;
let selectedSupportPane = localStorage.getItem(SELECTED_SUPPORT_PANE_STORAGE_KEY) || "quick";

if (!SUPPORT_PANES.has(selectedSupportPane)) {
  selectedSupportPane = "quick";
}

function nowIso() {
  return new Date().toISOString();
}

function consumeSupportFocus() {
  const raw = localStorage.getItem(SUPPORT_FOCUS_STORAGE_KEY);
  if (!raw) return null;
  localStorage.removeItem(SUPPORT_FOCUS_STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveSelectedSupportPane() {
  localStorage.setItem(SELECTED_SUPPORT_PANE_STORAGE_KEY, selectedSupportPane);
}

function saveSelectedBook() {
  if (selectedBookId) localStorage.setItem(SELECTED_BOOK_STORAGE_KEY, selectedBookId);
  else localStorage.removeItem(SELECTED_BOOK_STORAGE_KEY);
}

function selectedBook() {
  return books.find(book => book.id === selectedBookId) || null;
}

function supportCardById(id) {
  return supportCards.find(card => card.id === id) || null;
}

function goalById(id) {
  return goals.find(goal => goal.id === id) || null;
}

function reminderById(id) {
  return appReminders.find(reminder => reminder.id === id) || null;
}

function bookById(id) {
  return books.find(book => book.id === id) || null;
}

function bookNoteById(id) {
  return bookNotes.find(note => note.id === id) || null;
}

function tournamentNoteById(id) {
  return tournamentNotes.find(note => note.id === id) || null;
}

function quickIdeaById(id) {
  return quickIdeas.find(idea => idea.id === id) || null;
}

async function createDraftPositionFromText({ title, body, tags, sourceType = "manual", sourceLabel = "" }) {
  const stamp = nowIso();
  return OpeningDB.upsertPosition({
    id: crypto.randomUUID(),
    fen: STARTING_POSITION_FEN,
    pgn_context: "",
    side_to_move: "w",
    move_number: null,
    source_type: sourceType,
    source_id: null,
    source_label: sourceLabel,
    source_url: "",
    title: title || "Untitled position",
    short_question: "",
    position_type: "custom",
    themes: [],
    tags,
    difficulty: "",
    priority: "normal",
    human_evaluation: "",
    correct_idea: "",
    wrong_idea: "",
    candidate_moves: [],
    best_human_move: "",
    lesson: body || "",
    linked_repair_id: null,
    linked_opening_node_id: null,
    linked_game_id: null,
    linked_book_id: null,
    linked_book_note_id: null,
    review_enabled: true,
    last_reviewed_at: null,
    next_review_at: null,
    created_at: stamp,
    updated_at: stamp
  });
}

async function createRepairFromText({ title, body, tags }) {
  const stamp = nowIso();
  return OpeningDB.upsertRepairItem({
    id: crypto.randomUUID(),
    related_node_id: null,
    linked_opening_node_id: null,
    position_path: "",
    mistake: title || "Untitled repair",
    lesson: body || "",
    repair: body || "",
    repair_action: body || "",
    test_question: "",
    correct_response: "",
    linked_position_id: null,
    linked_game_id: null,
    linked_annotation_id: null,
    severity: "normal",
    category: "other",
    status: "captured",
    review_enabled: true,
    last_reviewed_at: null,
    next_review_at: null,
    created_at: stamp,
    updated_at: stamp
  });
}

function labelize(value, labels = {}) {
  return labels[value] || String(value || "").replace(/_/g, " ") || "Other";
}

function badgeHtml(text, kind = "") {
  return `<span class="mini-tag${kind ? ` ${kind}` : ""}">${escapeHtml(text)}</span>`;
}

function excerpt(text, maxLength = 180) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function progressBarHtml(value) {
  const percent = Math.max(0, Math.min(100, Math.round(value || 0)));
  return `
    <div class="support-progress-bar" aria-hidden="true">
      <div class="support-progress-fill" style="width: ${percent}%"></div>
    </div>
  `;
}

function tagRowHtml(tags = []) {
  if (!tags.length) return "";
  return `<div class="move-ply-flags">${tags.map(tag => badgeHtml(tag)).join("")}</div>`;
}

function optionHtml(value, label, selectedValue = "") {
  const selected = value === selectedValue ? " selected" : "";
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function syncSupportPaneState() {
  if (!SUPPORT_PANES.has(selectedSupportPane)) {
    selectedSupportPane = "quick";
  }

  document.querySelectorAll("[data-support-pane-button]").forEach(button => {
    const active = button.dataset.supportPaneButton === selectedSupportPane;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-support-pane]").forEach(panel => {
    const active = panel.dataset.supportPane === selectedSupportPane;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
    panel.setAttribute("aria-hidden", String(!active));
  });
}

function setSupportPane(pane, options = {}) {
  if (!SUPPORT_PANES.has(pane)) return;
  selectedSupportPane = pane;
  if (options.persist !== false) saveSelectedSupportPane();
  syncSupportPaneState();
  if (options.scroll) {
    $("supportWorkspaceTabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function fillSelectOptions(selectId, items, selectedValue, emptyLabel) {
  const select = $(selectId);
  if (!select) return;
  const current = selectedValue ?? select.value ?? "";
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${items.map(item => (
    `<option value="${item.id}"${item.id === current ? " selected" : ""}>${escapeHtml(item.title || item.event_name || item.move || "Untitled")}</option>`
  )).join("")}`;
}

function fillSupportCardMultiSelect(selectedIds = []) {
  const select = $("goalLinkedSupportCardsInput");
  if (!select) return;

  select.innerHTML = supportCards
    .filter(card => card.status === "active")
    .map(card => `
      <option value="${card.id}"${selectedIds.includes(card.id) ? " selected" : ""}>
        ${escapeHtml(card.title || "Untitled support card")}
      </option>
    `)
    .join("");
}

function selectedMultiValues(selectId) {
  const select = $(selectId);
  if (!select) return [];
  return [...select.selectedOptions].map(option => option.value).filter(Boolean);
}

function resetGoalForm() {
  $("goalIdInput").value = "";
  $("goalTitleInput").value = "";
  $("goalTypeInput").value = "ultimate";
  $("goalStatusInput").value = "active";
  $("goalPriorityInput").value = "normal";
  $("goalDescriptionInput").value = "";
  $("goalWhyInput").value = "";
  $("goalSuccessCriteriaInput").value = "";
  $("goalCurrentValueInput").value = "";
  $("goalTargetValueInput").value = "";
  $("goalUnitInput").value = "";
  $("goalManualProgressInput").value = "";
  $("goalTargetDateInput").value = "";
  $("goalParentInput").value = "";
  $("goalLinkedBookInput").value = "";
  $("goalTagsInput").value = "";
  fillSupportCardMultiSelect([]);
  setText("goalEditorState", "New goal");
}

function fillGoalForm(goal) {
  if (!goal) {
    resetGoalForm();
    return;
  }

  $("goalIdInput").value = goal.id;
  $("goalTitleInput").value = goal.title || "";
  $("goalTypeInput").value = goal.goal_type || "custom";
  $("goalStatusInput").value = goal.status || "active";
  $("goalPriorityInput").value = goal.priority || "normal";
  $("goalDescriptionInput").value = goal.description || "";
  $("goalWhyInput").value = goal.why || "";
  $("goalSuccessCriteriaInput").value = goal.success_criteria || "";
  $("goalCurrentValueInput").value = goal.current_value ?? "";
  $("goalTargetValueInput").value = goal.target_value ?? "";
  $("goalUnitInput").value = goal.unit || "";
  $("goalManualProgressInput").value = goal.manual_progress_percent ?? "";
  $("goalTargetDateInput").value = goal.target_date || "";
  fillSelectOptions("goalParentInput", goals.filter(entry => entry.id !== goal.id), goal.parent_goal_id || "", "No parent goal");
  fillSelectOptions("goalLinkedBookInput", books, goal.linked_book_id || "", "No linked book");
  fillSupportCardMultiSelect(goal.linked_support_card_ids || []);
  $("goalTagsInput").value = (goal.tags || []).join(", ");
  setText("goalEditorState", `Editing goal: ${goal.title || "selected goal"}`);
}

function resetReminderForm() {
  $("reminderIdInput").value = "";
  $("reminderTitleInput").value = "";
  $("reminderTypeInput").value = "goal";
  $("reminderStatusInput").value = "active";
  $("reminderPriorityInput").value = "normal";
  $("reminderDueDateInput").value = "";
  $("reminderDueTimeInput").value = "";
  $("reminderRepeatRuleInput").value = "none";
  $("reminderRepeatIntervalInput").value = "1";
  $("reminderRepeatDaysInput").value = "";
  $("reminderSnoozeUntilInput").value = "";
  $("reminderLinkedGoalInput").value = "";
  $("reminderLinkedBookInput").value = "";
  $("reminderLinkedSupportCardInput").value = "";
  $("reminderNoteInput").value = "";
  $("reminderTagsInput").value = "";
  setText("reminderEditorState", "New reminder");
}

function fillReminderForm(reminder) {
  if (!reminder) {
    resetReminderForm();
    return;
  }

  $("reminderIdInput").value = reminder.id;
  $("reminderTitleInput").value = reminder.title || "";
  $("reminderTypeInput").value = reminder.reminder_type || "custom";
  $("reminderStatusInput").value = reminder.status || "active";
  $("reminderPriorityInput").value = reminder.priority || "normal";
  $("reminderDueDateInput").value = reminder.due_date || "";
  $("reminderDueTimeInput").value = reminder.due_time || "";
  $("reminderRepeatRuleInput").value = reminder.repeat_rule || "none";
  $("reminderRepeatIntervalInput").value = reminder.repeat_interval || 1;
  $("reminderRepeatDaysInput").value = (reminder.repeat_days || []).join(", ");
  $("reminderSnoozeUntilInput").value = reminder.snooze_until || "";
  fillSelectOptions("reminderLinkedGoalInput", goals, reminder.linked_goal_id || "", "No linked goal");
  fillSelectOptions("reminderLinkedBookInput", books, reminder.linked_book_id || "", "No linked book");
  fillSelectOptions("reminderLinkedSupportCardInput", supportCards, reminder.linked_support_card_id || "", "No linked card");
  $("reminderNoteInput").value = reminder.note || "";
  $("reminderTagsInput").value = (reminder.tags || []).join(", ");
  setText("reminderEditorState", `Editing reminder: ${reminder.title || "selected reminder"}`);
}

function resetBookForm() {
  $("bookIdInput").value = "";
  $("bookTitleInput").value = "";
  $("bookAuthorInput").value = "";
  $("bookFormatInput").value = "book";
  $("bookStatusInput").value = "want_to_read";
  $("bookAreaInput").value = "opening";
  $("bookReasonInput").value = "";
  $("bookTeachesInput").value = "";
  $("bookCurrentPageInput").value = "";
  $("bookTotalPagesInput").value = "";
  $("bookProgressPercentInput").value = "";
  $("bookStartedAtInput").value = "";
  $("bookTargetFinishInput").value = "";
  $("bookFinishedAtInput").value = "";
  $("bookRatingInput").value = "";
  $("bookKeyLessonsInput").value = "";
  $("bookActionItemsInput").value = "";
  $("bookSourceUrlInput").value = "";
  $("bookFileLabelInput").value = "";
  $("bookTagsInput").value = "";
  setText("bookEditorState", "New book");
}

function fillBookForm(book) {
  if (!book) {
    resetBookForm();
    return;
  }

  $("bookIdInput").value = book.id;
  $("bookTitleInput").value = book.title || "";
  $("bookAuthorInput").value = book.author || "";
  $("bookFormatInput").value = book.format || "book";
  $("bookStatusInput").value = book.status || "want_to_read";
  $("bookAreaInput").value = book.area || "general";
  $("bookReasonInput").value = book.reason || "";
  $("bookTeachesInput").value = book.what_it_teaches || "";
  $("bookCurrentPageInput").value = book.current_page ?? "";
  $("bookTotalPagesInput").value = book.total_pages ?? "";
  $("bookProgressPercentInput").value = book.progress_percent ?? "";
  $("bookStartedAtInput").value = book.started_at || "";
  $("bookTargetFinishInput").value = book.target_finish_date || "";
  $("bookFinishedAtInput").value = book.finished_at || "";
  $("bookRatingInput").value = book.rating ?? "";
  $("bookKeyLessonsInput").value = book.key_lessons || "";
  $("bookActionItemsInput").value = book.action_items || "";
  $("bookSourceUrlInput").value = book.source_url || "";
  $("bookFileLabelInput").value = book.file_label || "";
  $("bookTagsInput").value = (book.tags || []).join(", ");
  setText("bookEditorState", `Editing book: ${book.title || "selected book"}`);
}

function setBookNoteDisabled(disabled) {
  [
    "bookNoteTitleInput",
    "bookNotePageInput",
    "bookNoteChapterInput",
    "bookNoteInput",
    "bookNoteLessonInput",
    "bookNoteActionInput",
    "bookNoteTagsInput",
    "bookNoteOpeningIdInput",
    "bookNotePositionIdInput",
    "bookNoteRepairIdInput"
  ].forEach(id => {
    if ($(id)) $(id).disabled = disabled;
  });
}

function resetBookNoteForm() {
  $("bookNoteIdInput").value = "";
  $("bookNoteTitleInput").value = "";
  $("bookNotePageInput").value = "";
  $("bookNoteChapterInput").value = "";
  $("bookNoteInput").value = "";
  $("bookNoteLessonInput").value = "";
  $("bookNoteActionInput").value = "";
  $("bookNoteTagsInput").value = "";
  $("bookNoteOpeningIdInput").value = "";
  $("bookNotePositionIdInput").value = "";
  $("bookNoteRepairIdInput").value = "";
  setText("bookNoteEditorState", "New book note");
  setBookNoteDisabled(!selectedBook());
}

function fillBookNoteForm(note) {
  if (!note) {
    resetBookNoteForm();
    return;
  }

  $("bookNoteIdInput").value = note.id;
  $("bookNoteTitleInput").value = note.title || "";
  $("bookNotePageInput").value = note.page || "";
  $("bookNoteChapterInput").value = note.chapter || "";
  $("bookNoteInput").value = note.note || "";
  $("bookNoteLessonInput").value = note.lesson || "";
  $("bookNoteActionInput").value = note.action_item || "";
  $("bookNoteTagsInput").value = (note.tags || []).join(", ");
  $("bookNoteOpeningIdInput").value = note.linked_opening_node_id || "";
  $("bookNotePositionIdInput").value = note.linked_position_id || "";
  $("bookNoteRepairIdInput").value = note.linked_repair_id || "";
  setText("bookNoteEditorState", `Editing note: ${note.title || "selected note"}`);
  setBookNoteDisabled(false);
}

function resetSupportCardForm() {
  $("supportCardIdInput").value = "";
  $("supportCardTitleInput").value = "";
  $("supportCardTypeInput").value = "identity";
  $("supportCardCategoryInput").value = "vision";
  $("supportCardPriorityInput").value = "normal";
  $("supportCardStatusInput").value = "active";
  $("supportCardPinnedInput").checked = false;
  $("supportCardBodyInput").value = "";
  $("supportCardSourceInput").value = "";
  $("supportCardSourceUrlInput").value = "";
  $("supportCardTagsInput").value = "";
  setText("supportCardEditorState", "New support card");
}

function fillSupportCardForm(card) {
  if (!card) {
    resetSupportCardForm();
    return;
  }

  $("supportCardIdInput").value = card.id;
  $("supportCardTitleInput").value = card.title || "";
  $("supportCardTypeInput").value = card.card_type || "note";
  $("supportCardCategoryInput").value = card.category || "other";
  $("supportCardPriorityInput").value = card.priority || "normal";
  $("supportCardStatusInput").value = card.status || "active";
  $("supportCardPinnedInput").checked = card.pinned === true;
  $("supportCardBodyInput").value = card.body || "";
  $("supportCardSourceInput").value = card.source || "";
  $("supportCardSourceUrlInput").value = card.source_url || "";
  $("supportCardTagsInput").value = (card.tags || []).join(", ");
  setText("supportCardEditorState", `Editing card: ${card.title || "selected card"}`);
}

function resetTournamentForm() {
  $("tournamentNoteIdInput").value = "";
  $("tournamentEventNameInput").value = "";
  $("tournamentEventDateInput").value = "";
  $("tournamentLocationInput").value = "";
  $("tournamentTimeControlInput").value = "";
  $("tournamentSectionInput").value = "";
  $("tournamentStatusInput").value = "planned";
  $("tournamentLinkedGoalInput").value = "";
  $("tournamentLinkedGameInput").value = "";
  $("tournamentLinkedPositionInput").value = "";
  $("tournamentLinkedRepairInput").value = "";
  $("tournamentPreGoalInput").value = "";
  $("tournamentOpeningFocusInput").value = "";
  $("tournamentMentalFocusInput").value = "";
  $("tournamentChecklistInput").value = "";
  $("tournamentRoundNotesInput").value = "";
  $("tournamentAfterLessonsInput").value = "";
  $("tournamentTagsInput").value = "";
  setText("tournamentEditorState", "New tournament note");
}

function fillTournamentForm(note) {
  if (!note) {
    resetTournamentForm();
    return;
  }

  $("tournamentNoteIdInput").value = note.id;
  $("tournamentEventNameInput").value = note.event_name || "";
  $("tournamentEventDateInput").value = note.event_date || "";
  $("tournamentLocationInput").value = note.event_location || "";
  $("tournamentTimeControlInput").value = note.time_control || "";
  $("tournamentSectionInput").value = note.section || "";
  $("tournamentStatusInput").value = note.status || "planned";
  fillSelectOptions("tournamentLinkedGoalInput", goals, note.linked_goal_id || "", "No linked goal");
  fillSelectOptions(
    "tournamentLinkedGameInput",
    linkedGames.map(game => ({
      id: game.id,
      title: game.event || `${game.white_player || "White"} vs ${game.black_player || "Black"}`
    })),
    note.linked_game_id || "",
    "No linked game"
  );
  fillSelectOptions(
    "tournamentLinkedPositionInput",
    linkedPositions.map(position => ({
      id: position.id,
      title: position.title || "Untitled position"
    })),
    note.linked_position_id || "",
    "No linked position"
  );
  fillSelectOptions(
    "tournamentLinkedRepairInput",
    linkedRepairs.map(repair => ({
      id: repair.id,
      title: repair.mistake || "Repair card"
    })),
    note.linked_repair_id || "",
    "No linked repair"
  );
  $("tournamentPreGoalInput").value = note.pre_event_goal || "";
  $("tournamentOpeningFocusInput").value = note.opening_focus || "";
  $("tournamentMentalFocusInput").value = note.mental_focus || "";
  $("tournamentChecklistInput").value = note.practical_checklist || "";
  $("tournamentRoundNotesInput").value = note.round_notes || "";
  $("tournamentAfterLessonsInput").value = note.after_event_lessons || "";
  $("tournamentTagsInput").value = (note.tags || []).join(", ");
  setText("tournamentEditorState", `Editing event: ${note.event_name || "selected note"}`);
}

function resetQuickIdeaForm() {
  $("quickIdeaIdInput").value = "";
  $("quickIdeaTitleInput").value = "";
  $("quickIdeaTypeInput").value = "general";
  $("quickIdeaStatusInput").value = "inbox";
  $("quickIdeaBodyInput").value = "";
  $("quickIdeaTagsInput").value = "";
  setText("quickIdeaEditorState", "New quick idea");
}

function fillQuickIdeaForm(idea) {
  if (!idea) {
    resetQuickIdeaForm();
    return;
  }

  $("quickIdeaIdInput").value = idea.id;
  $("quickIdeaTitleInput").value = idea.title || "";
  $("quickIdeaTypeInput").value = idea.idea_type || "general";
  $("quickIdeaStatusInput").value = idea.status || "inbox";
  $("quickIdeaBodyInput").value = idea.body || "";
  $("quickIdeaTagsInput").value = (idea.tags || []).join(", ");
  setText("quickIdeaEditorState", `Editing idea: ${idea.title || "selected idea"}`);
}

function populateLinkedSelects() {
  fillSelectOptions("goalParentInput", goals.filter(goal => goal.id !== $("goalIdInput").value), $("goalParentInput")?.value || "", "No parent goal");
  fillSelectOptions("goalLinkedBookInput", books, $("goalLinkedBookInput")?.value || "", "No linked book");
  fillSupportCardMultiSelect(selectedMultiValues("goalLinkedSupportCardsInput"));

  fillSelectOptions("reminderLinkedGoalInput", goals, $("reminderLinkedGoalInput")?.value || "", "No linked goal");
  fillSelectOptions("reminderLinkedBookInput", books, $("reminderLinkedBookInput")?.value || "", "No linked book");
  fillSelectOptions("reminderLinkedSupportCardInput", supportCards, $("reminderLinkedSupportCardInput")?.value || "", "No linked card");

  fillSelectOptions("tournamentLinkedGoalInput", goals, $("tournamentLinkedGoalInput")?.value || "", "No linked goal");
  fillSelectOptions(
    "tournamentLinkedGameInput",
    linkedGames.map(game => ({
      id: game.id,
      title: game.event || `${game.white_player || "White"} vs ${game.black_player || "Black"}`
    })),
    $("tournamentLinkedGameInput")?.value || "",
    "No linked game"
  );
  fillSelectOptions(
    "tournamentLinkedPositionInput",
    linkedPositions.map(position => ({
      id: position.id,
      title: position.title || "Untitled position"
    })),
    $("tournamentLinkedPositionInput")?.value || "",
    "No linked position"
  );
  fillSelectOptions(
    "tournamentLinkedRepairInput",
    linkedRepairs.map(repair => ({
      id: repair.id,
      title: repair.mistake || "Repair card"
    })),
    $("tournamentLinkedRepairInput")?.value || "",
    "No linked repair"
  );
}

function filteredGoals() {
  const search = ($("goalSearchInput")?.value || "").trim().toLowerCase();
  const status = $("goalStatusFilter")?.value || "all";
  const type = $("goalTypeFilter")?.value || "all";
  const priority = $("goalPriorityFilter")?.value || "all";

  return goals
    .filter(goal => {
      if (status !== "all" && goal.status !== status) return false;
      if (type !== "all" && goal.goal_type !== type) return false;
      if (priority !== "all" && goal.priority !== priority) return false;
      if (!search) return true;

      const haystack = [
        goal.title,
        goal.description,
        goal.why,
        goal.success_criteria,
        ...(goal.tags || [])
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    })
    .sort((left, right) => {
      if (left.status === "active" && right.status !== "active") return -1;
      if (left.status !== "active" && right.status === "active") return 1;
      if (left.status === "achieved" && right.status !== "achieved") return 1;
      if (left.status !== "achieved" && right.status === "achieved") return -1;
      const priorityDiff = (priorityRank[right.priority] || 0) - (priorityRank[left.priority] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return compareDateKeys(left.target_date || "", right.target_date || "");
    });
}

function filteredSupportCards() {
  const search = ($("supportSearchInput")?.value || "").trim().toLowerCase();
  const type = $("supportCardTypeFilter")?.value || "all";
  const category = $("supportGlobalFilterInput")?.value || "all";
  const pinnedOnly = $("supportPinnedOnlyInput")?.checked === true;

  return sortSupportCards(
    supportCards.filter(card => {
      if (type !== "all" && card.card_type !== type) return false;
      if (category !== "all" && card.category !== category) return false;
      if (pinnedOnly && !card.pinned) return false;
      if (!search) return true;

      const haystack = [
        card.title,
        card.body,
        card.source,
        ...(card.tags || [])
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    })
  );
}

function filteredBooks() {
  const search = ($("bookSearchInput")?.value || "").trim().toLowerCase();
  const area = $("bookAreaFilter")?.value || "all";
  const status = $("bookStatusFilter")?.value || "all";

  return books
    .filter(book => {
      if (area !== "all" && book.area !== area) return false;
      if (status !== "all" && book.status !== status) return false;
      if (!search) return true;

      const haystack = [
        book.title,
        book.author,
        book.key_lessons,
        ...(book.tags || [])
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    })
    .sort((left, right) => {
      if (left.status === "currently_reading" && right.status !== "currently_reading") return -1;
      if (left.status !== "currently_reading" && right.status === "currently_reading") return 1;
      return String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
    });
}

function filteredTournamentNotes() {
  const search = ($("tournamentSearchInput")?.value || "").trim().toLowerCase();
  const status = $("tournamentStatusFilter")?.value || "all";

  return tournamentNotes
    .filter(note => {
      if (status !== "all" && note.status !== status) return false;
      if (!search) return true;

      const haystack = [
        note.event_name,
        note.event_location,
        note.opening_focus,
        note.mental_focus,
        ...(note.tags || [])
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    })
    .sort((left, right) => compareDateKeys(left.event_date || "", right.event_date || ""));
}

function filteredQuickIdeas() {
  const search = ($("quickIdeaSearchInput")?.value || "").trim().toLowerCase();
  const status = $("quickIdeaStatusFilter")?.value || "inbox";

  return quickIdeas
    .filter(idea => {
      if (status !== "all" && idea.status !== status) return false;
      if (!search) return true;
      const haystack = [idea.title, idea.body, ...(idea.tags || [])].join(" ").toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => {
      if (left.status === "inbox" && right.status !== "inbox") return -1;
      if (left.status !== "inbox" && right.status === "inbox") return 1;
      return String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
    });
}

function renderIntroStats() {
  const activeGoals = goals.filter(goal => goal.status === "active").length;
  const dueReminders = appReminders.filter(isReminderDue).length;
  const currentBooks = books.filter(book => book.status === "currently_reading").length;
  const pinnedCards = supportCards.filter(card => card.status === "active" && card.pinned).length;

  setText("supportActiveGoalCount", `${activeGoals} active goal${activeGoals === 1 ? "" : "s"}`);
  setText("supportDueReminderCount", `${dueReminders} due reminder${dueReminders === 1 ? "" : "s"}`);
  setText("supportCurrentBookCount", `${currentBooks} current book${currentBooks === 1 ? "" : "s"}`);
  setText("supportPinnedCardCount", `${pinnedCards} pinned card${pinnedCards === 1 ? "" : "s"}`);

  setText("supportCommandActiveGoals", String(activeGoals));
  setText("supportCommandDueReminders", String(dueReminders));
  setText("supportCommandCurrentBooks", String(currentBooks));
  setText("supportCommandPinnedCards", String(pinnedCards));
}

function renderCommandCenter() {
  const items = supportCommandItems({
    supportCards,
    goals,
    reminders: appReminders,
    books
  });

  if (!items.length) {
    setHtml("supportTodayList", `<div class="support-empty-state">Nothing urgent. Keep the support brain clean and intentional.</div>`);
    return;
  }

  setHtml("supportTodayList", items.map(item => {
    const urgencyClass = item.urgency === 0 ? " is-overdue" : item.urgency === 1 ? " is-due" : "";
    return `
      <article class="support-item-card${urgencyClass}">
        <div class="support-item-head">
          <div>
            <div class="move-ply-flags">
              ${badgeHtml(labelize(item.kind))}
            </div>
            <h4>${escapeHtml(item.title)}</h4>
            <p class="muted">${escapeHtml(item.meta || "")}</p>
          </div>
          <button class="button button-secondary button-tiny" type="button" data-command-action="${item.action}" data-command-id="${item.id}">
            ${escapeHtml(item.actionLabel)}
          </button>
        </div>
      </article>
    `;
  }).join(""));
}

function renderGoals() {
  const items = filteredGoals();
  const activeCount = goals.filter(goal => goal.status === "active").length;
  const criticalCount = goals.filter(goal => goal.status === "active" && goal.priority === "critical").length;
  const dueSoonCount = goals.filter(goal => goal.status === "active" && goal.target_date && (isWithinDays(goal.target_date, 14) || isPastDate(goal.target_date))).length;

  setText("goalSummaryPill", `${activeCount} active • ${criticalCount} critical • ${dueSoonCount} due soon`);

  if (!items.length) {
    setHtml("goalList", `<div class="support-empty-state">No goals yet. Add the destination before the app becomes only storage.</div>`);
    return;
  }

  setHtml("goalList", items.map(goal => {
    const progress = computeGoalProgress(goal);
    const parent = goal.parent_goal_id ? goalById(goal.parent_goal_id) : null;
    const overdue = goal.status === "active" && goal.target_date && isPastDate(goal.target_date);
    return `
      <article class="support-item-card${overdue ? " is-overdue" : ""}">
        <div class="support-item-head">
          <div>
            <div class="move-ply-flags">
              ${badgeHtml(labelize(goal.goal_type))}
              ${badgeHtml(labelize(goal.status, GOAL_STATUS_LABELS))}
              ${badgeHtml(labelize(goal.priority))}
              ${goal.target_date ? badgeHtml(overdue ? `Overdue ${formatDateLabel(goal.target_date)}` : `Target ${formatDateLabel(goal.target_date)}`) : ""}
            </div>
            <h4>${escapeHtml(goal.title || "Untitled goal")}</h4>
            <p class="muted">${escapeHtml(goal.description || goal.why || "No description yet.")}</p>
          </div>
          <strong>${Math.round(progress)}%</strong>
        </div>
        ${progressBarHtml(progress)}
        <div class="game-list-meta">
          ${parent ? `<span>Parent: ${escapeHtml(parent.title || "Goal")}</span>` : ""}
          ${goal.success_criteria ? `<span>Success: ${escapeHtml(excerpt(goal.success_criteria, 80))}</span>` : ""}
        </div>
        ${tagRowHtml(goal.tags)}
        <div class="form-actions">
          <button class="button button-secondary button-tiny" type="button" data-goal-action="edit" data-goal-id="${goal.id}">Edit</button>
          ${goal.status !== "achieved" ? `<button class="button button-secondary button-tiny" type="button" data-goal-action="achieve" data-goal-id="${goal.id}">Mark achieved</button>` : ""}
          ${goal.status === "active"
            ? `<button class="button button-ghost button-tiny" type="button" data-goal-action="pause" data-goal-id="${goal.id}">Pause</button>`
            : `<button class="button button-ghost button-tiny" type="button" data-goal-action="reactivate" data-goal-id="${goal.id}">Reactivate</button>`}
          <button class="button button-danger button-tiny" type="button" data-goal-action="delete" data-goal-id="${goal.id}">Delete</button>
        </div>
      </article>
    `;
  }).join(""));
}

function reminderCardHtml(reminder, visibility) {
  const classes = visibility === "overdue" ? " is-overdue" : visibility === "today" ? " is-due" : "";
  return `
    <article class="support-item-card${classes}">
      <div class="support-item-head">
        <div>
          <div class="move-ply-flags">
            ${badgeHtml(labelize(reminder.reminder_type))}
            ${badgeHtml(labelize(reminder.status, REMINDER_STATUS_LABELS))}
            ${badgeHtml(labelize(reminder.priority))}
          </div>
          <h4>${escapeHtml(reminder.title || "Untitled reminder")}</h4>
          <p class="muted">${escapeHtml(reminder.note || "No note yet.")}</p>
        </div>
      </div>
      <div class="game-list-meta">
        <span>${reminder.due_date ? `Due ${formatDateLabel(reminder.due_date)}` : "No date"}</span>
        ${reminder.due_time ? `<span>${escapeHtml(reminder.due_time)}</span>` : ""}
        ${reminder.repeat_rule !== "none" ? `<span>${escapeHtml(labelize(reminder.repeat_rule))}</span>` : ""}
      </div>
      ${tagRowHtml(reminder.tags)}
      <div class="form-actions">
        ${reminder.status !== "archived" ? `<button class="button button-secondary button-tiny" type="button" data-reminder-action="done" data-reminder-id="${reminder.id}">Mark done</button>` : ""}
        ${["active", "snoozed"].includes(reminder.status) ? `<button class="button button-ghost button-tiny" type="button" data-reminder-action="snooze-day" data-reminder-id="${reminder.id}">Snooze 1 day</button>` : ""}
        ${["active", "snoozed"].includes(reminder.status) ? `<button class="button button-ghost button-tiny" type="button" data-reminder-action="snooze-week" data-reminder-id="${reminder.id}">Snooze 1 week</button>` : ""}
        <button class="button button-secondary button-tiny" type="button" data-reminder-action="edit" data-reminder-id="${reminder.id}">Edit</button>
        <button class="button button-ghost button-tiny" type="button" data-reminder-action="archive" data-reminder-id="${reminder.id}">Archive</button>
        <button class="button button-danger button-tiny" type="button" data-reminder-action="delete" data-reminder-id="${reminder.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderReminders() {
  const search = ($("reminderSearchInput")?.value || "").trim().toLowerCase();
  const filter = $("reminderVisibilityFilter")?.value || "active";
  const filtered = appReminders.filter(reminder => {
    if (filter === "done" && !["done", "archived"].includes(reminder.status)) return false;
    if (filter === "active" && ["done", "archived"].includes(reminder.status)) return false;
    if (!search) return true;
    const haystack = [reminder.title, reminder.note, ...(reminder.tags || [])].join(" ").toLowerCase();
    return haystack.includes(search);
  });

  setText("reminderSummaryPill", `${appReminders.filter(isReminderDue).length} due • ${appReminders.length} total`);

  if (!filtered.length) {
    setHtml("reminderList", `<div class="support-empty-state">No reminders yet. Add only the reminders that should appear inside the chess brain.</div>`);
    return;
  }

  const sections = [
    ["Overdue", filtered.filter(reminder => reminderVisibility(reminder) === "overdue")],
    ["Due today", filtered.filter(reminder => reminderVisibility(reminder) === "today")],
    ["Upcoming", filtered.filter(reminder => reminderVisibility(reminder) === "upcoming")],
    ["No date", filtered.filter(reminder => reminderVisibility(reminder) === "no_date")],
    ["Done / archived", filtered.filter(reminder => ["done", "archived"].includes(reminder.status))]
  ].filter(([, rows]) => rows.length);

  setHtml("reminderList", sections.map(([heading, rows]) => `
    <div class="support-list-group">
      <div class="line-label">${escapeHtml(heading)}</div>
      <div class="support-list">
        ${rows.map(reminder => reminderCardHtml(reminder, reminderVisibility(reminder))).join("")}
      </div>
    </div>
  `).join(""));
}

function renderBooks() {
  const items = filteredBooks();
  const currentCount = books.filter(book => book.status === "currently_reading").length;
  const overdueCount = books.filter(book => book.status === "currently_reading" && book.target_finish_date && isPastDate(book.target_finish_date)).length;
  setText("bookSummaryPill", `${currentCount} current • ${overdueCount} overdue finish`);

  if (!items.length) {
    setHtml("bookList", `<div class="support-empty-state">No books yet. Add the books and PDFs that are meant to feed the chess brain.</div>`);
    return;
  }

  const statusOrder = ["currently_reading", "want_to_read", "paused", "finished", "reference", "dropped"];
  const grouped = statusOrder
    .map(status => [status, items.filter(book => book.status === status)])
    .filter(([, rows]) => rows.length);

  setHtml("bookList", grouped.map(([status, rows]) => `
    <div class="support-list-group">
      <div class="line-label">${escapeHtml(labelize(status, BOOK_STATUS_LABELS))}</div>
      <div class="support-list">
        ${rows.map(book => {
          const progress = computeBookProgress(book);
          const overdue = book.status === "currently_reading" && book.target_finish_date && isPastDate(book.target_finish_date);
          const activeClass = book.id === selectedBookId ? " is-active" : "";
          return `
            <article class="support-item-card${overdue ? " is-overdue" : ""}${activeClass}" data-book-id="${book.id}">
              <div class="support-item-head">
                <div>
                  <div class="move-ply-flags">
                    ${badgeHtml(labelize(book.status, BOOK_STATUS_LABELS))}
                    ${badgeHtml(labelize(book.area))}
                    ${book.target_finish_date ? badgeHtml(`Finish ${formatDateLabel(book.target_finish_date)}`) : ""}
                  </div>
                  <h4>${escapeHtml(book.title || "Untitled book")}</h4>
                  <p class="muted">${escapeHtml([book.author, book.what_it_teaches].filter(Boolean).join(" • ") || "No teaching note yet.")}</p>
                </div>
                <strong>${Math.round(progress)}%</strong>
              </div>
              ${progressBarHtml(progress)}
              <div class="game-list-meta">
                ${book.current_page !== null ? `<span>Page ${book.current_page}${book.total_pages ? `/${book.total_pages}` : ""}</span>` : ""}
                ${book.file_label ? `<span>${escapeHtml(book.file_label)}</span>` : ""}
                ${book.source_url ? `<span>Linked source</span>` : ""}
              </div>
              ${tagRowHtml(book.tags)}
              <div class="form-actions">
                <button class="button button-secondary button-tiny" type="button" data-book-action="edit" data-book-id="${book.id}">Edit</button>
                <button class="button button-ghost button-tiny" type="button" data-book-action="add-pages" data-book-id="${book.id}" data-page-step="10">+10 pages</button>
                <button class="button button-ghost button-tiny" type="button" data-book-action="status" data-book-id="${book.id}" data-book-status="currently_reading">Current</button>
                <button class="button button-ghost button-tiny" type="button" data-book-action="status" data-book-id="${book.id}" data-book-status="finished">Finished</button>
                <button class="button button-ghost button-tiny" type="button" data-book-action="status" data-book-id="${book.id}" data-book-status="paused">Pause</button>
                <button class="button button-ghost button-tiny" type="button" data-book-action="status" data-book-id="${book.id}" data-book-status="reference">Reference</button>
                <button class="button button-danger button-tiny" type="button" data-book-action="delete" data-book-id="${book.id}">Delete</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `).join(""));
}

function renderBookNotes() {
  const book = selectedBook();
  const search = ($("bookNoteSearchInput")?.value || "").trim().toLowerCase();
  const notes = bookNotes
    .filter(note => note.book_id === book?.id)
    .filter(note => {
      if (!search) return true;
      const haystack = [note.title, note.note, note.lesson, note.action_item, note.chapter, note.page, ...(note.tags || [])].join(" ").toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));

  setText("bookNotePanelTitle", book ? `Book notes for ${book.title || "selected book"}` : "Book notes");

  if (!book) {
    setHtml("bookNoteList", `<div class="support-empty-state">Select a book first, then capture the notes that should survive the reading.</div>`);
    setBookNoteDisabled(true);
    return;
  }

  if (!notes.length) {
    setHtml("bookNoteList", `<div class="support-empty-state">No notes for this book yet. Extract the useful ideas before the reading disappears.</div>`);
    setBookNoteDisabled(false);
    return;
  }

  setBookNoteDisabled(false);
  setHtml("bookNoteList", notes.map(note => `
    <article class="support-item-card">
      <div class="support-item-head">
        <div>
          <div class="move-ply-flags">
            ${note.chapter ? badgeHtml(note.chapter) : ""}
            ${note.page ? badgeHtml(`Page ${note.page}`) : ""}
          </div>
          <h4>${escapeHtml(note.title || "Untitled note")}</h4>
          <p class="muted">${escapeHtml(note.lesson || note.note || "No lesson yet.")}</p>
        </div>
      </div>
      ${note.action_item ? `<p class="muted">${escapeHtml(note.action_item)}</p>` : ""}
      <div class="move-ply-flags">
        ${note.linked_opening_node_id ? badgeHtml("Opening link") : ""}
        ${note.linked_position_id ? badgeHtml("Position link") : ""}
        ${note.linked_repair_id ? badgeHtml("Repair link") : ""}
      </div>
      ${tagRowHtml(note.tags)}
      <div class="form-actions">
        <button class="button button-secondary button-tiny" type="button" data-book-note-action="edit" data-book-note-id="${note.id}">Edit</button>
        <button class="button button-ghost button-tiny" type="button" data-book-note-action="position" data-book-note-id="${note.id}">To position</button>
        <button class="button button-ghost button-tiny" type="button" data-book-note-action="card" data-book-note-id="${note.id}">To card</button>
        <button class="button button-ghost button-tiny" type="button" data-book-note-action="repair" data-book-note-id="${note.id}">To repair</button>
        <button class="button button-danger button-tiny" type="button" data-book-note-action="delete" data-book-note-id="${note.id}">Delete</button>
      </div>
    </article>
  `).join(""));
}

function renderSupportCards() {
  const items = filteredSupportCards();
  const starterBtn = $("supportStarterDeckBtn");
  if (starterBtn) starterBtn.hidden = supportCards.length > 0;

  if (!items.length) {
    setHtml("supportCardList", `<div class="support-empty-state">No support cards yet. Add the principles, reminders, and reset notes that keep the journey stable.</div>`);
    if (!randomCardId) {
      setText("supportRandomCardResult", "No random card shown yet.");
    }
    return;
  }

  const randomCard = supportCardById(randomCardId);
  if (randomCard) {
    setHtml("supportRandomCardResult", `
      <strong>${escapeHtml(randomCard.title || "Untitled support card")}</strong>
      <p>${escapeHtml(randomCard.body || "No card body yet.")}</p>
    `);
  }

  setHtml("supportCardList", items.map(card => `
    <article class="support-item-card${card.pinned ? " is-pinned" : ""}">
      <div class="support-item-head">
        <div>
          <div class="move-ply-flags">
            ${badgeHtml(labelize(card.card_type, SUPPORT_CARD_LABELS))}
            ${badgeHtml(labelize(card.category, CATEGORY_LABELS))}
            ${badgeHtml(labelize(card.priority))}
            ${card.pinned ? badgeHtml("Pinned") : ""}
            ${card.status === "archived" ? badgeHtml("Archived") : ""}
          </div>
          <h4>${escapeHtml(card.title || "Untitled support card")}</h4>
          <p class="muted">${escapeHtml(excerpt(card.body, 180) || "No card body yet.")}</p>
        </div>
      </div>
      ${tagRowHtml(card.tags)}
      <div class="game-list-meta">
        ${card.source ? `<span>Source: ${escapeHtml(card.source)}</span>` : ""}
        ${card.last_reviewed_at ? `<span>Reviewed ${escapeHtml(formatDateLabel(card.last_reviewed_at.slice(0, 10)))}</span>` : ""}
        <span>${card.review_count || 0} review${card.review_count === 1 ? "" : "s"}</span>
      </div>
      <div class="form-actions">
        <button class="button button-secondary button-tiny" type="button" data-card-action="edit" data-card-id="${card.id}">Edit</button>
        <button class="button button-ghost button-tiny" type="button" data-card-action="review" data-card-id="${card.id}">Review</button>
        <button class="button button-ghost button-tiny" type="button" data-card-action="pin" data-card-id="${card.id}">${card.pinned ? "Unpin" : "Pin"}</button>
        <button class="button button-ghost button-tiny" type="button" data-card-action="archive" data-card-id="${card.id}">${card.status === "archived" ? "Unarchive" : "Archive"}</button>
        <button class="button button-danger button-tiny" type="button" data-card-action="delete" data-card-id="${card.id}">Delete</button>
      </div>
    </article>
  `).join(""));
}

function renderTournamentNotes() {
  const items = filteredTournamentNotes();
  const upcoming = tournamentNotes
    .filter(note => ["planned", "active"].includes(note.status) && note.event_date && compareDateKeys(note.event_date, todayKey()) >= 0)
    .sort((left, right) => compareDateKeys(left.event_date, right.event_date));
  const nextEvent = upcoming[0] || null;

  setText("tournamentSummaryPill", `${upcoming.length} upcoming event${upcoming.length === 1 ? "" : "s"}`);
  setHtml("tournamentNextEvent", nextEvent
    ? `<strong>${escapeHtml(nextEvent.event_name || "Next event")}</strong><p>${escapeHtml([formatDateLabel(nextEvent.event_date), nextEvent.event_location, nextEvent.time_control].filter(Boolean).join(" • "))}</p>`
    : `No tournament notes yet. Add event prep when there is a real tournament to prepare for.`);

  if (!items.length) {
    setHtml("tournamentNoteList", `<div class="support-empty-state">No tournament notes yet. Add event prep when there is a real tournament to prepare for.</div>`);
    return;
  }

  setHtml("tournamentNoteList", items.map(note => `
    <article class="support-item-card">
      <div class="support-item-head">
        <div>
          <div class="move-ply-flags">
            ${badgeHtml(labelize(note.status))}
            ${note.event_date ? badgeHtml(formatDateLabel(note.event_date)) : ""}
          </div>
          <h4>${escapeHtml(note.event_name || "Untitled event")}</h4>
          <p class="muted">${escapeHtml([note.event_location, note.time_control, note.section].filter(Boolean).join(" • ") || "No event details yet.")}</p>
        </div>
      </div>
      <p class="muted">${escapeHtml(excerpt(note.pre_event_goal || note.mental_focus || note.after_event_lessons, 160) || "No focus note yet.")}</p>
      <div class="move-ply-flags">
        ${note.linked_goal_id ? badgeHtml("Goal link") : ""}
        ${note.linked_game_id ? badgeHtml("Game link") : ""}
        ${note.linked_position_id ? badgeHtml("Position link") : ""}
        ${note.linked_repair_id ? badgeHtml("Repair link") : ""}
      </div>
      ${tagRowHtml(note.tags)}
      <div class="form-actions">
        <button class="button button-secondary button-tiny" type="button" data-tournament-action="edit" data-tournament-id="${note.id}">Edit</button>
        <button class="button button-ghost button-tiny" type="button" data-tournament-action="status" data-tournament-id="${note.id}" data-tournament-status="active">Set active</button>
        <button class="button button-ghost button-tiny" type="button" data-tournament-action="status" data-tournament-id="${note.id}" data-tournament-status="completed">Complete</button>
        <button class="button button-danger button-tiny" type="button" data-tournament-action="delete" data-tournament-id="${note.id}">Delete</button>
      </div>
    </article>
  `).join(""));
}

function renderQuickIdeas() {
  const items = filteredQuickIdeas();
  const inboxCount = quickIdeas.filter(idea => idea.status === "inbox").length;
  setText("quickIdeaSummaryPill", `${inboxCount} inbox idea${inboxCount === 1 ? "" : "s"}`);

  if (!items.length) {
    setHtml("quickIdeaList", `<div class="support-empty-state">No loose ideas. When a thought appears, capture it before it disappears.</div>`);
    return;
  }

  setHtml("quickIdeaList", items.map(idea => `
    <article class="support-item-card">
      <div class="support-item-head">
        <div>
          <div class="move-ply-flags">
            ${badgeHtml(labelize(idea.idea_type))}
            ${badgeHtml(labelize(idea.status, QUICK_IDEA_STATUS_LABELS))}
            ${idea.converted_to_type ? badgeHtml(`To ${labelize(idea.converted_to_type)}`) : ""}
          </div>
          <h4>${escapeHtml(idea.title || "Untitled idea")}</h4>
          <p class="muted">${escapeHtml(excerpt(idea.body, 180) || "No note yet.")}</p>
        </div>
      </div>
      ${tagRowHtml(idea.tags)}
      <div class="form-actions">
        <button class="button button-secondary button-tiny" type="button" data-idea-action="edit" data-idea-id="${idea.id}">Edit</button>
        ${idea.status === "inbox" ? `
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="support_card">To card</button>
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="goal">To goal</button>
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="reminder">To reminder</button>
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="position">To position</button>
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="repair">To repair</button>
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="book">To book</button>
          <button class="button button-ghost button-tiny" type="button" data-idea-action="convert" data-idea-id="${idea.id}" data-convert-type="tournament_note">To event</button>
        ` : ""}
        <button class="button button-ghost button-tiny" type="button" data-idea-action="archive" data-idea-id="${idea.id}">Archive</button>
        <button class="button button-danger button-tiny" type="button" data-idea-action="delete" data-idea-id="${idea.id}">Delete</button>
      </div>
    </article>
  `).join(""));
}

function renderSupportWorkspaceTabs() {
  const activeGoalCount = goals.filter(goal => goal.status === "active").length;
  const dueReminderCount = appReminders.filter(isReminderDue).length;
  const currentBookCount = books.filter(book => book.status === "currently_reading").length;
  const pinnedCardCount = supportCards.filter(card => card.status === "active" && card.pinned).length;
  const upcomingTournamentCount = tournamentNotes.filter(note => ["planned", "active"].includes(note.status) && note.event_date && compareDateKeys(note.event_date, todayKey()) >= 0).length;
  const inboxIdeaCount = quickIdeas.filter(idea => idea.status === "inbox").length;

  setText("supportPaneGoalsMeta", `${activeGoalCount} active`);
  setText("supportPaneRemindersMeta", `${dueReminderCount} due`);
  setText("supportPaneBooksMeta", `${currentBookCount} current`);
  setText("supportPaneCardsMeta", `${pinnedCardCount} pinned`);
  setText("supportPaneTournamentsMeta", `${upcomingTournamentCount} upcoming`);
  setText("supportPaneIdeasMeta", `${inboxIdeaCount} inbox`);
  syncSupportPaneState();
}

function paint() {
  populateLinkedSelects();
  renderIntroStats();
  renderCommandCenter();
  renderGoals();
  renderReminders();
  renderBooks();
  renderBookNotes();
  renderSupportCards();
  renderTournamentNotes();
  renderQuickIdeas();
  renderSupportWorkspaceTabs();
}

async function refresh() {
  [
    supportCards,
    goals,
    appReminders,
    books,
    bookNotes,
    tournamentNotes,
    quickIdeas,
    linkedGames,
    linkedPositions,
    linkedRepairs
  ] = await Promise.all([
    OpeningDB.loadSupportCards(),
    OpeningDB.loadGoals(),
    OpeningDB.loadAppReminders(),
    OpeningDB.loadBooks(),
    OpeningDB.loadBookNotes(),
    OpeningDB.loadTournamentNotes(),
    OpeningDB.loadQuickIdeas(),
    OpeningDB.loadGames(),
    OpeningDB.loadPositions(),
    OpeningDB.loadRepairItems()
  ]);

  if (selectedBookId && !bookById(selectedBookId)) {
    selectedBookId = null;
  }

  if (!selectedBookId && books.length) {
    selectedBookId = books[0].id;
  }

  saveSelectedBook();
  paint();
  applySupportFocus(consumeSupportFocus());
}

function applySupportFocus(focus) {
  if (!focus?.pane) return;

  setSupportPane(focus.pane, { scroll: true });

  if (focus.type === "support_card" || focus.type === "card") {
    fillSupportCardForm(supportCardById(focus.id));
    scrollToForm("supportCardForm");
    return;
  }

  if (focus.type === "goal") {
    fillGoalForm(goalById(focus.id));
    scrollToForm("goalForm");
    return;
  }

  if (focus.type === "reminder") {
    fillReminderForm(reminderById(focus.id));
    scrollToForm("reminderForm");
    return;
  }

  if (focus.type === "book") {
    selectedBookId = focus.id;
    saveSelectedBook();
    fillBookForm(bookById(focus.id));
    paint();
    scrollToForm("bookForm");
    return;
  }

  if (focus.type === "book_note") {
    const note = bookNoteById(focus.id);
    if (!note) return;
    selectedBookId = note.book_id || selectedBookId;
    saveSelectedBook();
    paint();
    fillBookNoteForm(note);
    scrollToForm("bookNoteForm");
    return;
  }

  if (focus.type === "tournament_note") {
    fillTournamentForm(tournamentNoteById(focus.id));
    scrollToForm("tournamentNoteForm");
    return;
  }

  if (focus.type === "quick_idea") {
    fillQuickIdeaForm(quickIdeaById(focus.id));
    scrollToForm("quickIdeaForm");
  }
}

async function handleReminderDone(reminder) {
  if (!reminder) return;
  const completedAt = nowIso();

  if (reminder.repeat_rule !== "none") {
    await OpeningDB.upsertAppReminder({
      ...reminder,
      status: "active",
      due_date: nextDueDate(reminder.due_date || todayKey(), reminder.repeat_rule, reminder.repeat_interval, reminder.repeat_days),
      snooze_until: "",
      completed_at: completedAt,
      updated_at: completedAt
    });
  } else {
    await OpeningDB.upsertAppReminder({
      ...reminder,
      status: "done",
      completed_at: completedAt,
      updated_at: completedAt
    });
  }
}

async function handleReminderSnooze(reminder, days) {
  if (!reminder) return;
  const base = todayKey();
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + days);
  await OpeningDB.upsertAppReminder({
    ...reminder,
    status: "snoozed",
    snooze_until: date.toISOString().slice(0, 10),
    updated_at: nowIso()
  });
}

function scrollToForm(formId) {
  window.requestAnimationFrame(() => {
    $(formId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function createStarterDeck() {
  if (supportCards.length) return;
  const stamp = nowIso();
  for (const card of STARTER_SUPPORT_CARDS) {
    await OpeningDB.upsertSupportCard({
      ...card,
      tags: [],
      source: "",
      source_url: "",
      status: "active",
      created_at: stamp,
      updated_at: stamp,
      last_reviewed_at: null,
      review_count: 0
    });
  }
  await refresh();
  showToast("Starter deck created.");
}

async function showRandomCard() {
  const active = supportCards.filter(card => card.status === "active");
  if (!active.length) {
    setText("supportRandomCardResult", "No active support cards yet.");
    return;
  }

  const pinned = active.filter(card => card.pinned);
  const pool = pinned.length ? pinned : active;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  randomCardId = picked.id;
  renderSupportCards();
}

async function convertIdea(idea, convertType) {
  if (!idea) return;
  const stamp = nowIso();
  let convertedToId = "";

  if (convertType === "support_card") {
    const created = await OpeningDB.upsertSupportCard({
      title: idea.title,
      body: idea.body,
      card_type: "note",
      category: "other",
      pinned: false,
      priority: "normal",
      tags: idea.tags,
      source: "",
      source_url: "",
      status: "active",
      created_at: stamp,
      updated_at: stamp,
      last_reviewed_at: null,
      review_count: 0
    });
    convertedToId = created.id;
  }

  if (convertType === "goal") {
    const created = await OpeningDB.upsertGoal({
      title: idea.title,
      goal_type: idea.idea_type === "mindset" ? "mindset" : "custom",
      description: idea.body,
      why: "",
      success_criteria: "",
      current_value: null,
      target_value: null,
      unit: "",
      manual_progress_percent: null,
      target_date: "",
      status: "active",
      priority: "normal",
      parent_goal_id: null,
      linked_book_id: null,
      linked_support_card_ids: [],
      tags: idea.tags,
      created_at: stamp,
      updated_at: stamp,
      completed_at: null,
      last_touched_at: stamp
    });
    convertedToId = created.id;
  }

  if (convertType === "reminder") {
    const created = await OpeningDB.upsertAppReminder({
      title: idea.title,
      note: idea.body,
      reminder_type: idea.idea_type === "book" ? "book" : idea.idea_type === "tournament" ? "tournament" : "custom",
      due_date: "",
      due_time: "",
      repeat_rule: "none",
      repeat_interval: 1,
      repeat_days: [],
      status: "active",
      snooze_until: "",
      priority: "normal",
      linked_goal_id: null,
      linked_book_id: null,
      linked_support_card_id: null,
      tags: idea.tags,
      created_at: stamp,
      updated_at: stamp,
      completed_at: null
    });
    convertedToId = created.id;
  }

  if (convertType === "book") {
    const created = await OpeningDB.upsertBook({
      title: idea.title,
      author: "",
      format: "book",
      status: "want_to_read",
      area: idea.idea_type === "opening" ? "opening" : "general",
      reason: idea.body,
      what_it_teaches: "",
      current_page: null,
      total_pages: null,
      progress_percent: null,
      started_at: "",
      target_finish_date: "",
      finished_at: "",
      rating: null,
      key_lessons: "",
      action_items: "",
      source_url: "",
      file_label: "",
      tags: idea.tags,
      created_at: stamp,
      updated_at: stamp
    });
    convertedToId = created.id;
  }

  if (convertType === "tournament_note") {
    const created = await OpeningDB.upsertTournamentNote({
      event_name: idea.title,
      event_date: "",
      event_location: "",
      time_control: "",
      section: "",
      status: "planned",
      pre_event_goal: idea.body,
      opening_focus: "",
      mental_focus: "",
      practical_checklist: "",
      round_notes: "",
      after_event_lessons: "",
      linked_goal_id: null,
      tags: idea.tags,
      created_at: stamp,
      updated_at: stamp
    });
    convertedToId = created.id;
  }

  if (convertType === "position") {
    const created = await createDraftPositionFromText({
      title: idea.title,
      body: idea.body,
      tags: idea.tags,
      sourceType: "random_study",
      sourceLabel: "Quick idea conversion"
    });
    convertedToId = created.id;
  }

  if (convertType === "repair") {
    const created = await createRepairFromText({
      title: idea.title,
      body: idea.body,
      tags: idea.tags
    });
    convertedToId = created.id;
  }

  await OpeningDB.upsertQuickIdea({
    ...idea,
    status: "converted",
    converted_to_type: convertType,
    converted_to_id: convertedToId,
    updated_at: stamp
  });
}

$("supportQuickForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const type = $("supportQuickTypeInput")?.value || "Idea";
  const title = $("supportQuickTitleInput")?.value.trim() || "";
  const body = $("supportQuickBodyInput")?.value.trim() || "";
  const tags = parseTagsInput($("supportQuickTagsInput")?.value || "");

  if (!title && !body) return;

  const stamp = nowIso();

  try {
    if (type === "Idea") {
      await OpeningDB.upsertQuickIdea({
        title: title || "Untitled idea",
        body,
        idea_type: "general",
        status: "inbox",
        converted_to_type: "",
        converted_to_id: "",
        tags,
        created_at: stamp,
        updated_at: stamp
      });
    }

    if (type === "Support card") {
      await OpeningDB.upsertSupportCard({
        title: title || "Untitled support card",
        body,
        card_type: "note",
        category: "other",
        pinned: false,
        priority: "normal",
        tags,
        source: "",
        source_url: "",
        status: "active",
        created_at: stamp,
        updated_at: stamp,
        last_reviewed_at: null,
        review_count: 0
      });
    }

    if (type === "Goal") {
      await OpeningDB.upsertGoal({
        title: title || "Untitled goal",
        goal_type: "custom",
        description: body,
        why: "",
        success_criteria: "",
        current_value: null,
        target_value: null,
        unit: "",
        manual_progress_percent: null,
        target_date: "",
        status: "active",
        priority: "normal",
        parent_goal_id: null,
        linked_book_id: null,
        linked_support_card_ids: [],
        tags,
        created_at: stamp,
        updated_at: stamp,
        completed_at: null,
        last_touched_at: stamp
      });
    }

    if (type === "Reminder") {
      await OpeningDB.upsertAppReminder({
        title: title || "Untitled reminder",
        note: body,
        reminder_type: "custom",
        due_date: "",
        due_time: "",
        repeat_rule: "none",
        repeat_interval: 1,
        repeat_days: [],
        status: "active",
        snooze_until: "",
        priority: "normal",
        linked_goal_id: null,
        linked_book_id: null,
        linked_support_card_id: null,
        tags,
        created_at: stamp,
        updated_at: stamp,
        completed_at: null
      });
    }

    if (type === "Book") {
      await OpeningDB.upsertBook({
        title: title || "Untitled book",
        author: "",
        format: "book",
        status: "want_to_read",
        area: "general",
        reason: body,
        what_it_teaches: "",
        current_page: null,
        total_pages: null,
        progress_percent: null,
        started_at: "",
        target_finish_date: "",
        finished_at: "",
        rating: null,
        key_lessons: "",
        action_items: "",
        source_url: "",
        file_label: "",
        tags,
        created_at: stamp,
        updated_at: stamp
      });
    }

    if (type === "Tournament note") {
      await OpeningDB.upsertTournamentNote({
        event_name: title || "Untitled event note",
        event_date: "",
        event_location: "",
        time_control: "",
        section: "",
        status: "planned",
        pre_event_goal: body,
        opening_focus: "",
        mental_focus: "",
        practical_checklist: "",
        round_notes: "",
        after_event_lessons: "",
        linked_goal_id: null,
        tags,
        created_at: stamp,
        updated_at: stamp
      });
    }

    $("supportQuickForm").reset();
    await refresh();
    showToast(navigator.onLine ? "Capture saved." : "Capture saved locally.");
  } catch (error) {
    reportActionError("Saving quick capture", error);
  }
});

$("goalForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = goalById($("goalIdInput").value);
  const stamp = nowIso();

  try {
    await OpeningDB.upsertGoal({
      id: existing?.id || crypto.randomUUID(),
      title: $("goalTitleInput").value.trim() || "Untitled goal",
      goal_type: $("goalTypeInput").value,
      description: $("goalDescriptionInput").value.trim(),
      why: $("goalWhyInput").value.trim(),
      success_criteria: $("goalSuccessCriteriaInput").value.trim(),
      current_value: $("goalCurrentValueInput").value,
      target_value: $("goalTargetValueInput").value,
      unit: $("goalUnitInput").value.trim(),
      manual_progress_percent: $("goalManualProgressInput").value,
      target_date: $("goalTargetDateInput").value,
      status: $("goalStatusInput").value,
      priority: $("goalPriorityInput").value,
      parent_goal_id: $("goalParentInput").value || null,
      linked_book_id: $("goalLinkedBookInput").value || null,
      linked_support_card_ids: selectedMultiValues("goalLinkedSupportCardsInput"),
      tags: parseTagsInput($("goalTagsInput").value),
      created_at: existing?.created_at || stamp,
      updated_at: stamp,
      completed_at: $("goalStatusInput").value === "achieved" ? (existing?.completed_at || stamp) : null,
      last_touched_at: stamp
    });

    await refresh();
    showToast(navigator.onLine ? "Goal saved." : "Goal saved locally.");
    resetGoalForm();
  } catch (error) {
    reportActionError("Saving goal", error);
  }
});

$("goalResetBtn")?.addEventListener("click", resetGoalForm);

$("goalList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-goal-action]");
  if (!button) return;
  const goal = goalById(button.dataset.goalId);
  if (!goal) return;

  try {
    if (button.dataset.goalAction === "edit") {
      fillGoalForm(goal);
      scrollToForm("goalForm");
      return;
    }

    if (button.dataset.goalAction === "achieve") {
      await OpeningDB.upsertGoal({ ...goal, status: "achieved", completed_at: goal.completed_at || nowIso(), updated_at: nowIso(), last_touched_at: nowIso() });
    }

    if (button.dataset.goalAction === "pause") {
      await OpeningDB.upsertGoal({ ...goal, status: "paused", updated_at: nowIso(), last_touched_at: nowIso() });
    }

    if (button.dataset.goalAction === "reactivate") {
      await OpeningDB.upsertGoal({ ...goal, status: "active", updated_at: nowIso(), last_touched_at: nowIso(), completed_at: null });
    }

    if (button.dataset.goalAction === "delete") {
      if (!confirm(`Delete "${goal.title || "this goal"}"?`)) return;
      await OpeningDB.deleteGoal(goal.id);
    }

    await refresh();
    showToast("Goal updated.");
  } catch (error) {
    reportActionError("Updating goal", error);
  }
});

$("reminderForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = reminderById($("reminderIdInput").value);
  const stamp = nowIso();

  try {
    await OpeningDB.upsertAppReminder({
      id: existing?.id || crypto.randomUUID(),
      title: $("reminderTitleInput").value.trim() || "Untitled reminder",
      note: $("reminderNoteInput").value.trim(),
      reminder_type: $("reminderTypeInput").value,
      due_date: $("reminderDueDateInput").value,
      due_time: $("reminderDueTimeInput").value,
      repeat_rule: $("reminderRepeatRuleInput").value,
      repeat_interval: $("reminderRepeatIntervalInput").value,
      repeat_days: parseTagsInput($("reminderRepeatDaysInput").value).map(day => day.toLowerCase()),
      status: $("reminderStatusInput").value,
      snooze_until: $("reminderSnoozeUntilInput").value,
      priority: $("reminderPriorityInput").value,
      linked_goal_id: $("reminderLinkedGoalInput").value || null,
      linked_book_id: $("reminderLinkedBookInput").value || null,
      linked_support_card_id: $("reminderLinkedSupportCardInput").value || null,
      tags: parseTagsInput($("reminderTagsInput").value),
      created_at: existing?.created_at || stamp,
      updated_at: stamp,
      completed_at: $("reminderStatusInput").value === "done" ? (existing?.completed_at || stamp) : null
    });

    await refresh();
    showToast(navigator.onLine ? "Reminder saved." : "Reminder saved locally.");
    resetReminderForm();
  } catch (error) {
    reportActionError("Saving reminder", error);
  }
});

$("reminderResetBtn")?.addEventListener("click", resetReminderForm);

$("reminderList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-reminder-action]");
  if (!button) return;
  const reminder = reminderById(button.dataset.reminderId);
  if (!reminder) return;

  try {
    if (button.dataset.reminderAction === "edit") {
      fillReminderForm(reminder);
      scrollToForm("reminderForm");
      return;
    }

    if (button.dataset.reminderAction === "done") {
      await handleReminderDone(reminder);
    }

    if (button.dataset.reminderAction === "snooze-day") {
      await handleReminderSnooze(reminder, 1);
    }

    if (button.dataset.reminderAction === "snooze-week") {
      await handleReminderSnooze(reminder, 7);
    }

    if (button.dataset.reminderAction === "archive") {
      await OpeningDB.upsertAppReminder({ ...reminder, status: reminder.status === "archived" ? "active" : "archived", updated_at: nowIso() });
    }

    if (button.dataset.reminderAction === "delete") {
      if (!confirm(`Delete "${reminder.title || "this reminder"}"?`)) return;
      await OpeningDB.deleteAppReminder(reminder.id);
    }

    await refresh();
    showToast("Reminder updated.");
  } catch (error) {
    reportActionError("Updating reminder", error);
  }
});

$("bookForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = bookById($("bookIdInput").value);
  const stamp = nowIso();

  try {
    const saved = await OpeningDB.upsertBook({
      id: existing?.id || crypto.randomUUID(),
      title: $("bookTitleInput").value.trim() || "Untitled book",
      author: $("bookAuthorInput").value.trim(),
      format: $("bookFormatInput").value,
      status: $("bookStatusInput").value,
      area: $("bookAreaInput").value,
      reason: $("bookReasonInput").value.trim(),
      what_it_teaches: $("bookTeachesInput").value.trim(),
      current_page: $("bookCurrentPageInput").value,
      total_pages: $("bookTotalPagesInput").value,
      progress_percent: $("bookProgressPercentInput").value,
      started_at: $("bookStartedAtInput").value,
      target_finish_date: $("bookTargetFinishInput").value,
      finished_at: $("bookFinishedAtInput").value || ($("bookStatusInput").value === "finished" ? todayKey() : ""),
      rating: $("bookRatingInput").value,
      key_lessons: $("bookKeyLessonsInput").value.trim(),
      action_items: $("bookActionItemsInput").value.trim(),
      source_url: $("bookSourceUrlInput").value.trim(),
      file_label: $("bookFileLabelInput").value.trim(),
      tags: parseTagsInput($("bookTagsInput").value),
      created_at: existing?.created_at || stamp,
      updated_at: stamp
    });

    selectedBookId = saved.id;
    saveSelectedBook();
    await refresh();
    showToast(navigator.onLine ? "Book saved." : "Book saved locally.");
    fillBookForm(saved);
  } catch (error) {
    reportActionError("Saving book", error);
  }
});

$("bookResetBtn")?.addEventListener("click", resetBookForm);

$("bookList")?.addEventListener("click", async event => {
  const actionButton = event.target.closest("[data-book-action]");
  const card = event.target.closest("[data-book-id]");

  if (card?.dataset.bookId && !actionButton) {
    selectedBookId = card.dataset.bookId;
    saveSelectedBook();
    paint();
    return;
  }

  if (!actionButton) return;
  const book = bookById(actionButton.dataset.bookId);
  if (!book) return;

  try {
    if (actionButton.dataset.bookAction === "edit") {
      selectedBookId = book.id;
      saveSelectedBook();
      fillBookForm(book);
      scrollToForm("bookForm");
      paint();
      return;
    }

    if (actionButton.dataset.bookAction === "add-pages") {
      const step = Number.parseInt(actionButton.dataset.pageStep || "10", 10) || 10;
      await OpeningDB.upsertBook({
        ...book,
        current_page: Math.max(0, Number(book.current_page || 0) + step),
        updated_at: nowIso()
      });
    }

    if (actionButton.dataset.bookAction === "status") {
      const nextStatus = actionButton.dataset.bookStatus || "currently_reading";
      await OpeningDB.upsertBook({
        ...book,
        status: nextStatus,
        started_at: nextStatus === "currently_reading" && !book.started_at ? todayKey() : book.started_at,
        finished_at: nextStatus === "finished" ? (book.finished_at || todayKey()) : (nextStatus === "finished" ? book.finished_at : book.finished_at),
        updated_at: nowIso()
      });
    }

    if (actionButton.dataset.bookAction === "delete") {
      if (!confirm(`Delete "${book.title || "this book"}" and its notes?`)) return;
      await OpeningDB.deleteBook(book.id);
      if (selectedBookId === book.id) {
        selectedBookId = null;
      }
    }

    await refresh();
    showToast("Book updated.");
  } catch (error) {
    reportActionError("Updating book", error);
  }
});

$("bookNoteForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const book = selectedBook();
  if (!book) return;
  const existing = bookNoteById($("bookNoteIdInput").value);
  const stamp = nowIso();

  try {
    await OpeningDB.upsertBookNote({
      id: existing?.id || crypto.randomUUID(),
      book_id: book.id,
      title: $("bookNoteTitleInput").value.trim() || "Untitled book note",
      page: $("bookNotePageInput").value.trim(),
      chapter: $("bookNoteChapterInput").value.trim(),
      note: $("bookNoteInput").value.trim(),
      lesson: $("bookNoteLessonInput").value.trim(),
      action_item: $("bookNoteActionInput").value.trim(),
      tags: parseTagsInput($("bookNoteTagsInput").value),
      linked_opening_node_id: $("bookNoteOpeningIdInput").value.trim() || null,
      linked_position_id: $("bookNotePositionIdInput").value.trim() || null,
      linked_repair_id: $("bookNoteRepairIdInput").value.trim() || null,
      created_at: existing?.created_at || stamp,
      updated_at: stamp
    });

    await refresh();
    showToast(navigator.onLine ? "Book note saved." : "Book note saved locally.");
    resetBookNoteForm();
  } catch (error) {
    reportActionError("Saving book note", error);
  }
});

$("bookNoteResetBtn")?.addEventListener("click", resetBookNoteForm);

$("bookNoteList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-book-note-action]");
  if (!button) return;
  const note = bookNoteById(button.dataset.bookNoteId);
  if (!note) return;

  try {
    if (button.dataset.bookNoteAction === "edit") {
      fillBookNoteForm(note);
      scrollToForm("bookNoteForm");
      return;
    }

    if (button.dataset.bookNoteAction === "position") {
      const created = await createDraftPositionFromText({
        title: note.title || "Book note position",
        body: note.lesson || note.note,
        tags: note.tags,
        sourceType: "book",
        sourceLabel: selectedBook()?.title || "Book note"
      });
      await OpeningDB.upsertBookNote({
        ...note,
        linked_position_id: created.id,
        updated_at: nowIso()
      });
    }

    if (button.dataset.bookNoteAction === "card") {
      await OpeningDB.upsertSupportCard({
        title: note.title || "Book note card",
        body: note.lesson || note.note || note.action_item,
        card_type: "note",
        category: "study_process",
        pinned: false,
        priority: "normal",
        tags: note.tags,
        source: selectedBook()?.title || "Book note",
        source_url: "",
        status: "active",
        created_at: nowIso(),
        updated_at: nowIso(),
        last_reviewed_at: null,
        review_count: 0
      });
    }

    if (button.dataset.bookNoteAction === "repair") {
      const created = await createRepairFromText({
        title: note.title || "Book note repair",
        body: note.lesson || note.note || note.action_item,
        tags: note.tags
      });
      await OpeningDB.upsertBookNote({
        ...note,
        linked_repair_id: created.id,
        updated_at: nowIso()
      });
    }

    if (button.dataset.bookNoteAction === "delete") {
      if (!confirm(`Delete "${note.title || "this note"}"?`)) return;
      await OpeningDB.deleteBookNote(note.id);
    }

    await refresh();
    showToast("Book note updated.");
  } catch (error) {
    reportActionError("Updating book note", error);
  }
});

$("supportCardForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = supportCardById($("supportCardIdInput").value);
  const stamp = nowIso();

  try {
    await OpeningDB.upsertSupportCard({
      id: existing?.id || crypto.randomUUID(),
      title: $("supportCardTitleInput").value.trim() || "Untitled support card",
      body: $("supportCardBodyInput").value.trim(),
      card_type: $("supportCardTypeInput").value,
      category: $("supportCardCategoryInput").value,
      pinned: $("supportCardPinnedInput").checked,
      priority: $("supportCardPriorityInput").value,
      tags: parseTagsInput($("supportCardTagsInput").value),
      source: $("supportCardSourceInput").value.trim(),
      source_url: $("supportCardSourceUrlInput").value.trim(),
      status: $("supportCardStatusInput").value,
      created_at: existing?.created_at || stamp,
      updated_at: stamp,
      last_reviewed_at: existing?.last_reviewed_at || null,
      review_count: existing?.review_count || 0
    });

    await refresh();
    showToast(navigator.onLine ? "Support card saved." : "Support card saved locally.");
    resetSupportCardForm();
  } catch (error) {
    reportActionError("Saving support card", error);
  }
});

$("supportCardResetBtn")?.addEventListener("click", resetSupportCardForm);
$("supportStarterDeckBtn")?.addEventListener("click", createStarterDeck);
$("supportRandomCardBtn")?.addEventListener("click", showRandomCard);

$("supportCardList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-card-action]");
  if (!button) return;
  const card = supportCardById(button.dataset.cardId);
  if (!card) return;

  try {
    if (button.dataset.cardAction === "edit") {
      fillSupportCardForm(card);
      scrollToForm("supportCardForm");
      return;
    }

    if (button.dataset.cardAction === "review") {
      await OpeningDB.upsertSupportCard({
        ...card,
        last_reviewed_at: nowIso(),
        review_count: Number(card.review_count || 0) + 1,
        updated_at: nowIso()
      });
    }

    if (button.dataset.cardAction === "pin") {
      await OpeningDB.upsertSupportCard({ ...card, pinned: !card.pinned, updated_at: nowIso() });
    }

    if (button.dataset.cardAction === "archive") {
      await OpeningDB.upsertSupportCard({ ...card, status: card.status === "archived" ? "active" : "archived", updated_at: nowIso() });
    }

    if (button.dataset.cardAction === "delete") {
      if (!confirm(`Delete "${card.title || "this support card"}"?`)) return;
      await OpeningDB.deleteSupportCard(card.id);
    }

    await refresh();
    showToast("Support card updated.");
  } catch (error) {
    reportActionError("Updating support card", error);
  }
});

$("tournamentNoteForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = tournamentNoteById($("tournamentNoteIdInput").value);
  const stamp = nowIso();

  try {
    await OpeningDB.upsertTournamentNote({
      id: existing?.id || crypto.randomUUID(),
      event_name: $("tournamentEventNameInput").value.trim() || "Untitled event",
      event_date: $("tournamentEventDateInput").value,
      event_location: $("tournamentLocationInput").value.trim(),
      time_control: $("tournamentTimeControlInput").value.trim(),
      section: $("tournamentSectionInput").value.trim(),
      status: $("tournamentStatusInput").value,
      pre_event_goal: $("tournamentPreGoalInput").value.trim(),
      opening_focus: $("tournamentOpeningFocusInput").value.trim(),
      mental_focus: $("tournamentMentalFocusInput").value.trim(),
      practical_checklist: $("tournamentChecklistInput").value.trim(),
      round_notes: $("tournamentRoundNotesInput").value.trim(),
      after_event_lessons: $("tournamentAfterLessonsInput").value.trim(),
      linked_goal_id: $("tournamentLinkedGoalInput").value || null,
      linked_game_id: $("tournamentLinkedGameInput").value || null,
      linked_position_id: $("tournamentLinkedPositionInput").value || null,
      linked_repair_id: $("tournamentLinkedRepairInput").value || null,
      tags: parseTagsInput($("tournamentTagsInput").value),
      created_at: existing?.created_at || stamp,
      updated_at: stamp
    });

    await refresh();
    showToast(navigator.onLine ? "Tournament note saved." : "Tournament note saved locally.");
    resetTournamentForm();
  } catch (error) {
    reportActionError("Saving tournament note", error);
  }
});

$("tournamentResetBtn")?.addEventListener("click", resetTournamentForm);

$("tournamentNoteList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-tournament-action]");
  if (!button) return;
  const note = tournamentNoteById(button.dataset.tournamentId);
  if (!note) return;

  try {
    if (button.dataset.tournamentAction === "edit") {
      fillTournamentForm(note);
      scrollToForm("tournamentNoteForm");
      return;
    }

    if (button.dataset.tournamentAction === "status") {
      await OpeningDB.upsertTournamentNote({ ...note, status: button.dataset.tournamentStatus, updated_at: nowIso() });
    }

    if (button.dataset.tournamentAction === "delete") {
      if (!confirm(`Delete "${note.event_name || "this tournament note"}"?`)) return;
      await OpeningDB.deleteTournamentNote(note.id);
    }

    await refresh();
    showToast("Tournament note updated.");
  } catch (error) {
    reportActionError("Updating tournament note", error);
  }
});

$("quickIdeaForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = quickIdeaById($("quickIdeaIdInput").value);
  const stamp = nowIso();

  try {
    await OpeningDB.upsertQuickIdea({
      id: existing?.id || crypto.randomUUID(),
      title: $("quickIdeaTitleInput").value.trim() || "Untitled idea",
      body: $("quickIdeaBodyInput").value.trim(),
      idea_type: $("quickIdeaTypeInput").value,
      status: $("quickIdeaStatusInput").value,
      converted_to_type: existing?.converted_to_type || "",
      converted_to_id: existing?.converted_to_id || "",
      tags: parseTagsInput($("quickIdeaTagsInput").value),
      created_at: existing?.created_at || stamp,
      updated_at: stamp
    });

    await refresh();
    showToast(navigator.onLine ? "Idea saved." : "Idea saved locally.");
    resetQuickIdeaForm();
  } catch (error) {
    reportActionError("Saving quick idea", error);
  }
});

$("quickIdeaResetBtn")?.addEventListener("click", resetQuickIdeaForm);

$("quickIdeaList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-idea-action]");
  if (!button) return;
  const idea = quickIdeaById(button.dataset.ideaId);
  if (!idea) return;

  try {
    if (button.dataset.ideaAction === "edit") {
      fillQuickIdeaForm(idea);
      scrollToForm("quickIdeaForm");
      return;
    }

    if (button.dataset.ideaAction === "convert") {
      await convertIdea(idea, button.dataset.convertType);
    }

    if (button.dataset.ideaAction === "archive") {
      await OpeningDB.upsertQuickIdea({ ...idea, status: idea.status === "archived" ? "inbox" : "archived", updated_at: nowIso() });
    }

    if (button.dataset.ideaAction === "delete") {
      if (!confirm(`Delete "${idea.title || "this idea"}"?`)) return;
      await OpeningDB.deleteQuickIdea(idea.id);
    }

    await refresh();
    showToast("Idea updated.");
  } catch (error) {
    reportActionError("Updating quick idea", error);
  }
});

$("supportTodayList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-command-action]");
  if (!button) return;

  try {
    if (button.dataset.commandAction === "mark-reminder-done") {
      await handleReminderDone(reminderById(button.dataset.commandId));
      await refresh();
      showToast("Reminder updated.");
      return;
    }

    if (button.dataset.commandAction === "edit-goal") {
      setSupportPane("goals", { scroll: true });
      fillGoalForm(goalById(button.dataset.commandId));
      scrollToForm("goalForm");
      return;
    }

    if (button.dataset.commandAction === "edit-card") {
      setSupportPane("cards", { scroll: true });
      fillSupportCardForm(supportCardById(button.dataset.commandId));
      scrollToForm("supportCardForm");
      return;
    }

    if (button.dataset.commandAction === "edit-book") {
      setSupportPane("books", { scroll: true });
      selectedBookId = button.dataset.commandId;
      saveSelectedBook();
      fillBookForm(bookById(button.dataset.commandId));
      paint();
      scrollToForm("bookForm");
    }
  } catch (error) {
    reportActionError("Updating command center item", error);
  }
});

$("supportWorkspaceTabs")?.addEventListener("click", event => {
  const button = event.target.closest("[data-support-pane-button]");
  if (!button) return;
  setSupportPane(button.dataset.supportPaneButton);
});

[
  "goalSearchInput",
  "goalStatusFilter",
  "goalTypeFilter",
  "goalPriorityFilter"
].forEach(id => $(id)?.addEventListener(id.includes("Search") ? "input" : "change", renderGoals));

[
  "reminderSearchInput",
  "reminderVisibilityFilter"
].forEach(id => $(id)?.addEventListener(id.includes("Search") ? "input" : "change", renderReminders));

[
  "bookSearchInput",
  "bookAreaFilter",
  "bookStatusFilter"
].forEach(id => $(id)?.addEventListener(id.includes("Search") ? "input" : "change", renderBooks));

[
  "bookNoteSearchInput"
].forEach(id => $(id)?.addEventListener("input", renderBookNotes));

[
  "supportSearchInput",
  "supportCardTypeFilter",
  "supportGlobalFilterInput",
  "supportPinnedOnlyInput"
].forEach(id => $(id)?.addEventListener(id.includes("Search") ? "input" : "change", renderSupportCards));

[
  "tournamentSearchInput",
  "tournamentStatusFilter"
].forEach(id => $(id)?.addEventListener(id.includes("Search") ? "input" : "change", renderTournamentNotes));

[
  "quickIdeaSearchInput",
  "quickIdeaStatusFilter"
].forEach(id => $(id)?.addEventListener(id.includes("Search") ? "input" : "change", renderQuickIdeas));

$("syncBtn")?.addEventListener("click", async () => {
  try {
    await refresh();
    showToast(navigator.onLine ? "Support hub synced." : "Offline mode active. Using your local copy.");
  } catch (error) {
    reportActionError("Syncing support hub", error);
  }
});

resetGoalForm();
resetReminderForm();
resetBookForm();
resetBookNoteForm();
resetSupportCardForm();
resetTournamentForm();
resetQuickIdeaForm();

try {
  await refresh();
} catch (error) {
  reportActionError("Loading support hub", error);
}
