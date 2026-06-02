async function loadNodes() {
  const client = getClient();
  const table = window.APP_CONFIG.TABLE_NAME || "opening_nodes";

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedNodes));
    return seedNodes;
  }

  return JSON.parse(raw).map(normalizeNode);
}
