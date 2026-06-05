const LEGACY_NODE_STORAGE_KEY = "gm_opening_tree_local_v1";
const NODE_STORAGE_KEY = "gm_opening_tree_local_v2";
const REPAIR_STORAGE_KEY = "gm_opening_tree_repairs_v1";
const GAME_STORAGE_KEY = "gm_opening_tree_games_v1";
const GAME_ANNOTATION_STORAGE_KEY = "gm_opening_tree_game_annotations_v1";
const POSITION_STORAGE_KEY = "gm_opening_tree_positions_v1";
const MISTAKE_STORAGE_KEY = "gm_opening_tree_mistakes_v1";
const NODE_SNAPSHOT_KEY = "gm_opening_tree_local_snapshot_v1";
const REPAIR_SNAPSHOT_KEY = "gm_opening_tree_repairs_snapshot_v1";
const GAME_SNAPSHOT_KEY = "gm_opening_tree_games_snapshot_v1";
const GAME_ANNOTATION_SNAPSHOT_KEY = "gm_opening_tree_game_annotations_snapshot_v1";
const POSITION_SNAPSHOT_KEY = "gm_opening_tree_positions_snapshot_v1";
const MISTAKE_SNAPSHOT_KEY = "gm_opening_tree_mistakes_snapshot_v1";
const PENDING_NODE_SYNC_KEY = "gm_opening_tree_nodes_pending_sync_v1";
const PENDING_REPAIR_SYNC_KEY = "gm_opening_tree_repairs_pending_sync_v1";
const PENDING_GAME_SYNC_KEY = "gm_opening_tree_games_pending_sync_v1";
const PENDING_GAME_ANNOTATION_SYNC_KEY = "gm_opening_tree_game_annotations_pending_sync_v1";
const PENDING_POSITION_SYNC_KEY = "gm_opening_tree_positions_pending_sync_v1";
const PENDING_MISTAKE_SYNC_KEY = "gm_opening_tree_mistakes_pending_sync_v1";

const supportCache = new Map();

const GAME_STATUS_VALUES = [
  "imported_only",
  "quick_classified",
  "human_analysis_started",
  "human_analysis_complete",
  "engine_checked_later",
  "lessons_extracted",
  "repairs_created"
];

const POSITION_TYPE_VALUES = [
  "opening",
  "middlegame",
  "endgame",
  "tactic",
  "defense",
  "conversion",
  "strategy"
];

const MISTAKE_CATEGORY_VALUES = [
  "opening",
  "calculation",
  "tactics",
  "strategy",
  "endgame",
  "time_management",
  "psychology_emotion",
  "conversion",
  "defense"
];

const MISTAKE_SEVERITY_VALUES = ["small", "medium", "serious", "game_losing"];
const GAME_PHASE_VALUES = ["opening", "middlegame", "endgame"];

