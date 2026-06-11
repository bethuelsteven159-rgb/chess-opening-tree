import { supabase } from "./config/supabase.js";
import {
  applyBoardAppearance,
  boardAppearanceSummary,
  getStoredBoardAppearance,
  pieceAssetPath,
  PIECE_STYLE_VALUES,
  BOARD_CONTRAST_VALUES
} from "./board-appearance.js";
import {
  setSelectedGameId,
  setSelectedGamePly,
  setSelectedNodeId,
  setSelectedPositionId,
  setSelectedRepairId,
  setTrainingIntent
} from "./navigation-state.js";
import { buildLeafLines } from "./review-utils.js";

export const THEME_KEY = "gm_opening_tree_theme_v1";
const DEFAULT_THEME = "dark";

function resolveTheme(theme) {
  return theme === "light" ? "light" : DEFAULT_THEME;
}

function refreshRenderedBoardPieces() {
  document.querySelectorAll(".piece-img[data-piece-color][data-piece-type]").forEach(img => {
    const piece = {
      color: img.dataset.pieceColor || "w",
      type: img.dataset.pieceType || "p"
    };
    img.src = pieceAssetPath(piece);
    img.classList.remove("is-broken");
  });
}

function emitBoardAppearanceChange() {
  window.dispatchEvent(new CustomEvent("gm-board-appearance-change"));
  refreshRenderedBoardPieces();
}

function ensureActionButton(navActions, id, label) {
  if (!navActions) return null;

  let button = document.getElementById(id);
  if (button) return button;

  button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.className = "button button-ghost button-tiny page-tool-button";
  button.textContent = label;
  navActions.prepend(button);
  return button;
}

function ensureBoardAppearanceDialog() {
  let dialog = document.getElementById("boardAppearanceDialog");
  if (dialog) return dialog;

  dialog = document.createElement("div");
  dialog.id = "boardAppearanceDialog";
  dialog.className = "utility-dialog hidden";
  dialog.innerHTML = `
    <div class="utility-dialog-card" role="dialog" aria-modal="true" aria-labelledby="boardAppearanceTitle">
      <div class="utility-dialog-head">
        <div>
          <p class="eyebrow">Board look</p>
          <h3 id="boardAppearanceTitle">Choose the clearest board for you</h3>
        </div>
        <button id="boardAppearanceCloseBtn" class="button button-ghost button-tiny" type="button">Close</button>
      </div>

      <div class="utility-dialog-grid">
        <label>
          Piece style
          <select id="boardPieceStyleSelect">
            ${PIECE_STYLE_VALUES.map(value => `
              <option value="${value}">${value === "high-contrast" ? "High contrast" : "Classic"}</option>
            `).join("")}
          </select>
        </label>

        <label>
          Board contrast
          <select id="boardContrastSelect">
            ${BOARD_CONTRAST_VALUES.map(value => `
              <option value="${value}">${value === "high-clarity" ? "High clarity" : "Normal"}</option>
            `).join("")}
          </select>
        </label>
      </div>

      <p class="muted">Settings save locally and apply to every board page, even offline.</p>
    </div>
  `;

  document.body.appendChild(dialog);

  const close = () => dialog.classList.add("hidden");
  dialog.addEventListener("click", event => {
    if (event.target === dialog) close();
  });
  dialog.querySelector("#boardAppearanceCloseBtn")?.addEventListener("click", close);
  dialog.querySelector("#boardPieceStyleSelect")?.addEventListener("change", event => {
    const settings = applyBoardAppearance({
      ...getStoredBoardAppearance(),
      pieceStyle: event.target.value
    });
    const button = document.getElementById("boardAppearanceBtn");
    if (button) button.textContent = boardAppearanceSummary(settings);
    emitBoardAppearanceChange();
  });
  dialog.querySelector("#boardContrastSelect")?.addEventListener("change", event => {
    const settings = applyBoardAppearance({
      ...getStoredBoardAppearance(),
      boardContrast: event.target.value
    });
    const button = document.getElementById("boardAppearanceBtn");
    if (button) button.textContent = boardAppearanceSummary(settings);
    emitBoardAppearanceChange();
  });

  return dialog;
}

