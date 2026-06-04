const LEGACY_NODE_STORAGE_KEY = "gm_opening_tree_local_v1";
const NODE_STORAGE_KEY = "gm_opening_tree_local_v2";
const REPAIR_STORAGE_KEY = "gm_opening_tree_repairs_v1";

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

function loadLocalNodes() {
  const raw = readLocalJson(NODE_STORAGE_KEY) || readLocalJson(LEGACY_NODE_STORAGE_KEY);

  if (!raw) {
    const cleanSeed = seedNodes.map(normalizeNode);
    writeLocalJson(NODE_STORAGE_KEY, cleanSeed);
    return cleanSeed;
  }

  const clean = raw.map(normalizeNode);
  writeLocalJson(NODE_STORAGE_KEY, clean);
  return clean;
}

function loadLocalRepairs() {
  const raw = readLocalJson(REPAIR_STORAGE_KEY) || [];
  const clean = raw.map(normalizeRepairItem);
  writeLocalJson(REPAIR_STORAGE_KEY, clean);
  return clean;
}

function describeError(error) {
  return `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
}

function isMissingColumnError(error, columnName) {
  const text = describeError(error);
  return text.includes(columnName.toLowerCase()) || (text.includes("column") && text.includes("schema cache"));
}

function isMissingTableError(error, tableName) {
  const text = describeError(error);
  return text.includes(tableName.toLowerCase()) || text.includes("does not exist") || text.includes("relation");
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

async function loadNodes() {
  const client = getClient();
  const table = window.APP_CONFIG?.TABLE_NAME || "opening_nodes";

  if (client) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase load failed:", error);
      throw error;
    }

    const clean = (data || []).map(normalizeNode);
    writeLocalJson(NODE_STORAGE_KEY, clean);
    return clean;
  }

  return loadLocalNodes();
}

async function saveAllNodes(nodes) {
  const clean = nodes.map(normalizeNode);
  writeLocalJson(NODE_STORAGE_KEY, clean);

  const client = getClient();
  const table = window.APP_CONFIG?.TABLE_NAME || "opening_nodes";

  if (!client) return clean;

  const support = await openingNodeSupport(client, table);
  const rows = clean.map(node => stripUnsupportedNodeFields(node, support));

  const { error: deleteError } = await client
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    console.error("Supabase delete failed:", deleteError);
    throw deleteError;
  }

  if (rows.length) {
    const { error: insertError } = await client.from(table).insert(rows);

    if (insertError) {
      console.error("Supabase insert failed:", insertError);
      throw insertError;
    }
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

  await saveAllNodes(kept);

  const repairs = await loadRepairItems();
  const filteredRepairs = repairs.map(repair =>
    removeIds.has(repair.related_node_id)
      ? { ...repair, related_node_id: null }
      : repair
  );
  await saveAllRepairItems(filteredRepairs);

  return kept;
}

async function loadRepairItems() {
  const client = getClient();
  const table = window.APP_CONFIG?.REPAIR_TABLE_NAME || "repair_items";

  if (client && await repairTableAvailable(client, table)) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase repair load failed:", error);
      throw error;
    }

    const clean = (data || []).map(normalizeRepairItem);
    writeLocalJson(REPAIR_STORAGE_KEY, clean);
    return clean;
  }

  return loadLocalRepairs();
}

async function saveAllRepairItems(items) {
  const clean = items.map(normalizeRepairItem);
  writeLocalJson(REPAIR_STORAGE_KEY, clean);

  const client = getClient();
  const table = window.APP_CONFIG?.REPAIR_TABLE_NAME || "repair_items";

  if (!client || !(await repairTableAvailable(client, table))) {
    return clean;
  }

  const { error: deleteError } = await client
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    console.error("Supabase repair delete failed:", deleteError);
    throw deleteError;
  }

  if (clean.length) {
    const { error: insertError } = await client.from(table).insert(clean);
    if (insertError) {
      console.error("Supabase repair insert failed:", insertError);
      throw insertError;
    }
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
  await saveAllRepairItems(kept);
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