const seedNodes = [
  {
    id: crypto.randomUUID(),
    parent_id: null,
    move: "1.e4",
    title: "King's Pawn Opening",
    explanation: "Claim the center, open the bishop and queen, and steer the repertoire toward active open games.",
    tags: ["White", "center", "classical"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: true
  },
  {
    id: crypto.randomUUID(),
    parent_id: null,
    move: "1...e5",
    title: "Open Game vs 1.e4",
    explanation: "Meet central control with central control and keep your development fast and direct.",
    tags: ["Black", "1.e4", "classical"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: true
  },
  {
    id: crypto.randomUUID(),
    parent_id: null,
    move: "1...d5",
    title: "Queen's Gambit family",
    explanation: "A practical answer to 1.d4 that keeps the structure healthy and the plans easy to remember.",
    tags: ["Black", "1.d4", "structure"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: false
  }
];

seedNodes.push(
  {
    id: crypto.randomUUID(),
    parent_id: seedNodes[0].id,
    move: "2.Nf3",
    title: "Develop and pressure e5",
    explanation: "Natural development, fast castling, and flexible central plans.",
    tags: ["development"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: false
  },
  {
    id: crypto.randomUUID(),
    parent_id: seedNodes[0].id,
    move: "2.Bc4",
    title: "Italian setup idea",
    explanation: "Eye f7, build with c3 and d4, and keep the kingside pieces flowing naturally.",
    tags: ["Italian", "bishop"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: true
  },
  {
    id: crypto.randomUUID(),
    parent_id: seedNodes[1].id,
    move: "2.Nf3",
    title: "Classical open games",
    explanation: "Expect Italian, Scotch, or Ruy Lopez structures and sharpen your tactical awareness.",
    tags: ["open games"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: true
  },
  {
    id: crypto.randomUUID(),
    parent_id: seedNodes[2].id,
    move: "2.c4",
    title: "Queen's Gambit structures",
    explanation: "Challenge the center from the side and learn when to hold or release the pawn tension.",
    tags: ["QGD", "Slav"],
    exclude_from_training: false,
    is_practice_card: true,
    is_preferred: true
  }
);

function getClient() {
  const cfg = window.APP_CONFIG || {};

  if (window.GM_SUPABASE_CLIENT) {
    return window.GM_SUPABASE_CLIENT;
  }

  const ready =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    !cfg.SUPABASE_ANON_KEY.includes("PASTE_") &&
    window.supabase;

  if (!ready) return null;

  window.GM_SUPABASE_CLIENT = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  return window.GM_SUPABASE_CLIENT;
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map(tag => String(tag || "").trim()).filter(Boolean) : [];
}

function normalizeNode(node) {
  const excludeFromTraining =
    node.exclude_from_training === true ||
    node.do_not_use_for_training === true ||
    node.is_practice_card === false;

  return {
    id: node.id || crypto.randomUUID(),
    parent_id: node.parent_id || null,
    move: node.move || "New move",
    title: node.title || "",
    explanation: node.explanation || "",
    highlight_kind: ["blunder", "great", "brilliant"].includes(node.highlight_kind) ? node.highlight_kind : "",
    tags: normalizeTags(node.tags),
    exclude_from_training: excludeFromTraining,
    is_practice_card: !excludeFromTraining,
    is_preferred: node.is_preferred === true,
    created_at: node.created_at || new Date().toISOString()
  };
}

function normalizeRepairItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    related_node_id: item.related_node_id || null,
    position_path: String(item.position_path || "").trim(),
    mistake: String(item.mistake || "").trim(),
    lesson: String(item.lesson || "").trim(),
    repair: String(item.repair || "").trim(),
    status: item.status === "solved" ? "solved" : "needs_work",
    created_at: item.created_at || new Date().toISOString()
  };
}

function normalizeChoice(value, allowed, fallback = "") {
  return allowed.includes(value) ? value : fallback;
}

function normalizeGame(game) {
  return {
    id: game.id || crypto.randomUUID(),
    event: String(game.event || "").trim(),
    site: String(game.site || "").trim(),
    date: String(game.date || "").trim(),
    round: String(game.round || "").trim(),
    time_control: String(game.time_control || "").trim(),
    platform: String(game.platform || "").trim(),
    user_color: normalizeChoice(String(game.user_color || "").toLowerCase(), ["white", "black"], "white"),
    white_player: String(game.white_player || game.white || "").trim(),
    black_player: String(game.black_player || game.black || "").trim(),
    result: String(game.result || "*").trim() || "*",
    opening_name: String(game.opening_name || "").trim(),
    eco: String(game.eco || "").trim(),
    pgn: String(game.pgn || "").trim(),
    final_fen: String(game.final_fen || "").trim(),
    summary: String(game.summary || "").trim(),
    tags: normalizeTags(game.tags),
    analysis_status: normalizeChoice(game.analysis_status, GAME_STATUS_VALUES, "imported_only"),
    linked_opening_node_id: game.linked_opening_node_id || null,
    linked_opening_title: String(game.linked_opening_title || "").trim(),
    created_at: game.created_at || new Date().toISOString(),
    updated_at: game.updated_at || new Date().toISOString()
  };
}

function normalizeGameAnnotation(annotation) {
  const parsedPly = Number.parseInt(annotation.ply, 10);
  const parsedMoveNumber = Number.parseInt(annotation.move_number, 10);

  return {
    id: annotation.id || crypto.randomUUID(),
    game_id: annotation.game_id || null,
    move_number: Number.isFinite(parsedMoveNumber) && parsedMoveNumber > 0 ? parsedMoveNumber : null,
    ply: Number.isFinite(parsedPly) && parsedPly >= 0 ? parsedPly : 0,
    san: String(annotation.san || "").trim(),
    from_square: String(annotation.from_square || annotation.from || "").trim(),
    to_square: String(annotation.to_square || annotation.to || "").trim(),
    fen_before: String(annotation.fen_before || "").trim(),
    fen_after: String(annotation.fen_after || "").trim(),
    human_comment_before: String(annotation.human_comment_before || "").trim(),
    human_comment_after: String(annotation.human_comment_after || "").trim(),
    candidate_moves: normalizeTags(annotation.candidate_moves),
    rejected_candidate_moves: normalizeTags(annotation.rejected_candidate_moves),
    expected_reply: String(annotation.expected_reply || "").trim(),
    actual_reply: String(annotation.actual_reply || "").trim(),
    evaluation_human: String(annotation.evaluation_human || "").trim(),
    confidence_level: String(annotation.confidence_level || "").trim(),
    emotional_state: String(annotation.emotional_state || "").trim(),
    is_critical: annotation.is_critical === true,
    critical_type: String(annotation.critical_type || "").trim(),
    mistake_flag: annotation.mistake_flag === true,
    lesson_flag: annotation.lesson_flag === true,
    position_id: annotation.position_id || null,
    mistake_id: annotation.mistake_id || null,
    repair_id: annotation.repair_id || null,
    created_at: annotation.created_at || new Date().toISOString(),
    updated_at: annotation.updated_at || new Date().toISOString()
  };
}

function normalizePosition(position) {
  const parsedMoveNumber = Number.parseInt(position.move_number, 10);

  return {
    id: position.id || crypto.randomUUID(),
    fen: String(position.fen || "").trim(),
    pgn_context: String(position.pgn_context || "").trim(),
    side_to_move: normalizeChoice(position.side_to_move, ["w", "b"], "w"),
    move_number: Number.isFinite(parsedMoveNumber) && parsedMoveNumber > 0 ? parsedMoveNumber : null,
    source_type: String(position.source_type || "").trim(),
    source_id: position.source_id || null,
    title: String(position.title || "").trim(),
    short_question: String(position.short_question || "").trim(),
    position_type: normalizeChoice(position.position_type, POSITION_TYPE_VALUES, "middlegame"),
    themes: normalizeTags(position.themes),
    tags: normalizeTags(position.tags),
    difficulty: String(position.difficulty || "").trim(),
    priority: String(position.priority || "").trim(),
    human_evaluation: String(position.human_evaluation || "").trim(),
    correct_idea: String(position.correct_idea || "").trim(),
    wrong_idea: String(position.wrong_idea || "").trim(),
    candidate_moves: normalizeTags(position.candidate_moves),
    best_human_move: String(position.best_human_move || "").trim(),
    lesson: String(position.lesson || "").trim(),
    linked_repair_id: position.linked_repair_id || null,
    linked_opening_node_id: position.linked_opening_node_id || null,
    linked_game_id: position.linked_game_id || null,
    created_at: position.created_at || new Date().toISOString(),
    updated_at: position.updated_at || new Date().toISOString()
  };
}

function normalizeMistake(mistake) {
  const parsedMoveNumber = Number.parseInt(mistake.move_number, 10);

  return {
    id: mistake.id || crypto.randomUUID(),
    title: String(mistake.title || "").trim(),
    source_type: String(mistake.source_type || "").trim(),
    source_id: mistake.source_id || null,
    position_id: mistake.position_id || null,
    linked_opening_node_id: mistake.linked_opening_node_id || null,
    move_number: Number.isFinite(parsedMoveNumber) && parsedMoveNumber > 0 ? parsedMoveNumber : null,
    category: normalizeChoice(mistake.category, MISTAKE_CATEGORY_VALUES, "calculation"),
    cause: String(mistake.cause || "").trim(),
    severity: normalizeChoice(mistake.severity, MISTAKE_SEVERITY_VALUES, "medium"),
    phase: normalizeChoice(mistake.phase, GAME_PHASE_VALUES, "middlegame"),
    side: normalizeChoice(String(mistake.side || "").toLowerCase(), ["white", "black"], "white"),
    what_i_played: String(mistake.what_i_played || "").trim(),
    what_i_missed: String(mistake.what_i_missed || "").trim(),
    why_it_happened: String(mistake.why_it_happened || "").trim(),
    correct_thinking_rule: String(mistake.correct_thinking_rule || "").trim(),
    recurrence_key: String(mistake.recurrence_key || "").trim(),
    tags: normalizeTags(mistake.tags),
    created_at: mistake.created_at || new Date().toISOString(),
    updated_at: mistake.updated_at || new Date().toISOString()
  };
}

function readLocalJson(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function writeLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearLocalJson(key) {
  localStorage.removeItem(key);
}

function hasLocalJson(key) {
  return localStorage.getItem(key) !== null;
}

function readStoredArray(key, normalizer) {
  const raw = readLocalJson(key);
  return Array.isArray(raw) ? raw.map(normalizer) : [];
}

function writeNonEmptySnapshot(key, value) {
  if (Array.isArray(value) && value.length) {
    writeLocalJson(key, value);
  }
}

function storeCurrentNodes(nodes) {
  writeLocalJson(NODE_STORAGE_KEY, nodes);
  writeNonEmptySnapshot(NODE_SNAPSHOT_KEY, nodes);
}

function storeCurrentRepairs(items) {
  writeLocalJson(REPAIR_STORAGE_KEY, items);
  writeNonEmptySnapshot(REPAIR_SNAPSHOT_KEY, items);
}

function storeCurrentFlatCollection(storageKey, snapshotKey, items) {
  writeLocalJson(storageKey, items);
  writeNonEmptySnapshot(snapshotKey, items);
}

function loadLocalFlatCollection(storageKey, snapshotKey, normalizer, fallback = []) {
  if (hasLocalJson(storageKey)) {
    const clean = readStoredArray(storageKey, normalizer);
    storeCurrentFlatCollection(storageKey, snapshotKey, clean);
    return clean;
  }

  const snapshot = readStoredArray(snapshotKey, normalizer);
  if (snapshot.length) {
    storeCurrentFlatCollection(storageKey, snapshotKey, snapshot);
    return snapshot;
  }

  const clean = fallback.map(normalizer);
  storeCurrentFlatCollection(storageKey, snapshotKey, clean);
  return clean;
}

function loadPendingNodes() {
  return readStoredArray(PENDING_NODE_SYNC_KEY, normalizeNode);
}

function loadPendingRepairs() {
  return readStoredArray(PENDING_REPAIR_SYNC_KEY, normalizeRepairItem);
}

function loadPendingGames() {
  return readStoredArray(PENDING_GAME_SYNC_KEY, normalizeGame);
}

function loadPendingGameAnnotations() {
  return readStoredArray(PENDING_GAME_ANNOTATION_SYNC_KEY, normalizeGameAnnotation);
}

function loadPendingPositions() {
  return readStoredArray(PENDING_POSITION_SYNC_KEY, normalizePosition);
}

function loadPendingMistakes() {
  return readStoredArray(PENDING_MISTAKE_SYNC_KEY, normalizeMistake);
}

function hasPendingNodes() {
  return hasLocalJson(PENDING_NODE_SYNC_KEY);
}

function hasPendingRepairs() {
  return hasLocalJson(PENDING_REPAIR_SYNC_KEY);
}

function hasPendingGames() {
  return hasLocalJson(PENDING_GAME_SYNC_KEY);
}

function hasPendingGameAnnotations() {
  return hasLocalJson(PENDING_GAME_ANNOTATION_SYNC_KEY);
}

function hasPendingPositions() {
  return hasLocalJson(PENDING_POSITION_SYNC_KEY);
}

function hasPendingMistakes() {
  return hasLocalJson(PENDING_MISTAKE_SYNC_KEY);
}

function markPendingNodes(nodes) {
  writeLocalJson(PENDING_NODE_SYNC_KEY, nodes);
}

function markPendingRepairs(items) {
  writeLocalJson(PENDING_REPAIR_SYNC_KEY, items);
}

function markPendingGames(items) {
  writeLocalJson(PENDING_GAME_SYNC_KEY, items);
}

function markPendingGameAnnotations(items) {
  writeLocalJson(PENDING_GAME_ANNOTATION_SYNC_KEY, items);
}

function markPendingPositions(items) {
  writeLocalJson(PENDING_POSITION_SYNC_KEY, items);
}

function markPendingMistakes(items) {
  writeLocalJson(PENDING_MISTAKE_SYNC_KEY, items);
}

function clearPendingNodes() {
  clearLocalJson(PENDING_NODE_SYNC_KEY);
}

function clearPendingRepairs() {
  clearLocalJson(PENDING_REPAIR_SYNC_KEY);
}

function clearPendingGames() {
  clearLocalJson(PENDING_GAME_SYNC_KEY);
}

function clearPendingGameAnnotations() {
  clearLocalJson(PENDING_GAME_ANNOTATION_SYNC_KEY);
}

function clearPendingPositions() {
  clearLocalJson(PENDING_POSITION_SYNC_KEY);
}

function clearPendingMistakes() {
  clearLocalJson(PENDING_MISTAKE_SYNC_KEY);
}

function loadLocalNodes() {
  if (hasLocalJson(NODE_STORAGE_KEY)) {
    const clean = readStoredArray(NODE_STORAGE_KEY, normalizeNode);
    storeCurrentNodes(clean);
    return clean;
  }

  if (hasLocalJson(LEGACY_NODE_STORAGE_KEY)) {
    const clean = readStoredArray(LEGACY_NODE_STORAGE_KEY, normalizeNode);
    storeCurrentNodes(clean);
    return clean;
  }

  const snapshot = readStoredArray(NODE_SNAPSHOT_KEY, normalizeNode);
  if (snapshot.length) {
    storeCurrentNodes(snapshot);
    return snapshot;
  }

  const cleanSeed = seedNodes.map(normalizeNode);
  storeCurrentNodes(cleanSeed);
  return cleanSeed;
}

function loadLocalRepairs() {
  if (hasLocalJson(REPAIR_STORAGE_KEY)) {
    const clean = readStoredArray(REPAIR_STORAGE_KEY, normalizeRepairItem);
    storeCurrentRepairs(clean);
    return clean;
  }

  const snapshot = readStoredArray(REPAIR_SNAPSHOT_KEY, normalizeRepairItem);
  if (snapshot.length) {
    storeCurrentRepairs(snapshot);
    return snapshot;
  }

  const clean = [];
  storeCurrentRepairs(clean);
  return clean;
}

function storeCurrentGames(items) {
  storeCurrentFlatCollection(GAME_STORAGE_KEY, GAME_SNAPSHOT_KEY, items);
}

function storeCurrentGameAnnotations(items) {
  storeCurrentFlatCollection(GAME_ANNOTATION_STORAGE_KEY, GAME_ANNOTATION_SNAPSHOT_KEY, items);
}

function storeCurrentPositions(items) {
  storeCurrentFlatCollection(POSITION_STORAGE_KEY, POSITION_SNAPSHOT_KEY, items);
}

function storeCurrentMistakes(items) {
  storeCurrentFlatCollection(MISTAKE_STORAGE_KEY, MISTAKE_SNAPSHOT_KEY, items);
}

function loadLocalGames() {
  return loadLocalFlatCollection(GAME_STORAGE_KEY, GAME_SNAPSHOT_KEY, normalizeGame, []);
}

function loadLocalGameAnnotations() {
  return loadLocalFlatCollection(GAME_ANNOTATION_STORAGE_KEY, GAME_ANNOTATION_SNAPSHOT_KEY, normalizeGameAnnotation, []);
}

function loadLocalPositions() {
  return loadLocalFlatCollection(POSITION_STORAGE_KEY, POSITION_SNAPSHOT_KEY, normalizePosition, []);
}

function loadLocalMistakes() {
  return loadLocalFlatCollection(MISTAKE_STORAGE_KEY, MISTAKE_SNAPSHOT_KEY, normalizeMistake, []);
}

function describeError(error) {
  return `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
}

function isConnectivityError(error) {
  const text = describeError(error);
  return (
    error?.name === "TypeError" ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("offline") ||
    text.includes("load failed")
  );
}

function isMissingColumnError(error, columnName) {
  const text = describeError(error);
  return text.includes(columnName.toLowerCase()) || (text.includes("column") && text.includes("schema cache"));
}

function isMissingTableError(error, tableName) {
  const text = describeError(error);
  return text.includes(tableName.toLowerCase()) || text.includes("does not exist") || text.includes("relation");
}

function rowsMatchExactly(sourceRows, expectedRows) {
  if (sourceRows.length !== expectedRows.length) return false;

  const serializedById = new Map(
    sourceRows.map(row => [row.id, JSON.stringify(row)])
  );

  return expectedRows.every(row => serializedById.get(row.id) === JSON.stringify(row));
}

function ensureUniqueIds(items, label) {
  const seen = new Set();

  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Cannot save ${label}: duplicate id ${item.id}.`);
    }

    seen.add(item.id);
  }
}

function topologicallySortNodes(nodes) {
  ensureUniqueIds(nodes, "opening tree");

  const byId = new Map(nodes.map(node => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  function visit(node) {
    if (visited.has(node.id)) return;

    if (visiting.has(node.id)) {
      throw new Error("Cannot save the opening tree because it contains a parent cycle.");
    }

    visiting.add(node.id);

    if (node.parent_id) {
      const parent = byId.get(node.parent_id);
      if (!parent) {
        throw new Error(`Cannot save move "${node.move}" because its parent is missing from the tree.`);
      }

      visit(parent);
    }

    visiting.delete(node.id);
    visited.add(node.id);
    ordered.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }

  return ordered;
}

function deleteRootsForRemovedNodes(remoteNodes, keepIds) {
  const remoteById = new Map(remoteNodes.map(node => [node.id, node]));
  const removeIds = remoteNodes
    .filter(node => !keepIds.has(node.id))
    .map(node => node.id);
  const removeSet = new Set(removeIds);

  return removeIds.filter(id => {
    const parentId = remoteById.get(id)?.parent_id || null;
    return !parentId || !removeSet.has(parentId);
  });
}

async function supportsColumn(client, table, columnName) {
  const cacheKey = `${table}:${columnName}`;
  if (supportCache.has(cacheKey)) return supportCache.get(cacheKey);

  const { error } = await client.from(table).select(columnName).limit(1);

  if (!error) {
    supportCache.set(cacheKey, true);
    return true;
  }

  if (isMissingColumnError(error, columnName)) {
    console.warn(`Supabase table ${table} is missing ${columnName}. Run the updated supabase/schema.sql to sync the new app fields.`);
    supportCache.set(cacheKey, false);
    return false;
  }

  throw error;
}

async function openingNodeSupport(client, table) {
  const [highlightKind, isPreferred, excludeFromTraining, isPracticeCard] = await Promise.all([
    supportsColumn(client, table, "highlight_kind"),
    supportsColumn(client, table, "is_preferred"),
    supportsColumn(client, table, "exclude_from_training"),
    supportsColumn(client, table, "is_practice_card")
  ]);

  return { highlightKind, isPreferred, excludeFromTraining, isPracticeCard };
}

function stripUnsupportedNodeFields(node, support) {
  const row = { ...node };
  if (!support.highlightKind) delete row.highlight_kind;
  if (!support.isPreferred) delete row.is_preferred;
  if (!support.excludeFromTraining) delete row.exclude_from_training;
  if (support.isPracticeCard) row.is_practice_card = node.exclude_from_training !== true;
  else delete row.is_practice_card;
  return row;
}

async function flatTableAvailable(client, table, label) {
  const cacheKey = `table:${table}`;
  if (supportCache.has(cacheKey)) return supportCache.get(cacheKey);

  const { error } = await client.from(table).select("id").limit(1);

  if (!error) {
    supportCache.set(cacheKey, true);
    return true;
  }

  if (isMissingTableError(error, table)) {
    console.warn(`Supabase table ${table} does not exist yet. ${label} will stay in localStorage until you run the updated supabase/schema.sql.`);
    supportCache.set(cacheKey, false);
    return false;
  }

  throw error;
}

async function repairTableAvailable(client, table) {
  return flatTableAvailable(client, table, "Repairs");
}

async function loadNodesFromRemote(client, table) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase load failed:", error);
    throw error;
  }

  return (data || []).map(normalizeNode);
}

async function loadRepairItemsFromRemote(client, table) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase repair load failed:", error);
    throw error;
  }

  return (data || []).map(normalizeRepairItem);
}

