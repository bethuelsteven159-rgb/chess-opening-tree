let nodes = [];
let current = null;
let revealed = false;
const $ = id => document.getElementById(id);

function pathFor(node) {
  const path = [];
  let currentNode = node;
  while (currentNode) {
    path.unshift(currentNode.move);
    currentNode = nodes.find(n => n.id === currentNode.parent_id);
  }
  return path.join("  ");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

function cardHtml(node) {
  const tags = (node.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
  return `
    <div class="card-move">${escapeHtml(node.move)}</div>
    <div class="card-title">${escapeHtml(node.title || "Untitled move")}</div>
    <div class="card-path">${escapeHtml(pathFor(node))}</div>
    <div class="card-tags">${tags}</div>
    <div class="card-explanation">${escapeHtml(node.explanation || "No explanation yet. Add one from the main tree.")}</div>
  `;
}

function drawCard() {
  const cards = nodes.filter(n => n.is_practice_card);
  const box = $("randomCard");
  if (!cards.length) {
    box.className = "practice-card big empty";
    box.innerHTML = "<p>No practice cards yet. Go to the tree and mark moves as practice cards.</p>";
    return;
  }
  current = cards[Math.floor(Math.random() * cards.length)];
  revealed = false;
  box.className = "practice-card big hidden";
  box.innerHTML = cardHtml(current);
  $("revealBtn").textContent = "Reveal explanation";
}

$("revealBtn").addEventListener("click", () => {
  if (!current) return;
  revealed = !revealed;
  $("randomCard").className = revealed ? "practice-card big" : "practice-card big hidden";
  $("revealBtn").textContent = revealed ? "Hide explanation" : "Reveal explanation";
});

$("anotherBtn").addEventListener("click", drawCard);

OpeningDB.loadNodes().then(data => {
  nodes = data;
  drawCard();
});
