import { requireOnlyMe } from "./auth/only-me-guard.js";

await requireOnlyMe();

let nodes = [];
let selectedId = null;

const $ = id => document.getElementById(id);
const treeEl = $("tree");
const form = $("moveForm");
const liveBoardEl = $("liveBoard");
const liveBoardTitleEl = $("liveBoardTitle");
const liveBoardSubtitleEl = $("liveBoardSubtitle");
const liveBoardMetaEl = $("liveBoardMeta");
const liveMoveValueEl = $("liveMoveValue");
const liveMoveCaptionEl = $("liveMoveCaption");
const liveTurnValueEl = $("liveTurnValue");
const liveStatusValueEl = $("liveStatusValue");
const liveBoardLineEl = $("liveBoardLine");

const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const BOARD_RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const PIECE_SYMBOLS = {
  w: { p: "&#9817;", r: "&#9814;", n: "&#9816;", b: "&#9815;", q: "&#9813;", k: "&#9812;" },
  b: { p: "&#9823;", r: "&#9820;", n: "&#9822;", b: "&#9821;", q: "&#9819;", k: "&#9818;" }
};
const PIECE_NAMES = {
  p: "pawn",
  r: "rook",
  n: "knight",
  b: "bishop",
  q: "queen",
  k: "king"
};

const highlightLabels = {
  blunder: "Blunder",
  great: "Great move",
  brilliant: "Brilliant"
};

function children(parentId) {
  return nodes.filter(n => n.parent_id === parentId);
}

function childCount(nodeId) {
  return children(nodeId).length;
}

function nodeById(id) {
  return nodes.find(n => n.id === id) || null;
}

function currentNode() {
  return selectedId ? nodeById(selectedId) : null;
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
  return pathNodesFor(node).map(n => n.move).join("  ");
}

function visibleChoices() {
  return children(selectedId || null);
}

function highlightLabel(kind) {
  return highlightLabels[kind] || "";
}

function highlightBadgeHtml(kind) {
  const label = highlightLabel(kind);
  return label ? `<span class="mark-badge mark-${kind}">${label}</span>` : "";
}

