import { requireOnlyMe } from "./auth/only-me-guard.js";

await requireOnlyMe();

let nodes = [];
let selectedId = null;
let expandedIds = new Set();

const $ = id => document.getElementById(id);
const treeEl = $("tree");
const form = $("moveForm");

const highlightLabels = {
  blunder: "Blunder",
  great: "Great move",
  brilliant: "Brilliant"
};

function children(parentId) {
  return nodes.filter(n => n.parent_id === parentId);
}

function childCount(nodeId) {
  return children(nodeId).length;
}

function descendantsOf(nodeId) {
  return children(nodeId).flatMap(child => [child.id, ...descendantsOf(child.id)]);
}

function closeDescendants(nodeId) {
  descendantsOf(nodeId).forEach(id => expandedIds.delete(id));
}

function toggleExpanded(nodeId) {
  if (!childCount(nodeId)) return;

  if (expandedIds.has(nodeId)) {
    expandedIds.delete(nodeId);
    closeDescendants(nodeId);
  } else {
    expandedIds.add(nodeId);
    closeDescendants(nodeId);
  }
}

function pathFor(node) {
  const path = [];
  let current = node;
  while (current) {
    path.unshift(current.move);
    current = nodes.find(n => n.id === current.parent_id);
  }
  return path.join("  ");
}

function highlightLabel(kind) {
  return highlightLabels[kind] || "";
}

function highlightBadgeHtml(kind) {
  const label = highlightLabel(kind);
  return label ? `<span class="mark-badge mark-${kind}">${label}</span>` : "";
}

function renderStats() {
  $("nodeCount").textContent = nodes.length;
  $("cardCount").textContent = nodes.filter(n => n.is_practice_card).length;
  $("lineCount").textContent = nodes.filter(n => !n.parent_id).length;
}

function renderTreeRows(parentId = null, depth = 0) {
  return children(parentId).flatMap(node => {
    const tags = (node.tags || [])
      .slice(0, 2)
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const count = childCount(node.id);
    const isExpanded = expandedIds.has(node.id);
    const highlight = node.highlight_kind || "";
    const highlightClass = highlight ? ` highlight-${highlight}` : "";

    const row = `
      <div class="tree-node" style="--depth:${depth}">
        <button class="node-button${highlightClass} ${node.id === selectedId ? "active" : ""}" data-id="${node.id}" aria-expanded="${count ? String(isExpanded) : "false"}">
          <span class="node-indent" aria-hidden="true"></span>
          <span class="node-content">
            <span class="node-topline">
              <span class="node-caret" aria-hidden="true">${count ? (isExpanded ? "▾" : "▸") : "•"}</span>
              <strong class="move-san">${escapeHtml(node.move)}</strong>
              ${count ? `<span class="child-count">${count}</span>` : ""}
              ${highlightBadgeHtml(highlight)}
            </span>
            <span class="node-title">${escapeHtml(node.title || "No title yet")}</span>
            ${tags ? `<span class="node-tags">${tags}</span>` : ""}
          </span>
        </button>
      </div>`;

    const childRows = isExpanded ? renderTreeRows(node.id, depth + 1) : [];
    return [row, ...childRows];
  });
}

function renderTree() {
  return renderTreeRows().join("");
}

function paint() {
  treeEl.innerHTML = renderTree() || `<p class="muted">No moves yet. Add your first root.</p>`;
  renderStats();
}

function selectNode(id, shouldPaint = true) {
  selectedId = id;
  const node = nodes.find(n => n.id === id);
  $("editorTitle").textContent = node ? `Editing ${node.move}` : "Select a move";
  $("deleteBtn").disabled = !node;
  $("addChildBtn").disabled = !node;
  $("moveInput").value = node?.move || "";
  $("titleInput").value = node?.title || "";
  $("highlightInput").value = node?.highlight_kind || "";
  $("explanationInput").value = node?.explanation || "";
  $("tagsInput").value = (node?.tags || []).join(", ");
  $("practiceInput").checked = node?.is_practice_card !== false;
  if (shouldPaint) paint();
}