async function loadGamesFromRemote(client, table) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase game load failed:", error);
    throw error;
  }

  return (data || []).map(normalizeGame);
}

async function loadGameAnnotationsFromRemote(client, table) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .order("game_id", { ascending: true })
    .order("ply", { ascending: true });

  if (error) {
    console.error("Supabase annotation load failed:", error);
    throw error;
  }

  return (data || []).map(normalizeGameAnnotation);
}

async function loadPositionsFromRemote(client, table) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase position load failed:", error);
    throw error;
  }

  return (data || []).map(normalizePosition);
}

async function loadMistakesFromRemote(client, table) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase mistake load failed:", error);
    throw error;
  }

  return (data || []).map(normalizeMistake);
}

async function syncNodesToRemote(client, table, clean, options = {}) {
  const { allowEmpty = false } = options;
  const support = await openingNodeSupport(client, table);
  const remoteNodes = await loadNodesFromRemote(client, table);

  if (!allowEmpty && !clean.length && remoteNodes.length) {
    throw new Error("Refusing to replace a non-empty opening tree with an empty save payload.");
  }

  const orderedNodes = topologicallySortNodes(clean);

  for (const node of orderedNodes) {
    const row = stripUnsupportedNodeFields(node, support);
    const { error } = await client.from(table).upsert(row, { onConflict: "id" });

    if (error) {
      console.error("Supabase upsert failed:", error);
      throw error;
    }
  }

  const keepIds = new Set(clean.map(node => node.id));
  const deleteRoots = deleteRootsForRemovedNodes(remoteNodes, keepIds);

  for (const id of deleteRoots) {
    const { error } = await client.from(table).delete().eq("id", id);

    if (error) {
      console.error("Supabase delete failed:", error);
      throw error;
    }
  }
}

