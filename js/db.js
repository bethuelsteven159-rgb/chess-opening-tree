const LEGACY_NODE_STORAGE_KEY = "gm_opening_tree_local_v1";
const NODE_STORAGE_KEY = "gm_opening_tree_local_v2";
const REPAIR_STORAGE_KEY = "gm_opening_tree_repairs_v1";
const NODE_SNAPSHOT_KEY = "gm_opening_tree_local_snapshot_v1";
const REPAIR_SNAPSHOT_KEY = "gm_opening_tree_repairs_snapshot_v1";
const PENDING_NODE_SYNC_KEY = "gm_opening_tree_nodes_pending_sync_v1";
const PENDING_REPAIR_SYNC_KEY = "gm_opening_tree_repairs_pending_sync_v1";

const supportCache = new Map();

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

function loadPendingNodes() {
  return readStoredArray(PENDING_NODE_SYNC_KEY, normalizeNode);
}

function loadPendingRepairs() {
  return readStoredArray(PENDING_REPAIR_SYNC_KEY, normalizeRepairItem);
}

function hasPendingNodes() {
  return hasLocalJson(PENDING_NODE_SYNC_KEY);
}

function hasPendingRepairs() {
  return hasLocalJson(PENDING_REPAIR_SYNC_KEY);
}

function markPendingNodes(nodes) {
  writeLocalJson(PENDING_NODE_SYNC_KEY, nodes);
}

function markPendingRepairs(items) {
  writeLocalJson(PENDING_REPAIR_SYNC_KEY, items);
}

function clearPendingNodes() {
  clearLocalJson(PENDING_NODE_SYNC_KEY);
}

function clearPendingRepairs() {
  clearLocalJson(PENDING_REPAIR_SYNC_KEY);
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

async function repairTableAvailable(client, table) {
  const cacheKey = `table:${table}`;
  if (supportCache.has(cacheKey)) return supportCache.get(cacheKey);

  const { error } = await client.from(table).select("id").limit(1);

  if (!error) {
    supportCache.set(cacheKey, true);
    return true;
  }

  if (isMissingTableError(error, table)) {
    console.warn(`Supabase table ${table} does not exist yet. Repairs will stay in localStorage until you run the updated supabase/schema.sql.`);
    supportCache.set(cacheKey, false);
    return false;
  }

  throw error;
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
  normalizeRepairItem
};
