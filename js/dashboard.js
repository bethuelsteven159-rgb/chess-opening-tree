import { requireOnlyMe } from "./auth/only-me-guard.js";
import { initPageChrome } from "./ui-shell.js";
import { buildLeafLines, reviewDueState } from "./review-utils.js";
import { supportCommandItems } from "./support-utils.js";
import { checklistForGame, checklistProgress, gameNeedsWork } from "./game-analysis-utils.js";
import {
  clearTrainingIntent,
  getSelectedNodeId,
  setSelectedGameId,
  setSelectedGamePly,
  setSelectedNodeId,
  setSelectedPositionId,
  setSelectedRepairId,
  setTrainingIntent
} from "./navigation-state.js";
import { $, escapeHtml, reportActionError, setHtml, setText, showToast } from "./chess-brain-utils.js";

await requireOnlyMe();
initPageChrome();

if (!window.OpeningDB) {
  throw new Error("OpeningDB is not available. Make sure js/db.js loads before js/dashboard.js.");
}

let nodes = [];
let repairs = [];
let games = [];
let annotations = [];
let positions = [];
let mistakes = [];
let supportCards = [];
let goals = [];
let reminders = [];
let books = [];
let bookNotes = [];
let tournamentNotes = [];
let quickIdeas = [];
let reviewItems = [];

function nodeById(id) {
  return nodes.find(node => node.id === id) || null;
}

function currentNode() {
  const selectedId = getSelectedNodeId();
  return selectedId ? nodeById(selectedId) : null;
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

function lineChipHtml(node) {
  return `
    <span class="line-chip active">
      <span>${escapeHtml(node.move)}</span>
    </span>
  `;
}

function gameTitle(game) {
  if (game.event) return game.event;
  return `${game.white_player || "White"} vs ${game.black_player || "Black"}`;
}

function renderStats() {
  const rootLines = nodes.filter(node => !node.parent_id).length;
  const leafLines = buildLeafLines(nodes, reviewItems);
  const openRepairs = repairs.filter(repair => repair.status !== "solved").length;
  const activeGoals = goals.filter(goal => goal.status === "active").length;
  const dueReminders = reminders.filter(reminder => reminder.status === "active" && reminder.due_date).length;
  const currentBooks = books.filter(book => book.status === "currently_reading").length;
  const pinnedCards = supportCards.filter(card => card.status === "active" && card.pinned).length;
  const criticalGoals = goals.filter(goal => goal.status === "active" && goal.priority === "critical").length;

  setText("nodeCount", String(nodes.length));
  setText("lineCount", String(rootLines));
  setText("gameCount", String(games.length));
  setText("positionCount", String(positions.length));
  setText("mistakeCount", String(mistakes.length));
  setText("repairCount", String(openRepairs));
  setText("dashboardEditorCount", `${nodes.length} moves`);
  setText("dashboardGamesCount", `${games.length} games`);
  setText("dashboardPositionCount", `${positions.length} positions`);
  setText("dashboardTrainerCount", `${leafLines.length} lines`);
  setText("dashboardRepairCount", `${openRepairs} open`);
  setText("dashboardSupportCount", `${activeGoals} goals • ${dueReminders} due`);
  setText("dashboardDueReminderCount", `${dueReminders} due reminder${dueReminders === 1 ? "" : "s"}`);
  setText("dashboardCurrentBooksCount", `${currentBooks} current book${currentBooks === 1 ? "" : "s"}`);
  setText("dashboardActiveGoalsCount", `${activeGoals} active goal${activeGoals === 1 ? "" : "s"}`);
  setText("dashboardPinnedCardsCount", `${pinnedCards} pinned card${pinnedCards === 1 ? "" : "s"}`);
  setText("dashboardSupportCriticalGoals", `${criticalGoals} critical goal${criticalGoals === 1 ? "" : "s"}`);
}

function renderCurrentFocus() {
  const node = currentNode();
  const titleEl = $("dashboardFocusTitle");
  if (!titleEl) return;

  if (!node) {
    titleEl.textContent = "No move selected yet";
    setText("dashboardFocusSubtitle", "Open the move editor, pick a line, and the selected focus will travel with you across pages.");
    setHtml("dashboardCurrentLine", `<div class="line-empty">Selection is empty. The workspace is ready when you want to anchor it to a line.</div>`);
    return;
  }

  const path = pathNodesFor(node);
  titleEl.textContent = node.title || `Focused on ${node.move}`;
  setText("dashboardFocusSubtitle", `Current selection: ${node.move}. Missions, repair work, and the editor can all jump back here.`);
  setHtml("dashboardCurrentLine", path.map(lineChipHtml).join(""));
}

function renderHeatmap() {
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

  setHtml("dashboardHeatmap", rows || `<div class="line-empty">No mistake records yet. Once games start feeding the mistake database, repeated patterns will pile up here.</div>`);
}

function renderGameQueue() {
  const queued = games
    .filter(game => gameNeedsWork(game, annotations))
    .slice()
    .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))
    .slice(0, 6);

  setHtml("dashboardGameQueue", queued.map(game => {
    const progress = checklistProgress(checklistForGame(game, annotations));
    return `
      <button class="queue-card" data-dashboard-action="open-game" data-game-id="${game.id}" type="button">
        <span class="study-choice-kicker">${progress.remaining} step${progress.remaining === 1 ? "" : "s"} left</span>
        <strong>${escapeHtml(gameTitle(game))}</strong>
        <p>${escapeHtml([game.opening_name, game.result].filter(Boolean).join(" • ") || "No opening label yet")}</p>
        <div class="study-choice-meta">
          <strong>${progress.done}/${progress.total} done</strong>
          <span>${escapeHtml(game.analysis_complete ? "Marked complete" : "Needs analysis closure")}</span>
        </div>
      </button>
    `;
  }).join("") || `<div class="line-empty">No games in the queue yet. Import a PGN in Game Analysis Studio and the dashboard will surface unfinished work here.</div>`);
}