async function syncRepairItemsToRemote(client, table, clean, options = {}) {
  const { allowEmpty = false } = options;
  const remoteItems = await loadRepairItemsFromRemote(client, table);

  if (!allowEmpty && !clean.length && remoteItems.length) {
    throw new Error("Refusing to replace a non-empty repair list with an empty save payload.");
  }

  ensureUniqueIds(clean, "repair list");

  for (const item of clean) {
    const { error } = await client.from(table).upsert(item, { onConflict: "id" });

    if (error) {
      console.error("Supabase repair upsert failed:", error);
      throw error;
    }
  }

  const keepIds = new Set(clean.map(item => item.id));
  const removeIds = remoteItems
    .filter(item => !keepIds.has(item.id))
    .map(item => item.id);

  if (removeIds.length) {
    const { error } = await client.from(table).delete().in("id", removeIds);

    if (error) {
      console.error("Supabase repair delete failed:", error);
      throw error;
    }
  }
}

async function syncFlatRowsToRemote(client, table, clean, label, remoteLoader, options = {}) {
  const { allowEmpty = false } = options;
  const remoteItems = await remoteLoader(client, table);

  if (!allowEmpty && !clean.length && remoteItems.length) {
    throw new Error(`Refusing to replace a non-empty ${label} with an empty save payload.`);
  }

  ensureUniqueIds(clean, label);

  for (const item of clean) {
    const { error } = await client.from(table).upsert(item, { onConflict: "id" });

    if (error) {
      console.error(`Supabase ${label} upsert failed:`, error);
      throw error;
    }
  }

  const keepIds = new Set(clean.map(item => item.id));
  const removeIds = remoteItems
    .filter(item => !keepIds.has(item.id))
    .map(item => item.id);

  if (removeIds.length) {
    const { error } = await client.from(table).delete().in("id", removeIds);

    if (error) {
      console.error(`Supabase ${label} delete failed:`, error);
      throw error;
    }
  }
}