function getFormNode(parentId = null, existingId = null) {
  return {
    id: existingId || crypto.randomUUID(),
    parent_id: parentId,
    move: $("moveInput").value.trim() || "New move",
    title: $("titleInput").value.trim(),
    highlight_kind: $("highlightInput").value,
    explanation: $("explanationInput").value.trim(),
    tags: $("tagsInput").value.split(",").map(t => t.trim()).filter(Boolean),
    is_practice_card: $("practiceInput").checked,
    created_at: nodes.find(n => n.id === existingId)?.created_at || new Date().toISOString()
  };
}

async function refresh() {
  nodes = await OpeningDB.loadNodes();
  expandedIds = new Set([...expandedIds].filter(id => nodes.some(n => n.id === id)));
  paint();
  if (selectedId && nodes.some(n => n.id === selectedId)) selectNode(selectedId);
}

function showRandomCard() {
  const cards = nodes.filter(n => n.is_practice_card);
  const box = $("practiceCard");
  if (!cards.length) {
    box.className = "practice-card empty";
    box.innerHTML = "<p>No practice cards yet. Tick 'Use as random practice card' on some moves.</p>";
    return;
  }
  const node = cards[Math.floor(Math.random() * cards.length)];
  box.className = `practice-card ${node.highlight_kind ? `card-${node.highlight_kind}` : ""}`.trim();
  box.innerHTML = cardHtml(node, true);
}

function cardHtml(node, withExplanation = true) {
  const tags = (node.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
  const highlight = node.highlight_kind || "";
  return `
    <div class="card-move-line">
      <div class="card-move">${escapeHtml(node.move)}</div>
      ${highlightBadgeHtml(highlight)}
    </div>
    <div class="card-title">${escapeHtml(node.title || "Untitled move")}</div>
    <div class="card-path">${escapeHtml(pathFor(node))}</div>
    <div class="card-tags">${tags}</div>
    ${withExplanation ? `<div class="card-explanation">${escapeHtml(node.explanation || "No explanation yet. Future you is waiting, pen in hand.")}</div>` : ""}
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const existing = nodes.find(n => n.id === selectedId);
  const node = getFormNode(existing?.parent_id || null, selectedId || null);
  await OpeningDB.upsertNode(node);
  selectedId = node.id;
  await refresh();
});

treeEl.addEventListener("click", e => {
  const btn = e.target.closest(".node-button");
  if (!btn) return;

  const id = btn.dataset.id;
  toggleExpanded(id);
  selectNode(id);
});

$("newRootBtn").addEventListener("click", () => {
  selectedId = null;
  $("editorTitle").textContent = "New root move";
  $("moveInput").value = "";
  $("titleInput").value = "";
  $("highlightInput").value = "";
  $("explanationInput").value = "";
  $("tagsInput").value = "";
  $("practiceInput").checked = true;
  $("deleteBtn").disabled = true;
  $("addChildBtn").disabled = true;
  paint();
});

$("addChildBtn").addEventListener("click", async () => {
  if (!selectedId) return;

  const parentId = selectedId;
  const child = {
    id: crypto.randomUUID(),
    parent_id: parentId,
    move: "New move",
    title: "",
    highlight_kind: "",
    explanation: "",
    tags: [],
    is_practice_card: true,
    created_at: new Date().toISOString()
  };

  await OpeningDB.upsertNode(child);
  expandedIds.add(parentId);
  selectedId = child.id;
  await refresh();
});

$("deleteBtn").addEventListener("click", async () => {
  if (!selectedId || !confirm("Delete this move and all child lines?")) return;
  await OpeningDB.deleteNodeAndChildren(selectedId);
  expandedIds.delete(selectedId);
  closeDescendants(selectedId);
  selectedId = null;
  await refresh();
});

$("randomBtn").addEventListener("click", showRandomCard);
$("syncBtn").addEventListener("click", refresh);

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(nodes, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gm-opening-tree.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("importInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text).map(OpeningDB.normalizeNode);
  await OpeningDB.saveAllNodes(imported);
  selectedId = null;
  expandedIds.clear();
  await refresh();
});

refresh();