function renderSupportSummary() {
  const items = supportCommandItems({
    supportCards,
    goals,
    reminders,
    books
  }).slice(0, 6);

  setHtml("dashboardSupportSummary", items.length
    ? items.map(item => `
        <article class="heatmap-row support-summary-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p class="muted">${escapeHtml(item.meta || "Visible in the Support Hub")}</p>
          </div>
          <span class="mini-tag">${escapeHtml(item.kind.replace(/_/g, " "))}</span>
        </article>
      `).join("")
    : `<div class="line-empty">No support items yet. Add goals, reminders, books, or cards in the Support Hub.</div>`);
}

function bestRepairMission() {
  const dueReview = reviewItems
    .filter(item => item.source_type === "repair" && item.status === "active" && reviewDueState(item) === "due")
    .sort((left, right) => String(left.due_at || "").localeCompare(String(right.due_at || "")))[0];
  const repair = repairs.find(entry => entry.id === dueReview?.source_id)
    || repairs
      .filter(entry => entry.review_enabled !== false && entry.status !== "solved")
      .sort((left, right) => {
        const priorityOrder = { critical: 3, high: 2, normal: 1, low: 0 };
        return (priorityOrder[right.severity] || 0) - (priorityOrder[left.severity] || 0);
      })[0];
  if (!repair) return null;

  return {
    type: "repair",
    id: repair.id,
    kicker: dueReview ? "Repair due" : "Repair waiting",
    title: repair.mistake || "Repair card",
    reason: dueReview
      ? `Due review${repair.status === "reopened" ? " • reopened leak" : ""}`
      : `${repair.status === "captured" ? "Captured" : "Open"} repair that still needs closure`,
    actionLabel: "Open repair"
  };
}

function bestPositionMission() {
  const dueReview = reviewItems
    .filter(item => item.source_type === "position" && item.status === "active" && reviewDueState(item) === "due")
    .sort((left, right) => String(left.due_at || "").localeCompare(String(right.due_at || "")))[0];
  const position = positions.find(entry => entry.id === dueReview?.source_id)
    || positions.find(entry => entry.review_enabled !== false);
  if (!position) return null;

  return {
    type: "position",
    id: position.id,
    kicker: dueReview ? "Position due" : "Position new",
    title: position.title || "Untitled position",
    reason: dueReview
      ? `Review due • ${position.position_type || "position"}`
      : `Unreviewed ${position.position_type || "position"} worth turning into muscle memory`,
    actionLabel: "Train position"
  };
}

function bestOpeningMission() {
  const lines = buildLeafLines(nodes, reviewItems)
    .filter(line => line.prompts.length);
  const dueLine = lines.find(line => line.due_state === "due");
  const newLine = lines.find(line => line.due_state === "new");
  const line = dueLine || newLine || lines[0];
  if (!line) return null;

  return {
    type: "opening_line",
    id: line.leaf_node_id,
    kicker: dueLine ? "Opening due" : "Opening line",
    title: line.title,
    reason: dueLine
      ? `Leaf line due • ${line.ply_count} ply`
      : `Train the full line from root to leaf • ${line.ply_count} ply`,
    actionLabel: "Train line"
  };
}

function bestGameMission() {
  const pendingGame = games
    .filter(game => gameNeedsWork(game, annotations))
    .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))[0];
  if (!pendingGame) return null;

  const progress = checklistProgress(checklistForGame(pendingGame, annotations));
  return {
    type: "game",
    id: pendingGame.id,
    kicker: "Game loop",
    title: gameTitle(pendingGame),
    reason: `${progress.remaining} checklist step${progress.remaining === 1 ? "" : "s"} still open`,
    actionLabel: "Open game"
  };
}