async function loadNodes() {
  const localNodes = loadLocalNodes();
  const pendingNodes = loadPendingNodes();
  const pendingNodesExist = hasPendingNodes();
  const client = getClient();
  const table = window.APP_CONFIG?.TABLE_NAME || "opening_nodes";

  if (!client) {
    if (pendingNodesExist) {
      storeCurrentNodes(pendingNodes);
      return pendingNodes;
    }

    return localNodes;
  }

  let remoteNodes;
  try {
    remoteNodes = await loadNodesFromRemote(client, table);
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn("Opening tree remote load is unavailable. Using the local copy instead.", error);
      if (pendingNodesExist) {
        storeCurrentNodes(pendingNodes);
        return pendingNodes;
      }

      return localNodes;
    }

    throw error;
  }

  if (pendingNodesExist && !rowsMatchExactly(remoteNodes, pendingNodes)) {
    console.warn("Remote opening tree does not match the pending local sync. Preserving the local recovery copy instead of overwriting it.");
    storeCurrentNodes(pendingNodes);
    return pendingNodes;
  }

  if (!remoteNodes.length && localNodes.length) {
    console.warn("Remote opening tree is empty while local data still exists. Preserving the local tree instead of overwriting it.");
    return localNodes;
  }

  storeCurrentNodes(remoteNodes);
  clearPendingNodes();
  return remoteNodes;
}

