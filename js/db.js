const STORAGE_KEY = "gm_opening_tree_local_v1";

const seedNodes = [
  {
    id: crypto.randomUUID(), parent_id: null, move: "1.e4", title: "King's Pawn Opening",
    explanation: "Claim the center, open lines for the queen and bishop, and invite open tactical games. This is the foundation choice for learning initiative and calculation.",
    tags: ["White", "center", "classical"], is_practice_card: true
  },
  {
    id: crypto.randomUUID(), parent_id: null, move: "1...e5", title: "Open Game vs 1.e4",
    explanation: "Meet central control with central control. Learn classical development, king safety, and direct piece activity.",
    tags: ["Black", "1.e4", "classical"], is_practice_card: true
  },
  {
    id: crypto.randomUUID(), parent_id: null, move: "1...d5", title: "Queen's Gambit Declined / Slav family",
    explanation: "A solid answer to 1.d4 structures. Focus on central tension, minority attacks, and clean piece coordination.",
    tags: ["Black", "1.d4", "structure"], is_practice_card: true
  }
];
seedNodes.push(
  { id: crypto.randomUUID(), parent_id: seedNodes[0].id, move: "2.Nf3", title: "Develop and attack e5", explanation: "Develop with tempo against e5 ideas. Prepare quick castling and keep the center flexible.", tags: ["development"], is_practice_card: true },
  { id: crypto.randomUUID(), parent_id: seedNodes[0].id, move: "2.Bc4", title: "Italian setup idea", explanation: "The bishop eyes f7 and supports fast development. Plans often include c3-d4, Re1, and calm pressure instead of cheap tricks.", tags: ["Italian", "bishop"], is_practice_card: true },
  { id: crypto.randomUUID(), parent_id: seedNodes[1].id, move: "2.Nf3", title: "Allow classical open games", explanation: "Expect Italian, Scotch, or Ruy Lopez structures. Do not fear theory. Use these games to train calculation.", tags: ["open games"], is_practice_card: true },
  { id: crypto.randomUUID(), parent_id: seedNodes[2].id, move: "2.c4", title: "Queen's Gambit structures", explanation: "Fight for the center from the side. Learn when to hold, release, or challenge central tension.", tags: ["QGD", "Slav"], is_practice_card: true }
);

function getClient() {
  const cfg = window.APP_CONFIG || {};
  const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("PASTE_") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  if (!ready || !window.supabase) return null;
  return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}

function normalizeNode(node) {
  return {
    id: node.id || crypto.randomUUID(),
    parent_id: node.parent_id || null,
    move: node.move || "New move",
    title: node.title || "",
    explanation: node.explanation || "",
    tags: Array.isArray(node.tags) ? node.tags : [],
    is_practice_card: node.is_practice_card !== false,
    created_at: node.created_at || new Date().toISOString()
  };
}

async function loadNodes() {
  const client = getClient();
  const table = window.APP_CONFIG.TABLE_NAME;
  if (client) {
    const { data, error } = await client.from(table).select("*").order("created_at", { ascending: true });
    if (!error && data && data.length) return data.map(normalizeNode);
    if (!error && data && data.length === 0) {
      await saveAllNodes(seedNodes);
      return seedNodes;
    }
    console.warn("Supabase load failed, using local storage:", error);
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedNodes));
    return seedNodes;
  }
  return JSON.parse(raw).map(normalizeNode);
}

async function saveAllNodes(nodes) {
  const clean = nodes.map(normalizeNode);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  const client = getClient();
  if (!client) return clean;
  const table = window.APP_CONFIG.TABLE_NAME;
  const { error: deleteError } = await client.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) throw deleteError;
  if (clean.length) {
    const { error: insertError } = await client.from(table).insert(clean);
    if (insertError) throw insertError;
  }
  return clean;
}

async function upsertNode(node) {
  const nodes = await loadNodes();
  const clean = normalizeNode(node);
  const index = nodes.findIndex(n => n.id === clean.id);
  if (index >= 0) nodes[index] = clean; else nodes.push(clean);
  await saveAllNodes(nodes);
  return clean;
}

async function deleteNodeAndChildren(id) {
  const nodes = await loadNodes();
  const childrenOf = parentId => nodes.filter(n => n.parent_id === parentId).flatMap(n => [n.id, ...childrenOf(n.id)]);
  const removeIds = new Set([id, ...childrenOf(id)]);
  const kept = nodes.filter(n => !removeIds.has(n.id));
  await saveAllNodes(kept);
  return kept;
}

window.OpeningDB = { loadNodes, saveAllNodes, upsertNode, deleteNodeAndChildren, normalizeNode };