function splitMoveParts(moveText) {
  const text = String(moveText || "").trim();
  if (!text) return [];

  const regex = /\b(\d+)\s*(\.\.\.|\.)\s*([^\s]+)/g;
  const matches = [...text.matchAll(regex)];

  if (matches.length <= 1) return [text];

  let leftover = text;
  for (const match of matches) {
    leftover = leftover.replace(match[0], " ");
  }

  if (leftover.trim()) return [text];

  return matches.map(match => `${match[1]}${match[2]} ${match[3]}`);
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

  function cloneForPart(original, part, id, parentId, partIndex) {
    return {
      ...original,
      id,
      parent_id: parentId,
      move: part,
      title: original.title || "",
      explanation: original.explanation || "",
      highlight_kind: original.highlight_kind || "",
      tags: [...(original.tags || [])],
      is_practice_card: original.is_practice_card !== false,
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
      const newNode = cloneForPart(node, part, id, currentParentId, partIndex);
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
    "This will split moves like '1... e5 2.Nf3' into separate child moves.\n\n" +
    "Please export a JSON backup first. Continue now?"
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

function createChessGame(startingTurn = "w") {
  if (typeof window.Chess !== "function") return null;

  try {
    const game = new window.Chess();

    if (startingTurn === "b" && typeof game.load === "function") {
      game.load(`${STARTING_FEN} b KQkq - 0 1`);
    }
    return game;
  } catch {
    try {
      if (startingTurn === "b") {
        return new window.Chess(`${STARTING_FEN} b KQkq - 0 1`);
      }
      return new window.Chess();
    } catch {
      return null;
    }
  }
}

function boardFromFen(placement = STARTING_FEN) {
  return String(placement)
    .split("/")
    .map(rankText => {
      const row = [];

      for (const char of rankText) {
        const emptyCount = Number(char);
        if (Number.isInteger(emptyCount) && emptyCount > 0) {
          for (let i = 0; i < emptyCount; i += 1) row.push(null);
          continue;
        }

        row.push({
          color: char === char.toUpperCase() ? "w" : "b",
          type: char.toLowerCase()
        });
      }

      return row;
    });
}

function boardRowsFromGame(game) {
  if (typeof game?.board === "function") {
    return game.board().map(row => row.map(piece => (
      piece ? { color: piece.color, type: piece.type } : null
    )));
  }

  const [placement = STARTING_FEN] = String(game?.fen?.() || STARTING_FEN).split(" ");
  return boardFromFen(placement);
}

function sanCandidates(moveText) {
  const clean = String(moveText || "")
    .trim()
    .replace(/^\d+\.(?:\.\.)?\s*/, "")
    .replace(/^\.\.\.\s*/, "")
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/e\.p\.?/gi, "")
    .replace(/[!?]+/g, "")
    .trim();

  const compact = clean.replace(/\s+/g, "");
  const noSuffix = compact.replace(/[+#]+$/, "");

  return [...new Set([clean, compact, noSuffix].filter(Boolean))];
}

function tryApplyMove(game, moveText) {
  for (const san of sanCandidates(moveText)) {
    try {
      const moved = game.move(san, { sloppy: true });
      if (moved) return moved;
    } catch {}

    try {
      const moved = game.move(san);
      if (moved) return moved;
    } catch {}
  }

  return null;
}

function pathMoveParts(path) {
  return path.flatMap(node =>
    splitMoveParts(node.move)
      .map(part => ({ node, part }))
      .filter(entry => entry.part.trim())
  );
}

function playPathFromTurn(path, startingTurn = "w") {
  const game = createChessGame(startingTurn);
  if (!game) return null;

  const history = [];
  let lastMove = null;
  let failedMove = "";

  for (const entry of pathMoveParts(path)) {
    const moved = tryApplyMove(game, entry.part);
    if (!moved) {
      failedMove = entry.part;
      break;
    }

    history.push(moved);
    lastMove = moved;
  }

  return { game, history, lastMove, failedMove, startingTurn };
}

function bestBoardAttempt(path) {
  if (!path.length) {
    return playPathFromTurn([], "w");
  }

  const preferredTurns = /\.\.\./.test(String(path[0]?.move || "")) ? ["b", "w"] : ["w", "b"];
  const totalParts = pathMoveParts(path).length;
  let best = null;

  for (const turn of preferredTurns) {
    const attempt = playPathFromTurn(path, turn);
    if (!attempt) continue;

    const isComplete = !attempt.failedMove && attempt.history.length === totalParts;
    if (isComplete) return attempt;

    if (!best || attempt.history.length > best.history.length) {
      best = attempt;
    }
  }

  return best;
}

function colorToMoveText(turn) {
  return turn === "b" ? "Black to move" : "White to move";
}

function squareLabel(file, rank, piece) {
  if (!piece) return `${file}${rank} empty`;
  const color = piece.color === "w" ? "White" : "Black";
  return `${file}${rank} ${color} ${PIECE_NAMES[piece.type] || "piece"}`;
}

function renderBoardSquares(rows, lastMove) {
  const lastFrom = lastMove?.from || "";
  const lastTo = lastMove?.to || "";

  return rows.map((row, rowIndex) => (
    row.map((piece, colIndex) => {
      const file = BOARD_FILES[colIndex];
      const rank = BOARD_RANKS[rowIndex];
      const square = `${file}${rank}`;
      const classes = [
        "board-square",
        (rowIndex + colIndex) % 2 === 0 ? "light" : "dark",
        colIndex === 0 ? "show-rank" : "",
        rowIndex === BOARD_RANKS.length - 1 ? "show-file" : "",
        square === lastFrom ? "last-from" : "",
        square === lastTo ? "last-to" : ""
      ].filter(Boolean).join(" ");

      const pieceHtml = piece
        ? `<span class="piece ${piece.color === "w" ? "white" : "black"}">${PIECE_SYMBOLS[piece.color][piece.type]}</span>`
        : "";

      return `
        <div
          class="${classes}"
          data-file="${rowIndex === BOARD_RANKS.length - 1 ? file : ""}"
          data-rank="${colIndex === 0 ? rank : ""}"
          aria-label="${squareLabel(file, rank, piece)}"
        >
          ${pieceHtml}
        </div>`;
    }).join("")
  )).join("");
}

function renderBoardLine(path) {
  if (!path.length) {
    return `<div class="line-empty">No move selected yet. The board is ready at the start position.</div>`;
  }

  return path.map(node => {
    const active = node.id === selectedId ? "active" : "";
    return `
      <span class="line-chip ${active}">
        <span>${escapeHtml(node.move)}</span>
        ${highlightBadgeHtml(node.highlight_kind || "")}
      </span>`;
  }).join("");
}

function paintLiveBoard() {
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

  let subtitleValue = "The board follows the move you select in Line Explorer.";
  if (!boardReady) {
    subtitleValue = "The board frame is ready, but the chess move parser did not load in this browser session.";
  } else if (current?.title) {
    subtitleValue = current.title;
  } else if (attempt?.failedMove) {
    subtitleValue = `The board synced until ${attempt.failedMove}, then stopped because that move could not be read as SAN.`;
  } else if (path.length) {
    subtitleValue = `Synced to your current line after ${historyLength} half-move${historyLength === 1 ? "" : "s"}.`;
  }

  let statusValue = "Starting position.";
  if (!boardReady) {
    statusValue = "Showing the starting board until the chess library is available.";
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
  liveMoveCaptionEl.textContent = current ? (current.title || pathFor(current)) : "Choose any move in the explorer to jump the position here.";
  liveTurnValueEl.textContent = turnValue;
  liveStatusValueEl.textContent = statusValue;
  liveBoardLineEl.innerHTML = renderBoardLine(path);
  liveBoardEl.innerHTML = renderBoardSquares(rows, attempt?.lastMove || null);
}

function renderStats() {
  $("nodeCount").textContent = nodes.length;
  $("cardCount").textContent = nodes.filter(n => n.is_practice_card).length;
  $("lineCount").textContent = nodes.filter(n => !n.parent_id).length;
}

function renderBreadcrumb(path) {
  if (!path.length) {
    return `<div class="line-empty">Choose a root move to start exploring your repertoire.</div>`;
  }

  return path.map((node, index) => {
    const active = node.id === selectedId ? "active" : "";
    return `
      <button class="line-chip ${active}" data-id="${node.id}" title="Jump back to this move">
        <span>${escapeHtml(node.move)}</span>
        ${highlightBadgeHtml(node.highlight_kind || "")}
      </button>`;
  }).join("");
}

function renderChoices() {
  const current = currentNode();
  const choices = visibleChoices();
  const heading = current ? "Next moves from this position" : "Root moves";

  const rows = choices.map((node, index) => {
    const tags = (node.tags || [])
      .slice(0, 3)
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const count = childCount(node.id);
    const highlight = node.highlight_kind || "";
    const highlightClass = highlight ? ` highlight-${highlight}` : "";
    const altClass = index % 2 === 0 ? "choice-a" : "choice-b";

    return `
      <button class="choice-card ${altClass}${highlightClass}" data-id="${node.id}">
        <span class="choice-index">${index + 1}</span>
        <span class="choice-main">
          <span class="choice-topline">
            <strong class="move-san">${escapeHtml(node.move)}</strong>
            ${count ? `<span class="child-count">${count}</span>` : ""}
            ${highlightBadgeHtml(highlight)}
          </span>
          <span class="node-title">${escapeHtml(node.title || "No title yet")}</span>
          ${tags ? `<span class="node-tags">${tags}</span>` : ""}
        </span>
      </button>`;
  }).join("");

  return `
    <section class="line-view">
      <div class="line-block">
        <div class="line-label">Current line</div>
        <div class="line-strip">${renderBreadcrumb(current ? pathNodesFor(current) : [])}</div>
      </div>

      <div class="line-tools">
        <button id="backLineBtn" class="tiny secondary" ${current ? "" : "disabled"}>← Back one move</button>
        <button id="rootLineBtn" class="tiny secondary" ${current ? "" : "disabled"}>Root view</button>
      </div>

      <div class="choice-heading">
        <h4>${heading}</h4>
        <span>${choices.length} option${choices.length === 1 ? "" : "s"}</span>
      </div>

      <div class="choice-list">
        ${rows || `<p class="muted">No child moves here yet. Add a child move from the editor.</p>`}
      </div>
    </section>`;
}

function paint() {
  treeEl.innerHTML = renderChoices();
  renderStats();
  paintLiveBoard();
}

function selectNode(id, shouldPaint = true) {
  selectedId = id;
  const node = nodeById(id);
  $("editorTitle").textContent = node ? `Editing ${node.move}` : "Select a move";
  $("deleteBtn").disabled = !node;
  $("addChildBtn").disabled = !node;
  $("moveInput").value = node?.move || "";
  $("titleInput").value = node?.title || "";
  $("highlightInput").value = node?.highlight_kind || "";
  $("explanationInput").value = node?.explanation || "";
  $("tagsInput").value = (node?.tags || []).join(", ");
  $("practiceInput").checked = node?.is_practice_card !== false;
  if (shouldPaint) paint();
}

function resetEditorForNewRoot() {
  selectedId = null;
  $("editorTitle").textContent = "New root move";
  $("moveInput").value = "";
  $("titleInput").value = "";
  $("highlightInput").value = "";
  $("explanationInput").value = "";
  $("tagsInput").value = "";
  $("practiceInput").checked = true;
  $("deleteBtn").disabled = true;
  $("addChildBtn").disabled = true;
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
    tags: $("tagsInput").value.split(",").map(t => t.trim()).filter(Boolean),
    is_practice_card: $("practiceInput").checked,
    created_at: nodes.find(n => n.id === existingId)?.created_at || new Date().toISOString()
  };
}

async function refresh() {
  nodes = await OpeningDB.loadNodes();
  if (selectedId && !nodes.some(n => n.id === selectedId)) selectedId = null;
  paint();
  if (selectedId) selectNode(selectedId, false);
}

function showRandomCard() {
  const cards = nodes.filter(n => n.is_practice_card);
  const box = $("practiceCard");
  if (!cards.length) {
    box.className = "practice-card empty";
    box.innerHTML = "<p>No practice cards yet. Tick 'Use as random practice card' on some moves.</p>";
    return;
  }
  const node = cards[Math.floor(Math.random() * cards.length)];
  box.className = `practice-card ${node.highlight_kind ? `card-${node.highlight_kind}` : ""}`.trim();
  box.innerHTML = cardHtml(node, true);
}

function cardHtml(node, withExplanation = true) {
  const tags = (node.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
  const highlight = node.highlight_kind || "";
  return `
    <div class="card-move-line">
      <div class="card-move">${escapeHtml(node.move)}</div>
      ${highlightBadgeHtml(highlight)}
    </div>
    <div class="card-title">${escapeHtml(node.title || "Untitled move")}</div>
    <div class="card-path">${escapeHtml(pathFor(node))}</div>
    <div class="card-tags">${tags}</div>
    ${withExplanation ? `<div class="card-explanation">${escapeHtml(node.explanation || "No explanation yet. Future you is waiting, pen in hand.")}</div>` : ""}
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const existing = nodeById(selectedId);
  const node = getFormNode(existing?.parent_id || null, selectedId || null);
  await OpeningDB.upsertNode(node);
  selectedId = node.id;
  await refresh();
});

treeEl.addEventListener("click", e => {
  const chip = e.target.closest(".line-chip");
  if (chip) {
    selectNode(chip.dataset.id);
    return;
  }

  const choice = e.target.closest(".choice-card");
  if (choice) {
    selectNode(choice.dataset.id);
    return;
  }

  if (e.target.closest("#backLineBtn")) {
    const current = currentNode();
    selectedId = current?.parent_id || null;
    if (selectedId) selectNode(selectedId);
    else {
      $("editorTitle").textContent = "Select a move";
      $("deleteBtn").disabled = true;
      $("addChildBtn").disabled = true;
      paint();
    }
    return;
  }

  if (e.target.closest("#rootLineBtn")) {
    selectedId = null;
    $("editorTitle").textContent = "Select a move";
    $("deleteBtn").disabled = true;
    $("addChildBtn").disabled = true;
    paint();
  }
});

$("newRootBtn").addEventListener("click", resetEditorForNewRoot);

$("addChildBtn").addEventListener("click", async () => {
  if (!selectedId) return;

  const parentId = selectedId;
  const child = {
    id: crypto.randomUUID(),
    parent_id: parentId,
    move: "New move",
    title: "",
    highlight_kind: "",
    explanation: "",
    tags: [],
    is_practice_card: true,
    created_at: new Date().toISOString()
  };

  await OpeningDB.upsertNode(child);
  selectedId = child.id;
  await refresh();
});

$("deleteBtn").addEventListener("click", async () => {
  if (!selectedId || !confirm("Delete this move and all child lines?")) return;
  const deleted = selectedId;
  const deletedNode = nodeById(deleted);
  selectedId = deletedNode?.parent_id || null;
  await OpeningDB.deleteNodeAndChildren(deleted);
  await refresh();
});

$("randomBtn").addEventListener("click", showRandomCard);
$("syncBtn").addEventListener("click", refresh);

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(nodes, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gm-opening-tree.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("splitCompoundBtn")?.addEventListener("click", splitCompoundMovesOnce);

$("importInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text).map(OpeningDB.normalizeNode);
  await OpeningDB.saveAllNodes(imported);
  selectedId = null;
  await refresh();
});

refresh();