async function saveAllNodes(nodes, options = {}) {
  const { allowEmpty = false } = options;
  const clean = nodes.map(normalizeNode);
  const client = getClient();
  const table = window.APP_CONFIG?.TABLE_NAME || "opening_nodes";

  if (!allowEmpty && !clean.length) {
    if (client) {
      const remoteNodes = await loadNodesFromRemote(client, table);
      if (remoteNodes.length) {
        throw new Error("Refusing to replace a non-empty opening tree with an empty bulk save.");
      }
    } else if (loadLocalNodes().length) {
      throw new Error("Refusing to replace a non-empty local opening tree with an empty bulk save.");
    }
  }

  storeCurrentNodes(clean);
  markPendingNodes(clean);

  if (!client) {
    return clean;
  }

  try {
    await syncNodesToRemote(client, table, clean, { allowEmpty });
    storeCurrentNodes(clean);
    clearPendingNodes();
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn("Opening tree sync is unavailable. Keeping the latest save locally until the next sync.", error);
      return clean;
    }

    throw error;
  }

  return clean;
}

async function upsertNode(node) {
  const nodes = await loadNodes();
  const clean = normalizeNode(node);

  const index = nodes.findIndex(entry => entry.id === clean.id);
  if (index >= 0) nodes[index] = clean;
  else nodes.push(clean);

  await saveAllNodes(nodes);
  return clean;
}

async function deleteNodeAndChildren(id) {
  const nodes = await loadNodes();

  const childrenOf = parentId =>
    nodes
      .filter(node => node.parent_id === parentId)
      .flatMap(node => [node.id, ...childrenOf(node.id)]);

  const removeIds = new Set([id, ...childrenOf(id)]);
  const kept = nodes.filter(node => !removeIds.has(node.id));

  await saveAllNodes(kept, { allowEmpty: true });

  const repairs = await loadRepairItems();
  const filteredRepairs = repairs.map(repair =>
    removeIds.has(repair.related_node_id)
      ? { ...repair, related_node_id: null }
      : repair
  );

  await saveAllRepairItems(filteredRepairs, { allowEmpty: true });
  return kept;
}

async function loadRepairItems() {
  const localRepairs = loadLocalRepairs();
  const pendingRepairs = loadPendingRepairs();
  const pendingRepairsExist = hasPendingRepairs();
  const client = getClient();
  const table = window.APP_CONFIG?.REPAIR_TABLE_NAME || "repair_items";
  let repairReady = false;

  if (client) {
    try {
      repairReady = await repairTableAvailable(client, table);
    } catch (error) {
      if (isConnectivityError(error)) {
        console.warn("Repair table check is unavailable. Using the local copy instead.", error);
        if (pendingRepairsExist) {
          storeCurrentRepairs(pendingRepairs);
          return pendingRepairs;
        }

        return localRepairs;
      }

      throw error;
    }
  }

  if (!client || !repairReady) {
    if (pendingRepairsExist) {
      storeCurrentRepairs(pendingRepairs);
      return pendingRepairs;
    }

    return localRepairs;
  }

  let remoteItems;
  try {
    remoteItems = await loadRepairItemsFromRemote(client, table);
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn("Repair remote load is unavailable. Using the local copy instead.", error);
      if (pendingRepairsExist) {
        storeCurrentRepairs(pendingRepairs);
        return pendingRepairs;
      }

      return localRepairs;
    }

    throw error;
  }

  if (pendingRepairsExist && !rowsMatchExactly(remoteItems, pendingRepairs)) {
    console.warn("Remote repair list does not match the pending local sync. Preserving the local recovery copy instead of overwriting it.");
    storeCurrentRepairs(pendingRepairs);
    return pendingRepairs;
  }

  if (!remoteItems.length && localRepairs.length) {
    console.warn("Remote repair list is empty while local data still exists. Preserving the local repair copy instead of overwriting it.");
    return localRepairs;
  }

  storeCurrentRepairs(remoteItems);
  clearPendingRepairs();
  return remoteItems;
}

async function saveAllRepairItems(items, options = {}) {
  const { allowEmpty = false } = options;
  const clean = items.map(normalizeRepairItem);
  const client = getClient();
  const table = window.APP_CONFIG?.REPAIR_TABLE_NAME || "repair_items";
  let repairReady = false;

  if (!allowEmpty && !clean.length) {
    if (client) {
      repairReady = await repairTableAvailable(client, table);
    }

    if (client && repairReady) {
      const remoteItems = await loadRepairItemsFromRemote(client, table);
      if (remoteItems.length) {
        throw new Error("Refusing to replace a non-empty repair list with an empty bulk save.");
      }
    } else if (loadLocalRepairs().length) {
      throw new Error("Refusing to replace a non-empty local repair list with an empty bulk save.");
    }
  }

  storeCurrentRepairs(clean);
  markPendingRepairs(clean);

  if (client && !repairReady) {
    try {
      repairReady = await repairTableAvailable(client, table);
    } catch (error) {
      if (isConnectivityError(error)) {
        console.warn("Repair table check is unavailable. Keeping the latest repair save locally until the next sync.", error);
        return clean;
      }

      throw error;
    }
  }

  if (!client || !repairReady) {
    return clean;
  }

  try {
    await syncRepairItemsToRemote(client, table, clean, { allowEmpty });
    storeCurrentRepairs(clean);
    clearPendingRepairs();
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn("Repair sync is unavailable. Keeping the latest repair save locally until the next sync.", error);
      return clean;
    }

    throw error;
  }

  return clean;
}

async function upsertRepairItem(item) {
  const repairs = await loadRepairItems();
  const clean = normalizeRepairItem(item);

  const index = repairs.findIndex(entry => entry.id === clean.id);
  if (index >= 0) repairs[index] = clean;
  else repairs.unshift(clean);

  await saveAllRepairItems(repairs);
  return clean;
}

async function deleteRepairItem(id) {
  const repairs = await loadRepairItems();
  const kept = repairs.filter(entry => entry.id !== id);
  await saveAllRepairItems(kept, { allowEmpty: true });
  return kept;
}