function openBoardAppearanceDialog() {
  const dialog = ensureBoardAppearanceDialog();
  const settings = getStoredBoardAppearance();
  const pieceSelect = dialog.querySelector("#boardPieceStyleSelect");
  const contrastSelect = dialog.querySelector("#boardContrastSelect");

  if (pieceSelect) pieceSelect.value = settings.pieceStyle;
  if (contrastSelect) contrastSelect.value = settings.boardContrast;

  dialog.classList.remove("hidden");
}

function labelForSearchType(type) {
  return {
    opening_node: "Opening move",
    opening_line: "Opening line",
    game: "Game",
    game_annotation: "Move note",
    position: "Position",
    mistake: "Mistake",
    repair: "Repair",
    support_card: "Support card",
    goal: "Goal",
    reminder: "Reminder",
    book: "Book",
    book_note: "Book note",
    tournament_note: "Event note",
    quick_idea: "Idea"
  }[type] || "Result";
}

function buildSearchText(parts = []) {
  return parts
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function snippetOrFallback(text, fallback) {
  const clean = String(text || "").trim();
  return clean || fallback;
}

function countMatches(haystack, query) {
  if (!query) return 1;
  let index = -1;
  let count = 0;

  while (true) {
    index = haystack.indexOf(query, index + 1);
    if (index === -1) return count;
    count += 1;
  }
}

function supportTargetForResult(result) {
  const paneByType = {
    support_card: "cards",
    goal: "goals",
    reminder: "reminders",
    book: "books",
    book_note: "books",
    tournament_note: "tournaments",
    quick_idea: "ideas"
  };
  const pane = paneByType[result.type] || "quick";
  localStorage.setItem("gm_support_focus_v1", JSON.stringify({
    pane,
    type: result.type,
    id: result.id
  }));
  window.location.href = "./support.html";
}

async function loadSearchResults() {
  if (!window.OpeningDB) return [];

  const [
    nodes,
    reviewItems,
    games,
    gameAnnotations,
    positions,
    mistakes,
    repairs,
    supportCards,
    goals,
    reminders,
    books,
    bookNotes,
    tournamentNotes,
    quickIdeas
  ] = await Promise.all([
    window.OpeningDB.loadNodes(),
    window.OpeningDB.loadReviewItems ? window.OpeningDB.loadReviewItems() : Promise.resolve([]),
    window.OpeningDB.loadGames(),
    window.OpeningDB.loadGameAnnotations(),
    window.OpeningDB.loadPositions(),
    window.OpeningDB.loadMistakes(),
    window.OpeningDB.loadRepairItems(),
    window.OpeningDB.loadSupportCards(),
    window.OpeningDB.loadGoals(),
    window.OpeningDB.loadAppReminders(),
    window.OpeningDB.loadBooks(),
    window.OpeningDB.loadBookNotes(),
    window.OpeningDB.loadTournamentNotes(),
    window.OpeningDB.loadQuickIdeas()
  ]);

  const lines = buildLeafLines(nodes, reviewItems);
  const results = [];

  nodes.forEach(node => {
    results.push({
      id: node.id,
      type: "opening_node",
      title: node.title || node.move,
      snippet: snippetOrFallback(node.explanation, node.move),
      meta: [node.move, ...(node.tags || [])].filter(Boolean).join(" • "),
      searchText: buildSearchText([node.move, node.title, node.explanation, node.tags])
    });
  });

  lines.forEach(line => {
    results.push({
      id: line.leaf_node_id,
      type: "opening_line",
      title: line.title,
      snippet: line.moves.map(node => node.move).join(" "),
      meta: `${line.color} • ${line.ply_count} ply • ${line.due_state}`,
      searchText: buildSearchText([line.title, line.moves.map(node => [node.move, node.title, node.tags]), line.color])
    });
  });

  games.forEach(game => {
    results.push({
      id: game.id,
      type: "game",
      title: game.event || `${game.white_player || "White"} vs ${game.black_player || "Black"}`,
      snippet: snippetOrFallback(game.summary, [game.opening_name, game.result].filter(Boolean).join(" • ") || "Saved game"),
      meta: [game.date, game.opening_name, game.analysis_status].filter(Boolean).join(" • "),
      searchText: buildSearchText([game.event, game.white_player, game.black_player, game.summary, game.opening_name, game.tags])
    });
  });

  gameAnnotations.forEach(annotation => {
    results.push({
      id: annotation.id,
      type: "game_annotation",
      title: `${annotation.move_number || ""}${annotation.ply % 2 === 1 ? "." : "..."} ${annotation.san}`.trim(),
      snippet: snippetOrFallback(annotation.human_comment_after, annotation.human_comment_before || "Saved move note"),
      meta: [annotation.critical_type, annotation.emotional_state].filter(Boolean).join(" • "),
      game_id: annotation.game_id,
      ply: annotation.ply,
      searchText: buildSearchText([
        annotation.san,
        annotation.human_comment_before,
        annotation.human_comment_after,
        annotation.critical_type,
        annotation.emotional_state,
        annotation.candidate_moves
      ])
    });
  });

  positions.forEach(position => {
    results.push({
      id: position.id,
      type: "position",
      title: position.title || "Untitled position",
      snippet: snippetOrFallback(position.short_question, position.lesson || "Saved study position"),
      meta: [position.position_type, position.source_type, position.best_human_move].filter(Boolean).join(" • "),
      searchText: buildSearchText([
        position.title,
        position.short_question,
        position.lesson,
        position.correct_idea,
        position.wrong_idea,
        position.best_human_move,
        position.source_type,
        position.source_label,
        position.tags,
        position.themes
      ])
    });
  });

  mistakes.forEach(mistake => {
    results.push({
      id: mistake.id,
      type: "mistake",
      title: mistake.title || "Mistake record",
      snippet: snippetOrFallback(mistake.why_it_happened, mistake.correct_thinking_rule || "Saved mistake pattern"),
      meta: [mistake.category, mistake.severity, mistake.phase].filter(Boolean).join(" • "),
      position_id: mistake.position_id,
      game_id: mistake.source_type === "game" ? mistake.source_id : "",
      searchText: buildSearchText([
        mistake.title,
        mistake.category,
        mistake.cause,
        mistake.why_it_happened,
        mistake.correct_thinking_rule,
        mistake.tags
      ])
    });
  });

  repairs.forEach(repair => {
    results.push({
      id: repair.id,
      type: "repair",
      title: repair.mistake || "Repair card",
      snippet: snippetOrFallback(repair.lesson, repair.repair_action || repair.repair || "Saved repair"),
      meta: [repair.status, repair.category, repair.severity].filter(Boolean).join(" • "),
      searchText: buildSearchText([
        repair.mistake,
        repair.lesson,
        repair.repair_action,
        repair.test_question,
        repair.correct_response,
        repair.category,
        repair.status,
        repair.position_path
      ])
    });
  });

  supportCards.forEach(card => {
    results.push({
      id: card.id,
      type: "support_card",
      title: card.title || "Support card",
      snippet: snippetOrFallback(card.body, "Support card"),
      meta: [card.card_type, card.category, card.priority].filter(Boolean).join(" • "),
      searchText: buildSearchText([card.title, card.body, card.tags, card.source, card.category])
    });
  });

  goals.forEach(goal => {
    results.push({
      id: goal.id,
      type: "goal",
      title: goal.title || "Goal",
      snippet: snippetOrFallback(goal.description, goal.why || "Goal"),
      meta: [goal.goal_type, goal.status, goal.priority].filter(Boolean).join(" • "),
      searchText: buildSearchText([goal.title, goal.description, goal.why, goal.success_criteria, goal.tags])
    });
  });

  reminders.forEach(reminder => {
    results.push({
      id: reminder.id,
      type: "reminder",
      title: reminder.title || "Reminder",
      snippet: snippetOrFallback(reminder.note, "Reminder"),
      meta: [reminder.reminder_type, reminder.due_date, reminder.status].filter(Boolean).join(" • "),
      searchText: buildSearchText([reminder.title, reminder.note, reminder.tags, reminder.reminder_type])
    });
  });

  books.forEach(book => {
    results.push({
      id: book.id,
      type: "book",
      title: book.title || "Book",
      snippet: snippetOrFallback(book.what_it_teaches, book.key_lessons || "Book"),
      meta: [book.author, book.area, book.status].filter(Boolean).join(" • "),
      searchText: buildSearchText([book.title, book.author, book.what_it_teaches, book.key_lessons, book.action_items, book.tags])
    });
  });

  bookNotes.forEach(note => {
    results.push({
      id: note.id,
      type: "book_note",
      title: note.title || "Book note",
      snippet: snippetOrFallback(note.lesson, note.note || "Book note"),
      meta: [note.chapter, note.page].filter(Boolean).join(" • "),
      searchText: buildSearchText([note.title, note.chapter, note.page, note.note, note.lesson, note.action_item, note.tags])
    });
  });

  tournamentNotes.forEach(note => {
    results.push({
      id: note.id,
      type: "tournament_note",
      title: note.event_name || "Event note",
      snippet: snippetOrFallback(note.opening_focus, note.mental_focus || "Tournament note"),
      meta: [note.event_date, note.status, note.event_location].filter(Boolean).join(" • "),
      searchText: buildSearchText([
        note.event_name,
        note.event_location,
        note.opening_focus,
        note.mental_focus,
        note.practical_checklist,
        note.round_notes,
        note.after_event_lessons,
        note.tags
      ])
    });
  });

  quickIdeas.forEach(idea => {
    results.push({
      id: idea.id,
      type: "quick_idea",
      title: idea.title || "Idea",
      snippet: snippetOrFallback(idea.body, "Quick idea"),
      meta: [idea.idea_type, idea.status].filter(Boolean).join(" • "),
      searchText: buildSearchText([idea.title, idea.body, idea.tags, idea.idea_type, idea.converted_to_type])
    });
  });

  return results;
}

function ensureSearchDialog() {
  let dialog = document.getElementById("globalSearchDialog");
  if (dialog) return dialog;

  dialog = document.createElement("div");
  dialog.id = "globalSearchDialog";
  dialog.className = "utility-dialog hidden";
  dialog.innerHTML = `
    <div class="utility-dialog-card command-palette" role="dialog" aria-modal="true" aria-labelledby="globalSearchTitle">
      <div class="utility-dialog-head">
        <div>
          <p class="eyebrow">Search</p>
          <h3 id="globalSearchTitle">Find anything in the chess brain</h3>
        </div>
        <button id="globalSearchCloseBtn" class="button button-ghost button-tiny" type="button">Close</button>
      </div>

      <label class="command-palette-field">
        <span class="sr-only">Search query</span>
        <input id="globalSearchInput" placeholder="Italian, tilt, Lucena, tournament prep..." autocomplete="off" />
      </label>

      <div id="globalSearchMeta" class="muted">Search openings, lines, games, positions, repairs, books, goals, reminders, and more.</div>
      <div id="globalSearchResults" class="command-palette-results"></div>
    </div>
  `;

  document.body.appendChild(dialog);

  let cachedResults = [];
  let filteredResults = [];

  function paint(query = "") {
    const host = dialog.querySelector("#globalSearchResults");
    const meta = dialog.querySelector("#globalSearchMeta");
    if (!host || !meta) return;

    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) {
      meta.textContent = `Search openings, lines, games, positions, repairs, books, goals, reminders, and more.`;
      host.innerHTML = `<div class="command-palette-empty">Type to search your local chess brain.</div>`;
      filteredResults = [];
      return;
    }

    filteredResults = cachedResults
      .map(result => ({
        ...result,
        score: countMatches(result.searchText, normalizedQuery)
      }))
      .filter(result => result.score > 0)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, 40);

    meta.textContent = filteredResults.length
      ? `${filteredResults.length} result${filteredResults.length === 1 ? "" : "s"}`
      : `No matches for "${query}".`;

    host.innerHTML = filteredResults.length
      ? filteredResults.map((result, index) => `
          <button class="command-result-card" type="button" data-result-index="${index}">
            <div class="command-result-top">
              <span class="mini-tag">${labelForSearchType(result.type)}</span>
              <strong>${result.title}</strong>
            </div>
            <p>${result.snippet}</p>
            <span class="muted">${result.meta || "Open result"}</span>
          </button>
        `).join("")
      : `<div class="command-palette-empty">No matching items yet.</div>`;
  }

  async function openDialog() {
    dialog.classList.remove("hidden");
    const input = dialog.querySelector("#globalSearchInput");
    if (input) {
      input.value = "";
      input.focus();
    }
    const host = dialog.querySelector("#globalSearchResults");
    if (host) host.innerHTML = `<div class="command-palette-empty">Loading local search index…</div>`;
    cachedResults = await loadSearchResults();
    paint("");
  }

  function closeDialog() {
    dialog.classList.add("hidden");
  }

  async function openResult(result) {
    if (!result) return;

    if (result.type === "opening_node") {
      setSelectedNodeId(result.id);
      window.location.href = "./editor.html";
      return;
    }

    if (result.type === "opening_line") {
      setTrainingIntent({
        mode: "opening_lines",
        source_type: "opening_line",
        source_id: result.id
      });
      window.location.href = "./training.html";
      return;
    }

    if (result.type === "game") {
      setSelectedGameId(result.id);
      setSelectedGamePly(0);
      window.location.href = "./games.html";
      return;
    }

    if (result.type === "game_annotation") {
      setSelectedGameId(result.game_id);
      setSelectedGamePly(result.ply || 0);
      window.location.href = "./games.html";
      return;
    }

    if (result.type === "position") {
      setSelectedPositionId(result.id);
      window.location.href = "./positions.html";
      return;
    }

    if (result.type === "mistake") {
      if (result.position_id) {
        setSelectedPositionId(result.position_id);
        window.location.href = "./positions.html";
        return;
      }

      if (result.game_id) {
        setSelectedGameId(result.game_id);
        setSelectedGamePly(0);
        window.location.href = "./games.html";
        return;
      }
    }

    if (result.type === "repair") {
      setSelectedRepairId(result.id);
      window.location.href = "./repair.html";
      return;
    }

    supportTargetForResult(result);
  }

  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeDialog();
  });
  dialog.querySelector("#globalSearchCloseBtn")?.addEventListener("click", closeDialog);
  dialog.querySelector("#globalSearchInput")?.addEventListener("input", event => paint(event.target.value));
  dialog.querySelector("#globalSearchResults")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-result-index]");
    if (!button) return;
    await openResult(filteredResults[Number.parseInt(button.dataset.resultIndex, 10) || 0]);
  });

  dialog.openDialog = openDialog;
  dialog.closeDialog = closeDialog;
  return dialog;
}

