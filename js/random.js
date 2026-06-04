import { requireOnlyMe } from "./auth/only-me-guard.js";
import {
  bestBoardAttempt,
  boardFromFen,
  boardRowsFromGame,
  colorToMoveText,
  createChessGame,
  renderBoardSquares
} from "./board-tools.js";
import { initPageChrome } from "./ui-shell.js";

await requireOnlyMe();
initPageChrome();

let nodes = [];
let repairs = [];
let current = null;
let revealed = false;

const $ = id => document.getElementById(id);

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

function highlightBadgeHtml(kind) {
  const label = highlightLabels[kind] || "";
  return label ? `<span class="mark-badge mark-${kind}">${label}</span>` : "";
}

function preferredBadgeHtml(node) {
  return node?.is_preferred ? `<span class="mark-badge mark-preferred">Preferred</span>` : "";
}

function nodeById(id) {
  return nodes.find(node => node.id === id) || null;
}

function pathNodesFor(node) {
  const path = [];
  let currentNode = node;

  while (currentNode) {
    path.unshift(currentNode);
    currentNode = nodeById(currentNode.parent_id);
  }

  return path;
}

function pathFor(node) {
  return pathNodesFor(node).map(entry => entry.move).join("  ");
}

function linkedRepairs(node) {
  return repairs.filter(repair => repair.related_node_id === node.id && repair.status === "needs_work");
}

function cardHtml(node) {
  const tags = (node.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const openRepairs = linkedRepairs(node);

  return `
    <div class="card-move-line">
      <div class="card-move">${escapeHtml(node.move)}</div>
      ${preferredBadgeHtml(node)}
      ${highlightBadgeHtml(node.highlight_kind || "")}
    </div>
    <div class="card-title">${escapeHtml(node.title || "Untitled move")}</div>
    <div class="card-path">${escapeHtml(pathFor(node))}</div>
    ${tags ? `<div class="card-tags">${tags}</div>` : ""}
    <div class="card-explanation">${escapeHtml(node.explanation || "No explanation yet. Add one from the main tree.")}</div>
    ${openRepairs.length ? `
      <div class="linked-repair-callout">
        <strong>Open repair</strong>
        <p>${escapeHtml(openRepairs[0].lesson || openRepairs[0].mistake || openRepairs[0].repair)}</p>
      </div>` : ""}
  `;
}

function lineChipHtml(node) {
  return `
    <span class="line-chip">
      <span>${escapeHtml(node.move)}</span>
      ${preferredBadgeHtml(node)}
      ${highlightBadgeHtml(node.highlight_kind || "")}
    </span>`;
}

function weightedPick(cards) {
  const weighted = cards.map(node => ({
    node,
    weight: 1 + (node.is_preferred ? 3 : 0) + linkedRepairs(node).length * 3
  }));

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.node;
  }

  return weighted[weighted.length - 1].node;
}

function renderBoard(node) {
  const path = pathNodesFor(node);
  const attempt = bestBoardAttempt(path);
  const game = attempt?.game || createChessGame("w");
  const boardReady = Boolean(game);
  const rows = game ? boardRowsFromGame(game) : boardFromFen();

  $("randomBoard").innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);
  $("randomBoardMeta").textContent = boardReady ? colorToMoveText(game.turn()) : "Board waiting for chess.js";
  $("randomLine").innerHTML = path.length
    ? path.map(lineChipHtml).join("")
    : `<div class="line-empty">The line starts from the initial position.</div>`;
}

function drawCard() {
  const cards = nodes.filter(node => node.exclude_from_training !== true);
  const box = $("randomCard");

  if (!cards.length) {
    $("randomTitle").textContent = "Pocket repertoire card";
    $("randomStatus").textContent = "No trainer cards yet. Mark a few moves for training on the main page.";
    $("randomLine").innerHTML = `<div class="line-empty">No trainer lines available yet.</div>`;
    $("randomBoard").innerHTML = renderBoardSquares(boardFromFen(), null);
    $("randomBoardMeta").textContent = "White to move";
    box.className = "study-card empty";
    box.innerHTML = "<p>No trainer cards yet. Go back to the move editor and leave some moves available for training.</p>";
    return;
  }

  current = weightedPick(cards);
  revealed = false;

  $("randomTitle").textContent = `Review ${current.move}`;
  $("randomStatus").textContent = linkedRepairs(current).length
    ? "This move also has an open repair loop attached. Review the lesson after you reveal the explanation."
    : "Preferred moves are weighted more heavily so your main repertoire shows up more often.";
  renderBoard(current);

  box.className = `study-card hidden ${current.highlight_kind ? `card-${current.highlight_kind}` : ""}`.trim();
  box.innerHTML = cardHtml(current);
  $("revealBtn").textContent = "Reveal explanation";
}

$("revealBtn").addEventListener("click", () => {
  if (!current) return;

  revealed = !revealed;
  const highlightClass = current.highlight_kind ? ` card-${current.highlight_kind}` : "";
  $("randomCard").className = revealed ? `study-card${highlightClass}` : `study-card hidden${highlightClass}`;
  $("revealBtn").textContent = revealed ? "Hide explanation" : "Reveal explanation";
});

$("anotherBtn").addEventListener("click", drawCard);

async function initRandomPage() {
  if (!window.OpeningDB) {
    console.error("OpeningDB is not defined. Make sure random.html loads js/db.js before js/random.js.");
    $("randomCard").innerHTML = "<p>Database did not load. Check the db.js script order.</p>";
    return;
  }

  try {
    [nodes, repairs] = await Promise.all([
      window.OpeningDB.loadNodes(),
      window.OpeningDB.loadRepairItems()
    ]);
    drawCard();
  } catch (error) {
    console.error("Could not load random cards:", error);
    $("randomCard").innerHTML = "<p>Could not load cards from Supabase.</p>";
  }
}

initRandomPage();