async function loadRemoteBackedFlatCollection(options) {
  const {
    label,
    table,
    remoteLoader,
    loadLocal,
    loadPending,
    hasPending,
    storeCurrent,
    clearPending
  } = options;
  const localItems = loadLocal();
  const pendingItems = loadPending();
  const pendingItemsExist = hasPending();
  const client = getClient();
  let tableReady = false;

  if (client) {
    try {
      tableReady = await flatTableAvailable(client, table, label);
    } catch (error) {
      if (isConnectivityError(error)) {
        console.warn(`${label} table check is unavailable. Using the local copy instead.`, error);
        if (pendingItemsExist) {
          storeCurrent(pendingItems);
          return pendingItems;
        }

        return localItems;
      }

      throw error;
    }
  }

  if (!client || !tableReady) {
    if (pendingItemsExist) {
      storeCurrent(pendingItems);
      return pendingItems;
    }

    return localItems;
  }

  let remoteItems;
  try {
    remoteItems = await remoteLoader(client, table);
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn(`${label} remote load is unavailable. Using the local copy instead.`, error);
      if (pendingItemsExist) {
        storeCurrent(pendingItems);
        return pendingItems;
      }

      return localItems;
    }

    throw error;
  }

  if (pendingItemsExist && !rowsMatchExactly(remoteItems, pendingItems)) {
    console.warn(`Remote ${label.toLowerCase()} does not match the pending local sync. Preserving the local recovery copy instead of overwriting it.`);
    storeCurrent(pendingItems);
    return pendingItems;
  }

  if (!remoteItems.length && localItems.length) {
    console.warn(`Remote ${label.toLowerCase()} is empty while local data still exists. Preserving the local copy instead of overwriting it.`);
    return localItems;
  }

  storeCurrent(remoteItems);
  clearPending();
  return remoteItems;
}

async function saveRemoteBackedFlatCollection(items, options) {
  const {
    allowEmpty = false,
    label,
    table,
    remoteLoader,
    loadLocal,
    storeCurrent,
    markPending,
    clearPending,
    normalizer
  } = options;
  const clean = items.map(normalizer);
  const client = getClient();
  let tableReady = false;

  if (!allowEmpty && !clean.length) {
    if (client) {
      tableReady = await flatTableAvailable(client, table, label);
    }

    if (client && tableReady) {
      const remoteItems = await remoteLoader(client, table);
      if (remoteItems.length) {
        throw new Error(`Refusing to replace a non-empty ${label.toLowerCase()} with an empty bulk save.`);
      }
    } else if (loadLocal().length) {
      throw new Error(`Refusing to replace a non-empty local ${label.toLowerCase()} with an empty bulk save.`);
    }
  }

  storeCurrent(clean);
  markPending(clean);

  if (client && !tableReady) {
    try {
      tableReady = await flatTableAvailable(client, table, label);
    } catch (error) {
      if (isConnectivityError(error)) {
        console.warn(`${label} table check is unavailable. Keeping the latest save locally until the next sync.`, error);
        return clean;
      }

      throw error;
    }
  }

  if (!client || !tableReady) {
    return clean;
  }

  try {
    await syncFlatRowsToRemote(client, table, clean, label.toLowerCase(), remoteLoader, { allowEmpty });
    storeCurrent(clean);
    clearPending();
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn(`${label} sync is unavailable. Keeping the latest save locally until the next sync.`, error);
      return clean;
    }

    throw error;
  }

  return clean;
}

async function loadGames() {
  return loadRemoteBackedFlatCollection({
    label: "Games",
    table: window.APP_CONFIG?.GAMES_TABLE_NAME || "games",
    remoteLoader: loadGamesFromRemote,
    loadLocal: loadLocalGames,
    loadPending: loadPendingGames,
    hasPending: hasPendingGames,
    storeCurrent: storeCurrentGames,
    clearPending: clearPendingGames
  });
}

async function saveAllGames(items, options = {}) {
  return saveRemoteBackedFlatCollection(items, {
    ...options,
    label: "Games",
    table: window.APP_CONFIG?.GAMES_TABLE_NAME || "games",
    remoteLoader: loadGamesFromRemote,
    loadLocal: loadLocalGames,
    storeCurrent: storeCurrentGames,
    markPending: markPendingGames,
    clearPending: clearPendingGames,
    normalizer: normalizeGame
  });
}

async function upsertGame(game) {
  const games = await loadGames();
  const clean = normalizeGame(game);
  const index = games.findIndex(entry => entry.id === clean.id);

  if (index >= 0) games[index] = clean;
  else games.unshift(clean);

  await saveAllGames(games);
  return clean;
}

async function deleteGame(id) {
  const games = await loadGames();
  const keptGames = games.filter(entry => entry.id !== id);
  await saveAllGames(keptGames, { allowEmpty: true });

  const annotations = await loadGameAnnotations();
  const keptAnnotations = annotations.filter(entry => entry.game_id !== id);
  await saveAllGameAnnotations(keptAnnotations, { allowEmpty: true });

  const positions = await loadPositions();
  const updatedPositions = positions.map(position =>
    position.linked_game_id === id
      ? { ...position, linked_game_id: null, updated_at: new Date().toISOString() }
      : position
  );
  await saveAllPositions(updatedPositions, { allowEmpty: true });

  return keptGames;
}

async function loadGameAnnotations() {
  return loadRemoteBackedFlatCollection({
    label: "Game annotations",
    table: window.APP_CONFIG?.GAME_ANNOTATIONS_TABLE_NAME || "game_annotations",
    remoteLoader: loadGameAnnotationsFromRemote,
    loadLocal: loadLocalGameAnnotations,
    loadPending: loadPendingGameAnnotations,
    hasPending: hasPendingGameAnnotations,
    storeCurrent: storeCurrentGameAnnotations,
    clearPending: clearPendingGameAnnotations
  });
}