function openGlobalSearch() {
  const dialog = ensureSearchDialog();
  dialog.openDialog();
}

export function getStoredTheme() {
  return resolveTheme(localStorage.getItem(THEME_KEY));
}

export function applyTheme(theme = getStoredTheme()) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.body?.setAttribute("data-theme", resolved);
  localStorage.setItem(THEME_KEY, resolved);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", resolved === "light" ? "#f4efe4" : "#08111d");
  }

  return resolved;
}

export function bindThemeToggle(button) {
  if (!button) return;

  function paintLabel() {
    const currentTheme = applyTheme();
    button.textContent = currentTheme === "light" ? "Dark mode" : "Light mode";
    button.setAttribute("aria-pressed", currentTheme === "light" ? "true" : "false");
  }

  button.addEventListener("click", () => {
    const currentTheme = getStoredTheme();
    applyTheme(currentTheme === "light" ? "dark" : "light");
    paintLabel();
  });

  paintLabel();
}

export async function logoutUser() {
  await supabase.auth.signOut();
  window.location.href = "./login.html";
}

export function bindLogoutButton(button) {
  if (!button) return;

  button.addEventListener("click", async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Logout failed. Please try again.");
    }
  });
}

export function bindImportButton(triggerButton, input) {
  if (!triggerButton || !input) return;
  triggerButton.addEventListener("click", () => input.click());
}

export function initPageChrome() {
  applyTheme();
  applyBoardAppearance();

  const navActions = document.querySelector(".nav-actions");
  const boardAppearanceBtn = ensureActionButton(navActions, "boardAppearanceBtn", boardAppearanceSummary());
  const globalSearchBtn = ensureActionButton(navActions, "globalSearchBtn", "Search");
  const syncBtn = document.getElementById("syncBtn");

  bindThemeToggle(document.getElementById("themeToggleBtn"));
  bindLogoutButton(document.getElementById("logoutBtn"));

  boardAppearanceBtn?.addEventListener("click", openBoardAppearanceDialog);
  globalSearchBtn?.addEventListener("click", openGlobalSearch);
  if (syncBtn) syncBtn.textContent = "Commit changes";

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openGlobalSearch();
      return;
    }

    if (event.key === "Escape") {
      document.getElementById("globalSearchDialog")?.classList.add("hidden");
      document.getElementById("boardAppearanceDialog")?.classList.add("hidden");
    }
  });
}
