import {
  boardFromFen,
  boardRowsFromGame,
  colorToMoveText,
  createChessGame,
  moveTextMatches,
  renderBoardSquares
} from "./board-tools.js";

export function $(id) {
  return document.getElementById(id);
}

export function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

export function setHtml(id, value) {
  const element = $(id);
  if (element) element.innerHTML = value;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]
  ));
}

export function formatActionError(error, fallback = "Unknown error.") {
  const parts = [
    error?.message,
    error?.details,
    error?.hint
  ].filter(Boolean).map(value => String(value).trim());

  return parts.join(" ") || fallback;
}

export function reportActionError(actionLabel, error, extra = "") {
  console.error(`${actionLabel} failed:`, error);
  const suffix = extra ? `\n\n${extra}` : "";
  alert(`${actionLabel} failed.\n\n${formatActionError(error)}${suffix}`);
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

export function showToast(message, kind = "success") {
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

export function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function tagsFromCommaText(text) {
  return String(text || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
}

export function tagsToCommaText(tags = []) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

export function movePrefix(annotation) {
  if (!annotation) return "";
  const number = annotation.move_number || Math.floor((annotation.ply + 1) / 2);
  const dots = annotation.ply % 2 === 1 ? "." : "...";
  return `${number}${dots}`;
}

export function annotationLabel(annotation) {
  if (!annotation) return "Start position";
  return `${movePrefix(annotation)} ${annotation.san}`.trim();
}

export function lineTextFromAnnotations(annotations = [], upToPly = annotations.length) {
  return annotations
    .slice(0, upToPly)
    .map(annotation => annotationLabel(annotation))
    .join(" ");
}

export function rootNodes(nodes = []) {
  return nodes.filter(node => !node.parent_id);
}

export function childNodes(nodes = [], parentId = null) {
  return nodes.filter(node => (node.parent_id || null) === (parentId || null));
}

export function findDeepestOpeningMatch(nodes = [], annotations = [], upToPly = annotations.length) {
  let parentId = null;
  let lastMatch = null;

  for (const annotation of annotations.slice(0, upToPly)) {
    const matches = childNodes(nodes, parentId).filter(node => moveTextMatches(annotation.san, node.move));
    if (!matches.length) break;

    lastMatch = matches.find(node => node.is_preferred) || matches[0];
    parentId = lastMatch.id;
  }

  return lastMatch;
}

function loadGameFromFen(fen) {
  const game = createChessGame("w");
  if (!game) return null;

  if (!fen) return game;

  try {
    const loaded = typeof game.load === "function" ? game.load(fen) : false;
    return loaded === false ? null : game;
  } catch {
    return null;
  }
}

export function boardViewFromFen(fen, lastMove = null) {
  const game = loadGameFromFen(fen);
  if (game) {
    return {
      rows: boardRowsFromGame(game),
      turnText: colorToMoveText(game.turn()),
      statusText: game.in_checkmate?.()
        ? "Checkmate on the board."
        : game.in_draw?.()
          ? "Drawn position."
          : game.in_check?.()
            ? `${game.turn() === "w" ? "White" : "Black"} is in check.`
            : "Position ready.",
      html: renderBoardSquares(boardRowsFromGame(game), lastMove)
    };
  }

  const placement = String(fen || "").trim().split(" ")[0] || undefined;
  const rows = boardFromFen(placement);
  return {
    rows,
    turnText: "Board ready",
    statusText: "Fallback board rendering is active.",
    html: renderBoardSquares(rows, lastMove)
  };
}

export function parsePgnBundle(pgnText) {
  const raw = String(pgnText || "").trim();
  if (!raw) {
    throw new Error("Paste or import a PGN first.");
  }

  if (typeof window.Chess !== "function") {
    throw new Error("chess.js is not available in this session.");
  }

  const parser = new window.Chess();
  let loaded = false;

  try {
    if (typeof parser.load_pgn === "function") {
      loaded = parser.load_pgn(raw, { sloppy: true });
    } else if (typeof parser.loadPgn === "function") {
      loaded = parser.loadPgn(raw, { sloppy: true });
    }
  } catch {
    loaded = false;
  }

  if (!loaded) {
    throw new Error("The PGN could not be parsed. Clean the move text or PGN headers and try again.");
  }

  const headers = parser.header?.() || {};
  const history = parser.history({ verbose: true }) || [];
  const replay = new window.Chess();

  const annotations = history.map((move, index) => {
    const fenBefore = replay.fen();
    replay.move(move.san, { sloppy: true });
    const fenAfter = replay.fen();

    return {
      id: crypto.randomUUID(),
      move_number: Math.floor(index / 2) + 1,
      ply: index + 1,
      san: move.san,
      from_square: move.from || "",
      to_square: move.to || "",
      fen_before: fenBefore,
      fen_after: fenAfter,
      human_comment_before: "",
      human_comment_after: "",
      candidate_moves: [],
      rejected_candidate_moves: [],
      expected_reply: "",
      actual_reply: "",
      evaluation_human: "",
      confidence_level: "",
      emotional_state: "",
      is_critical: false,
      critical_type: "",
      mistake_flag: false,
      lesson_flag: false
    };
  });

  return {
    headers,
    annotations,
    finalFen: replay.fen(),
    rawPgn: raw
  };
}

export function gameTitle(game) {
  if (!game) return "Untitled game";
  if (game.event) return game.event;

  const white = game.white_player || "White";
  const black = game.black_player || "Black";
  return `${white} vs ${black}`;
}

export function gameSubtitle(game) {
  if (!game) return "";

  const bits = [
    game.date,
    game.site,
    game.opening_name,
    game.result && game.result !== "*" ? game.result : ""
  ].filter(Boolean);

  return bits.join(" • ");
}

export function statusLabel(status) {
  const labels = {
    imported_only: "Imported only",
    quick_classified: "Quick classified",
    human_analysis_started: "Human analysis started",
    human_analysis_complete: "Human analysis complete",
    engine_checked_later: "Engine checked later",
    lessons_extracted: "Lessons extracted",
    repairs_created: "Repairs created"
  };

  return labels[status] || "Imported only";
}
