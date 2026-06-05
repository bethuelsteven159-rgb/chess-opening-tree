import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.GM_SUPABASE_URL || "https://puhscovkftoffykeyzze.supabase.co";
const SUPABASE_ANON_KEY = process.env.GM_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1aHNjb3ZrZnRvZmZ5a2V5enplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDI3NDEsImV4cCI6MjA5NTkxODc0MX0.N1vUdm7UhPxc9KqGRIutgOEqy8PBTyv529rsA4uGwCE";
const TABLE_NAME = process.env.GM_TABLE_NAME || "opening_nodes";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileArg = args.find(arg => !arg.startsWith("--"));
const sourcePath = fileArg || path.join("scripts", "data", "white-handwritten-lines-2026-06-05.json");

function normalizeMove(rawMove) {
  return String(rawMove || "")
    .trim()
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/\((.*?)\)/g, "")
    .replace(/[!?]+/g, "")
    .replace(/\s+/g, "")
    .replace(/^\.\.\./, "")
    .trim();
}

function isBlackMove(move) {
  return move.includes("...");
}

function mergeTags(...tagLists) {
  return [...new Set(
    tagLists
      .flat()
      .map(tag => String(tag || "").trim())
      .filter(Boolean)
  )];
}

function nodeKey(parentId, move) {
  return `${parentId || "root"}::${normalizeMove(move)}`;
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${options.method || "GET"} ${endpoint} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function loadRemoteNodes() {
  const rows = await request(`${TABLE_NAME}?select=*`);
  return Array.isArray(rows) ? rows : [];
}

async function insertNode(row) {
  const result = await request(TABLE_NAME, {
    method: "POST",
    body: JSON.stringify(row)
  });
  return Array.isArray(result) ? result[0] : result;
}

async function updateNode(id, patch) {
  const result = await request(`${TABLE_NAME}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return Array.isArray(result) ? result[0] : result;
}

function buildMetadataMap(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const normalizedPath = Array.isArray(entry.path) ? entry.path.map(normalizeMove).join("|") : "";
    if (!normalizedPath) continue;
    map.set(normalizedPath, entry);
  }
  return map;
}

async function main() {
  const raw = await fs.readFile(sourcePath, "utf8");
  const payload = JSON.parse(raw);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const defaultTags = Array.isArray(payload.defaultTags) ? payload.defaultTags : [];
  const preferredColor = payload.preferredColor === "b" ? "b" : "w";
  const metadataByPath = buildMetadataMap(payload.nodeMetadata);

  const remoteNodes = await loadRemoteNodes();
  const byKey = new Map(remoteNodes.map(node => [nodeKey(node.parent_id, node.move), node]));
  const bulkInsertMode = apply && remoteNodes.length === 0;
  const pendingBulkInsert = [];

  let created = 0;
  let updated = 0;

  for (const line of lines) {
    let parentId = null;
    const pathMoves = [];

    for (let index = 0; index < line.moves.length; index += 1) {
      const move = normalizeMove(line.moves[index]);
      if (!move) continue;

      pathMoves.push(move);
      const pathKey = pathMoves.join("|");
      const metadata = metadataByPath.get(pathKey) || {};
      const moveColor = isBlackMove(move) ? "b" : "w";
      const shouldPrefer = moveColor === preferredColor;
      const mergedTags = mergeTags(defaultTags, line.tags, metadata.tags);
      const existing = byKey.get(nodeKey(parentId, move));

      if (existing) {
        const patch = {};
        const nextTags = mergeTags(existing.tags, mergedTags);

        if (shouldPrefer && existing.is_preferred !== true) patch.is_preferred = true;
        if (existing.exclude_from_training === true) {
          patch.exclude_from_training = false;
          patch.is_practice_card = true;
        }
        if (!existing.title && metadata.title) patch.title = metadata.title;
        if (!existing.title && index === line.moves.length - 1 && line.name) patch.title = line.name;
        if (JSON.stringify(existing.tags || []) !== JSON.stringify(nextTags)) patch.tags = nextTags;

        if (Object.keys(patch).length) {
          let saved;
          if (bulkInsertMode) {
            Object.assign(existing, patch);
            saved = existing;
          } else if (apply) {
            saved = await updateNode(existing.id, patch);
          } else {
            saved = { ...existing, ...patch };
          }

          byKey.set(nodeKey(parentId, move), saved);
          updated += 1;
          parentId = saved.id;
        } else {
          parentId = existing.id;
        }
        continue;
      }

      const row = {
        id: bulkInsertMode ? crypto.randomUUID() : undefined,
        parent_id: parentId,
        move,
        title: metadata.title || (index === line.moves.length - 1 ? line.name || "" : ""),
        explanation: "",
        highlight_kind: "",
        tags: mergedTags,
        exclude_from_training: false,
        is_practice_card: true,
        is_preferred: shouldPrefer
      };

      const payloadRow = { ...row };
      if (!payloadRow.id) delete payloadRow.id;

      let saved;
      if (bulkInsertMode) {
        saved = payloadRow;
        pendingBulkInsert.push(saved);
      } else if (apply) {
        saved = await insertNode(payloadRow);
      } else {
        saved = { ...payloadRow, id: `dry-run-${created + 1}` };
      }

      byKey.set(nodeKey(parentId, move), saved);
      parentId = saved.id;
      created += 1;
    }
  }

  if (bulkInsertMode && pendingBulkInsert.length) {
    await request(TABLE_NAME, {
      method: "POST",
      body: JSON.stringify(pendingBulkInsert)
    });
  }

  const summary = {
    source: payload.source || sourcePath,
    apply,
    lines: lines.length,
    remoteBefore: remoteNodes.length,
    created,
    updated
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