function bestSupportMission() {
  const supportItem = supportCommandItems({
    supportCards,
    goals,
    reminders,
    books
  })[0];

  if (supportItem) {
    return {
      type: supportItem.kind,
      id: supportItem.id,
      kicker: "Support",
      title: supportItem.title,
      reason: supportItem.meta || "Visible support work",
      actionLabel: "Open support"
    };
  }

  const eventNote = tournamentNotes
    .filter(note => ["planned", "active"].includes(note.status))
    .sort((left, right) => String(left.event_date || "").localeCompare(String(right.event_date || "")))[0];

  if (!eventNote) return null;
  return {
    type: "tournament_note",
    id: eventNote.id,
    kicker: "Support",
    title: eventNote.event_name || "Event note",
    reason: eventNote.event_date || "Tournament prep is active",
    actionLabel: "Open support"
  };
}

function renderMissions() {
  const missions = [
    bestRepairMission(),
    bestPositionMission(),
    bestOpeningMission(),
    bestGameMission(),
    bestSupportMission()
  ].filter(Boolean);

  setText("dashboardMissionCount", `${missions.length} action${missions.length === 1 ? "" : "s"} ready`);

  setHtml("todayMissionList", missions.length
    ? missions.map(mission => `
        <article class="study-choice-card mission-card">
          <span class="study-choice-kicker">${escapeHtml(mission.kicker)}</span>
          <h4>${escapeHtml(mission.title)}</h4>
          <p>${escapeHtml(mission.reason)}</p>
          <div class="study-choice-meta">
            <strong>${escapeHtml(mission.actionLabel)}</strong>
            <button class="button button-primary button-tiny" type="button" data-mission-type="${mission.type}" data-mission-id="${mission.id}">Start</button>
          </div>
        </article>
      `).join("")
    : `
      <div class="support-empty-state">
        <div>
          <strong>No mission items yet.</strong>
          <p>Create one opening line, one game, or one manual position and the dashboard will start recommending the next action.</p>
        </div>
      </div>
    `);
}

function openSupportByResult(type, id) {
  localStorage.setItem("gm_support_focus_v1", JSON.stringify({
    pane: {
      support_card: "cards",
      card: "cards",
      goal: "goals",
      reminder: "reminders",
      book: "books",
      book_note: "books",
      tournament_note: "tournaments"
    }[type] || "quick",
    type,
    id
  }));
  window.location.href = "./support.html";
}

function paint() {
  renderStats();
  renderCurrentFocus();
  renderHeatmap();
  renderGameQueue();
  renderSupportSummary();
  renderMissions();
}

async function refresh() {
  [
    nodes,
    repairs,
    games,
    annotations,
    positions,
    mistakes,
    supportCards,
    goals,
    reminders,
    books,
    bookNotes,
    tournamentNotes,
    quickIdeas,
    reviewItems
  ] = await Promise.all([
    window.OpeningDB.loadNodes(),
    window.OpeningDB.loadRepairItems(),
    window.OpeningDB.loadGames(),
    window.OpeningDB.loadGameAnnotations(),
    window.OpeningDB.loadPositions(),
    window.OpeningDB.loadMistakes(),
    window.OpeningDB.loadSupportCards(),
    window.OpeningDB.loadGoals(),
    window.OpeningDB.loadAppReminders(),
    window.OpeningDB.loadBooks(),
    window.OpeningDB.loadBookNotes(),
    window.OpeningDB.loadTournamentNotes(),
    window.OpeningDB.loadQuickIdeas(),
    window.OpeningDB.loadReviewItems ? window.OpeningDB.loadReviewItems() : Promise.resolve([])
  ]);

  paint();
}

$("dashboardGameQueue")?.addEventListener("click", event => {
  const button = event.target.closest("[data-game-id]");
  if (!button) return;
  setSelectedGameId(button.dataset.gameId);
  setSelectedGamePly(0);
  window.location.href = "./games.html";
});

$("todayMissionList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-mission-type]");
  if (!button) return;

  const type = button.dataset.missionType;
  const id = button.dataset.missionId;

  if (type === "repair") {
    setSelectedRepairId(id);
    setTrainingIntent({ mode: "repairs", source_type: "repair", source_id: id });
    window.location.href = "./training.html";
    return;
  }

  if (type === "position") {
    setSelectedPositionId(id);
    setTrainingIntent({ mode: "positions", source_type: "position", source_id: id });
    window.location.href = "./training.html";
    return;
  }

  if (type === "opening_line") {
    clearTrainingIntent();
    setTrainingIntent({ mode: "opening_lines", source_type: "opening_line", source_id: id });
    window.location.href = "./training.html";
    return;
  }

  if (type === "game") {
    setSelectedGameId(id);
    setSelectedGamePly(0);
    window.location.href = "./games.html";
    return;
  }

  openSupportByResult(type, id);
});

$("syncBtn")?.addEventListener("click", async () => {
  try {
    await window.OpeningDB.commitAllChanges?.();
    await refresh();
    showToast(navigator.onLine ? "Changes committed." : "Offline mode active. Your local dashboard data is preserved.");
  } catch (error) {
    reportActionError("Committing dashboard changes", error);
  }
});

try {
  await refresh();
} catch (error) {
  reportActionError("Loading dashboard", error, "Run the updated supabase/schema.sql if the final review tables are not available in Supabase yet.");
}
