import { pieceAssetPath, pieceLabel } from "./board-appearance.js";

export const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const BOARD_RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
export const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

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

export function splitMoveParts(moveText) {
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

export function createChessGame(startingTurn = "w") {
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

export function boardFromFen(placement = STARTING_FEN) {
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

export function boardRowsFromGame(game) {
  if (typeof game?.board === "function") {
    return game.board().map(row => row.map(piece => (
      piece ? { color: piece.color, type: piece.type } : null
    )));
  }

  const [placement = STARTING_FEN] = String(game?.fen?.() || STARTING_FEN).split(" ");
  return boardFromFen(placement);
}

export function sanCandidates(moveText) {
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

export function moveTextMatches(answer, moveText) {
  const answers = new Set(sanCandidates(answer).map(value => value.toLowerCase()));
  return sanCandidates(moveText).some(value => answers.has(value.toLowerCase()));
}

export function tryApplyMove(game, moveText) {
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

export function pathMoveParts(path) {
  return path.flatMap(node =>
    splitMoveParts(node.move)
      .map(part => ({ node, part }))
      .filter(entry => entry.part.trim())
  );
}

export function playPathFromTurn(path, startingTurn = "w") {
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

export function bestBoardAttempt(path) {
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

export function colorToMoveText(turn) {
  return turn === "b" ? "Black to move" : "White to move";
}

function squareLabel(file, rank, piece) {
  if (!piece) return `${file}${rank} empty`;
  return `${file}${rank} ${pieceLabel(piece)}`;
}

export function renderBoardSquares(rows, lastMove) {
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
        ? `
          <span class="piece-wrap ${piece.color === "w" ? "white" : "black"}">
            <img
              class="piece-img"
              src="${pieceAssetPath(piece)}"
              alt="${pieceLabel(piece)}"
              loading="eager"
              decoding="sync"
              data-piece-color="${piece.color}"
              data-piece-type="${piece.type}"
              onerror="this.classList.add('is-broken')"
            />
            <span class="piece-fallback piece ${piece.color === "w" ? "white" : "black"}" aria-hidden="true">${PIECE_SYMBOLS[piece.color][piece.type]}</span>
          </span>`
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
