export const PIECE_STYLE_STORAGE_KEY = "gm_opening_tree_piece_style_v1";
export const BOARD_CONTRAST_STORAGE_KEY = "gm_opening_tree_board_contrast_v1";

export const PIECE_STYLE_VALUES = ["classic", "high-contrast"];
export const BOARD_CONTRAST_VALUES = ["normal", "high-clarity"];

const PIECE_CODE_MAP = {
  k: "K",
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
  p: "P"
};

const PIECE_NAME_MAP = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn"
};

export function resolvePieceStyle(value) {
  return PIECE_STYLE_VALUES.includes(value) ? value : "classic";
}

export function resolveBoardContrast(value) {
  return BOARD_CONTRAST_VALUES.includes(value) ? value : "normal";
}

export function getStoredBoardAppearance() {
  return {
    pieceStyle: resolvePieceStyle(localStorage.getItem(PIECE_STYLE_STORAGE_KEY)),
    boardContrast: resolveBoardContrast(localStorage.getItem(BOARD_CONTRAST_STORAGE_KEY))
  };
}

export function applyBoardAppearance(settings = getStoredBoardAppearance()) {
  const pieceStyle = resolvePieceStyle(settings.pieceStyle);
  const boardContrast = resolveBoardContrast(settings.boardContrast);

  document.documentElement.dataset.pieceStyle = pieceStyle;
  document.documentElement.dataset.boardContrast = boardContrast;
  document.body?.setAttribute("data-piece-style", pieceStyle);
  document.body?.setAttribute("data-board-contrast", boardContrast);

  localStorage.setItem(PIECE_STYLE_STORAGE_KEY, pieceStyle);
  localStorage.setItem(BOARD_CONTRAST_STORAGE_KEY, boardContrast);

  return { pieceStyle, boardContrast };
}

export function boardAppearanceSummary(settings = getStoredBoardAppearance()) {
  const resolved = applyBoardAppearance(settings);
  const pieceLabel = resolved.pieceStyle === "high-contrast" ? "High contrast" : "Classic";
  const boardLabel = resolved.boardContrast === "high-clarity" ? "High clarity" : "Normal";
  return `${pieceLabel} pieces • ${boardLabel} board`;
}

export function pieceAssetPath(piece, style = getStoredBoardAppearance().pieceStyle) {
  if (!piece?.color || !piece?.type) return "";
  const color = piece.color === "b" ? "b" : "w";
  const typeCode = PIECE_CODE_MAP[piece.type] || "P";
  return `assets/pieces/${resolvePieceStyle(style)}/${color}${typeCode}.svg`;
}

export function pieceLabel(piece) {
  if (!piece?.color || !piece?.type) return "Piece";
  const color = piece.color === "b" ? "Black" : "White";
  return `${color} ${PIECE_NAME_MAP[piece.type] || "piece"}`;
}
