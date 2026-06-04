import { requireOnlyMe } from "./auth/only-me-guard.js";

await requireOnlyMe();

let nodes = [];
let selectedId = null;

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

function nodeById(id) {
  return nodes.find(n => n.id === id) || null;
}

function currentNode() {
  return selectedId ? nodeById(selectedId) : null;
}

function pathNodesFor(node) {
  const path = [];
  let current = node;
  while (current) {
    path.unshift(current);
    current = nodeById(current.parent_id);
  }
  return path;
}

function pathFor(node) {
  return pathNodesFor(node).map(n => n.move).join("  ");
}

function visibleChoices() {
  return children(selectedId || null);
}

function highlightLabel(kind) {
  return highlightLabels[kind] || "";
}

function highlightBadgeHtml(kind) {
  const label = highlightLabel(kind);
  return label ? `<span class="mark-badge mark-${kind}">${label}</span>` : "";
}

function splitMoveParts(moveText) {
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

function addMilliseconds(dateText, amount) {
  const base = Date.parse(dateText || "");
  const date = Number.isFinite(base) ? new Date(base + amount) : new Date(Date.now() + amount);
  return date.toISOString();
}

function migrateSplitCompoundMoves(sourceNodes) {
  const cleanNodes = sourceNodes.map(OpeningDB.normalizeNode);
  const migrated = [];
  let splitNodeCount = 0;
  let addedNodeCount = 0;

  const childrenOf = parentId => cleanNodes.filter(node => node.parent_id === parentId);

  function cloneForPart(original, part, id, parentId, partIndex) {
    return {
      ...original,
      id,
      parent_id: parentId,
      move: part,
      title: original.title || "",
      explanation: original.explanation || "",
      highlight_kind: original.highlight_kind || "",
      tags: [...(original.tags || [])],
      is_practice_card: original.is_practice_card !== false,
      created_at: addMilliseconds(original.created_at, partIndex)
    };
  }

  function visit(node, newParentId) {
    const parts = splitMoveParts(node.move);
    let currentParentId = newParentId;
    let lastId = node.id;

    if (parts.length > 1) {
      splitNodeCount += 1;
      addedNodeCount += parts.length - 1;
    }

    parts.forEach((part, partIndex) => {
      const id = partIndex === 0 ? node.id : crypto.randomUUID();
      const newNode = cloneForPart(node, part, id, currentParentId, partIndex);
      migrated.push(newNode);
      currentParentId = id;
      lastId = id;
    });

    childrenOf(node.id).forEach(child => visit(child, lastId));
  }

  childrenOf(null).forEach(root => visit(root, null));

  return { migrated, splitNodeCount, addedNodeCount };
}

async function splitCompoundMovesOnce() {
  const answer = confirm(
    "This will split moves like '1... e5 2.Nf3' into separate child moves.\n\n" +
    "Please export a JSON backup first. Continue now?"
  );

  if (!answer) return;

  const currentNodes = await OpeningDB.loadNodes();
  const { migrated, splitNodeCount, addedNodeCount } = migrateSplitCompoundMoves(currentNodes);

  if (!splitNodeCount) {
    alert("No compound moves were found. Nothing changed.");
    return;
  }

  await OpeningDB.saveAllNodes(migrated);
  selectedId = null;
  await refresh();

  alert(`Done. Split ${splitNodeCount} move cell(s) and created ${addedNodeCount} extra child node(s).`);
}

function renderStats() {
  $("nodeCount").textContent = nodes.length;
  $("cardCount").textContent = nodes.filter(n => n.is_practice_card).length;
  $("lineCount").textContent = nodes.filter(n => !n.parent_id).length;
}

function renderBreadcrumb(path) {
  if (!path.length) {
    return `<div class="line-empty">Choose a root move to start exploring your repertoire.</div>`;
  }

  return path.map((node, index) => {
    const active = node.id === selectedId ? "active" : "";
    return `
      <button class="line-chip ${active}" data-id="${node.id}" title="Jump back to this move">
        <span>${escapeHtml(node.move)}</span>
        ${highlightBadgeHtml(node.highlight_kind || "")}
      </button>`;
  }).join("");
}

function renderChoices() {
  const current = currentNode();
  const choices = visibleChoices();
  const heading = current ? "Next moves from this position" : "Root moves";

  const rows = choices.map((node, index) => {
    const tags = (node.tags || [])
      .slice(0, 3)
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const count = childCount(node.id);
    const highlight = node.highlight_kind || "";
    const highlightClass = highlight ? ` highlight-${highlight}` : "";
    const altClass = index % 2 === 0 ? "choice-a" : "choice-b";

    return `
      <button class="choice-card ${altClass}${highlightClass}" data-id="${node.id}">
        <span class="choice-index">${index + 1}</span>
        <span class="choice-main">
          <span class="choice-topline">
            <strong class="move-san">${escapeHtml(node.move)}</strong>
            ${count ? `<span class="child-count">${count}</span>` : ""}
            ${highlightBadgeHtml(highlight)}
          </span>
          <span class="node-title">${escapeHtml(node.title || "No title yet")}</span>
          ${tags ? `<span class="node-tags">${tags}</span>` : ""}
        </span>
      </button>`;
  }).join("");

  return `
    <section class="line-view">
      <div class="line-block">
        <div class="line-label">Current line</div>
        <div class="line-strip">${renderBreadcrumb(current ? pathNodesFor(current) : [])}</div>
      </div>

      <div class="line-tools">
        <button id="backLineBtn" class="tiny secondary" ${current ? "" : "disabled"}>← Back one move</button>
        <button id="rootLineBtn" class="tiny secondary" ${current ? "" : "disabled"}>Root view</button>
      </div>

      <div class="choice-heading">
        <h4>${heading}</h4>
        <span>${choices.length} option${choices.length === 1 ? "" : "s"}</span>
      </div>

      <div class="choice-list">
        ${rows || `<p class="muted">No child moves here yet. Add a child move from the editor.</p>`}
      </div>
    </section>`;
}

function paint() {
  treeEl.innerHTML = renderChoices();
  renderStats();
}

function selectNode(id, shouldPaint = true) {
  selectedId = id;
  const node = nodeById(id);
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

function resetEditorForNewRoot() {
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
  if (selectedId && !nodes.some(n => n.id === selectedId)) selectedId = null;
  paint();
  if (selectedId) selectNode(selectedId, false);
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
  const existing = nodeById(selectedId);
  const node = getFormNode(existing?.parent_id || null, selectedId || null);
  await OpeningDB.upsertNode(node);
  selectedId = node.id;
  await refresh();
});

treeEl.addEventListener("click", e => {
  const chip = e.target.closest(".line-chip");
  if (chip) {
    selectNode(chip.dataset.id);
    return;
  }

  const choice = e.target.closest(".choice-card");
  if (choice) {
    selectNode(choice.dataset.id);
    return;
  }

  if (e.target.closest("#backLineBtn")) {
    const current = currentNode();
    selectedId = current?.parent_id || null;
    if (selectedId) selectNode(selectedId);
    else {
      $("editorTitle").textContent = "Select a move";
      $("deleteBtn").disabled = true;
      $("addChildBtn").disabled = true;
      paint();
    }
    return;
  }

  if (e.target.closest("#rootLineBtn")) {
    selectedId = null;
    $("editorTitle").textContent = "Select a move";
    $("deleteBtn").disabled = true;
    $("addChildBtn").disabled = true;
    paint();
  }
});

$("newRootBtn").addEventListener("click", resetEditorForNewRoot);

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
  selectedId = child.id;
  await refresh();
});

$("deleteBtn").addEventListener("click", async () => {
  if (!selectedId || !confirm("Delete this move and all child lines?")) return;
  const deleted = selectedId;
  const deletedNode = nodeById(deleted);
  selectedId = deletedNode?.parent_id || null;
  await OpeningDB.deleteNodeAndChildren(deleted);
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

$("splitCompoundBtn")?.addEventListener("click", splitCompoundMovesOnce);

$("importInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text).map(OpeningDB.normalizeNode);
  await OpeningDB.saveAllNodes(imported);
  selectedId = null;
  await refresh();
});

refresh();