async function saveAllGameAnnotations(items, options = {}) {
  return saveRemoteBackedFlatCollection(items, {
    ...options,
    label: "Game annotations",
    table: window.APP_CONFIG?.GAME_ANNOTATIONS_TABLE_NAME || "game_annotations",
    remoteLoader: loadGameAnnotationsFromRemote,
    loadLocal: loadLocalGameAnnotations,
    storeCurrent: storeCurrentGameAnnotations,
    markPending: markPendingGameAnnotations,
    clearPending: clearPendingGameAnnotations,
    normalizer: normalizeGameAnnotation
  });
}

async function upsertGameAnnotation(annotation) {
  const annotations = await loadGameAnnotations();
  const clean = normalizeGameAnnotation(annotation);
  const index = annotations.findIndex(entry => entry.id === clean.id);

  if (index >= 0) annotations[index] = clean;
  else annotations.push(clean);

  annotations.sort((left, right) => {
    if (left.game_id !== right.game_id) {
      return String(left.game_id || "").localeCompare(String(right.game_id || ""));
    }
    return left.ply - right.ply;
  });

  await saveAllGameAnnotations(annotations);
  return clean;
}

async function deleteGameAnnotation(id) {
  const annotations = await loadGameAnnotations();
  const kept = annotations.filter(entry => entry.id !== id);
  await saveAllGameAnnotations(kept, { allowEmpty: true });
  return kept;
}

async function loadPositions() {
  return loadRemoteBackedFlatCollection({
    label: "Positions",
    table: window.APP_CONFIG?.POSITIONS_TABLE_NAME || "positions",
    remoteLoader: loadPositionsFromRemote,
    loadLocal: loadLocalPositions,
    loadPending: loadPendingPositions,
    hasPending: hasPendingPositions,
    storeCurrent: storeCurrentPositions,
    clearPending: clearPendingPositions
  });
}

async function saveAllPositions(items, options = {}) {
  return saveRemoteBackedFlatCollection(items, {
    ...options,
    label: "Positions",
    table: window.APP_CONFIG?.POSITIONS_TABLE_NAME || "positions",
    remoteLoader: loadPositionsFromRemote,
    loadLocal: loadLocalPositions,
    storeCurrent: storeCurrentPositions,
    markPending: markPendingPositions,
    clearPending: clearPendingPositions,
    normalizer: normalizePosition
  });
}

async function upsertPosition(position) {
  const positions = await loadPositions();
  const clean = normalizePosition(position);
  const index = positions.findIndex(entry => entry.id === clean.id);

  if (index >= 0) positions[index] = clean;
  else positions.unshift(clean);

  await saveAllPositions(positions);
  return clean;
}

async function deletePosition(id) {
  const positions = await loadPositions();
  const keptPositions = positions.filter(entry => entry.id !== id);
  await saveAllPositions(keptPositions, { allowEmpty: true });

  const annotations = await loadGameAnnotations();
  const updatedAnnotations = annotations.map(annotation =>
    annotation.position_id === id
      ? { ...annotation, position_id: null, updated_at: new Date().toISOString() }
      : annotation
  );
  await saveAllGameAnnotations(updatedAnnotations, { allowEmpty: true });

  const mistakes = await loadMistakes();
  const updatedMistakes = mistakes.map(mistake =>
    mistake.position_id === id
      ? { ...mistake, position_id: null, updated_at: new Date().toISOString() }
      : mistake
  );
  await saveAllMistakes(updatedMistakes, { allowEmpty: true });

  return keptPositions;
}

async function loadMistakes() {
  return loadRemoteBackedFlatCollection({
    label: "Mistakes",
    table: window.APP_CONFIG?.MISTAKES_TABLE_NAME || "mistakes",
    remoteLoader: loadMistakesFromRemote,
    loadLocal: loadLocalMistakes,
    loadPending: loadPendingMistakes,
    hasPending: hasPendingMistakes,
    storeCurrent: storeCurrentMistakes,
    clearPending: clearPendingMistakes
  });
}

async function saveAllMistakes(items, options = {}) {
  return saveRemoteBackedFlatCollection(items, {
    ...options,
    label: "Mistakes",
    table: window.APP_CONFIG?.MISTAKES_TABLE_NAME || "mistakes",
    remoteLoader: loadMistakesFromRemote,
    loadLocal: loadLocalMistakes,
    storeCurrent: storeCurrentMistakes,
    markPending: markPendingMistakes,
    clearPending: clearPendingMistakes,
    normalizer: normalizeMistake
  });
}

async function upsertMistake(mistake) {
  const mistakes = await loadMistakes();
  const clean = normalizeMistake(mistake);
  const index = mistakes.findIndex(entry => entry.id === clean.id);

  if (index >= 0) mistakes[index] = clean;
  else mistakes.unshift(clean);

  await saveAllMistakes(mistakes);
  return clean;
}

async function deleteMistake(id) {
  const mistakes = await loadMistakes();
  const keptMistakes = mistakes.filter(entry => entry.id !== id);
  await saveAllMistakes(keptMistakes, { allowEmpty: true });

  const annotations = await loadGameAnnotations();
  const updatedAnnotations = annotations.map(annotation =>
    annotation.mistake_id === id
      ? { ...annotation, mistake_id: null, updated_at: new Date().toISOString() }
      : annotation
  );
  await saveAllGameAnnotations(updatedAnnotations, { allowEmpty: true });

  return keptMistakes;
}

window.OpeningDB = {
  loadNodes,
  saveAllNodes,
  upsertNode,
  deleteNodeAndChildren,
  normalizeNode,
  loadRepairItems,
  saveAllRepairItems,
  upsertRepairItem,
  deleteRepairItem,
  normalizeRepairItem,
  loadGames,
  saveAllGames,
  upsertGame,
  deleteGame,
  normalizeGame,
  loadGameAnnotations,
  saveAllGameAnnotations,
  upsertGameAnnotation,
  deleteGameAnnotation,
  normalizeGameAnnotation,
  loadPositions,
  saveAllPositions,
  upsertPosition,
  deletePosition,
  normalizePosition,
  loadMistakes,
  saveAllMistakes,
  upsertMistake,
  deleteMistake,
  normalizeMistake
};
