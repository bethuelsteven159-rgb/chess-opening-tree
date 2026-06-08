export const SELECTED_NODE_STORAGE_KEY = "gm_opening_tree_selected_node_v1";
export const SELECTED_REPAIR_STORAGE_KEY = "gm_brain_selected_repair_v1";
export const SELECTED_GAME_STORAGE_KEY = "gm_brain_selected_game_v1";
export const SELECTED_GAME_PLY_STORAGE_KEY = "gm_brain_selected_game_ply_v1";
export const SELECTED_POSITION_STORAGE_KEY = "gm_brain_selected_position_v1";
export const TRAINING_INTENT_STORAGE_KEY = "gm_brain_training_intent_v2";

function storeOrClear(key, value) {
  if (value === null || value === undefined || value === "") {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, String(value));
}

export function setSelectedNodeId(id) {
  storeOrClear(SELECTED_NODE_STORAGE_KEY, id);
}

export function getSelectedNodeId() {
  return localStorage.getItem(SELECTED_NODE_STORAGE_KEY) || null;
}

export function setSelectedRepairId(id) {
  storeOrClear(SELECTED_REPAIR_STORAGE_KEY, id);
}

export function getSelectedRepairId() {
  return localStorage.getItem(SELECTED_REPAIR_STORAGE_KEY) || null;
}

export function setSelectedGameId(id) {
  storeOrClear(SELECTED_GAME_STORAGE_KEY, id);
}

export function getSelectedGameId() {
  return localStorage.getItem(SELECTED_GAME_STORAGE_KEY) || null;
}

export function setSelectedGamePly(ply) {
  const safePly = Number.isFinite(Number(ply)) ? Math.max(0, Number.parseInt(ply, 10) || 0) : 0;
  localStorage.setItem(SELECTED_GAME_PLY_STORAGE_KEY, String(safePly));
}

export function getSelectedGamePly() {
  return Number.parseInt(localStorage.getItem(SELECTED_GAME_PLY_STORAGE_KEY) || "0", 10) || 0;
}

export function setSelectedPositionId(id) {
  storeOrClear(SELECTED_POSITION_STORAGE_KEY, id);
}

export function getSelectedPositionId() {
  return localStorage.getItem(SELECTED_POSITION_STORAGE_KEY) || null;
}

export function setTrainingIntent(intent = {}) {
  const clean = {
    mode: String(intent.mode || "").trim(),
    source_type: String(intent.source_type || "").trim(),
    source_id: String(intent.source_id || "").trim(),
    created_at: new Date().toISOString()
  };

  if (!clean.mode && !clean.source_type && !clean.source_id) {
    localStorage.removeItem(TRAINING_INTENT_STORAGE_KEY);
    return;
  }

  localStorage.setItem(TRAINING_INTENT_STORAGE_KEY, JSON.stringify(clean));
}

export function getTrainingIntent() {
  const raw = localStorage.getItem(TRAINING_INTENT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      mode: String(parsed.mode || "").trim(),
      source_type: String(parsed.source_type || "").trim(),
      source_id: String(parsed.source_id || "").trim(),
      created_at: String(parsed.created_at || "").trim()
    };
  } catch {
    return null;
  }
}

export function clearTrainingIntent() {
  localStorage.removeItem(TRAINING_INTENT_STORAGE_KEY);
}
