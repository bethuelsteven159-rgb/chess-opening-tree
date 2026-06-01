const STORAGE_KEY = "roadToGmOpeningTree.v1";
let selectedId = null;
let currentCard = null;

const starterData = [
  {
    id: crypto.randomUUID(), title: "White Repertoire: 1.e4", move: "1.e4", idea: "Claim the centre and invite open, classical positions that train calculation and initiative.", plans: "Develop quickly, castle, fight for d4, and keep central tension when possible.", traps: "Do not autopilot. Always check opponent threats after ...Bc5, ...Nf6, ...d5, or Sicilian counterplay.", models: "Add Italian/Scotch model games here.", children: [
      { id: crypto.randomUUID(), title: "Italian Game", move: "2.Nf3 3.Bc4", idea: "Fast development with pressure on f7 and flexible central play.", plans: "c3 and d4 when ready, castle early, Re1, Nbd2-f1-g3 in quiet lines.", traps: "Ng5 ideas can work, but do not chase tactics without calculating ...d5 resources.", models: "Add Giuoco Piano model games.", children: [] },
      { id: crypto.randomUUID(), title: "Scotch-type structure", move: "3.d4", idea: "Open the centre early and force concrete calculation.", plans: "Exchange in the centre, develop pieces actively, use open files.", traps: "Watch queen exposure and early tactical shots on e4/c2.", models: "Add Scotch model games.", children: [] },
      { id: crypto.randomUUID(), title: "Simple Anti-Sicilian", move: "vs 1...c5", idea: "Use a practical system while slowly graduating toward main lines.", plans: "Choose one setup, learn pawn breaks, and collect your own games.", traps: "Do not play random anti-Sicilians every week. One system, ten serious games minimum.", models: "Add games versus Sicilian.", children: [] }
    ]
  },
  {
    id: crypto.randomUUID(), title: "Black vs 1.e4", move: "1...e5 / Caro-Kann", idea: "Choose a foundation: 1...e5 for classical learning or Caro-Kann for stability.", plans: "If 1...e5: develop naturally and contest the centre. If Caro-Kann: strike with ...d5 and build solid structure.", traps: "Do not switch after one painful loss. Gather evidence over serious games.", models: "Add black model games.", children: [
      { id: crypto.randomUUID(), title: "Open Games", move: "1.e4 e5", idea: "Maximum learning: development, central tension, initiative, tactics.", plans: "Nf6/Nc6, active pieces, castle, challenge centre.", traps: "Know basic Italian, Scotch, Vienna and King's Gambit safety rules.", models: "Add games.", children: [] },
      { id: crypto.randomUUID(), title: "Caro-Kann", move: "1.e4 c6", idea: "A stable response that reduces memorisation pressure while teaching structure.", plans: "...d5, light-square bishop development, solid pawn chain, timely ...c5 or ...e5 breaks.", traps: "Avoid passive piece placement. Stability is not sleeping chess.", models: "Add Caro-Kann games.", children: [] }
    ]
  },
  {
    id: crypto.randomUUID(), title: "Black vs 1.d4", move: "QGD / Slav", idea: "Solid educational structures: central tension, minority attacks, piece coordination.", plans: "Develop smoothly, understand ...c5/...e5 breaks, learn Carlsbad and Slav structures.", traps: "Do not memorize without knowing which pawn break you are playing for.", models: "Add QGD/Slav model games.", children: [
      { id: crypto.randomUUID(), title: "Queen's Gambit Declined", move: "1.d4 d5 2.c4 e6", idea: "A classical structure for learning tension and defence.", plans: "...Nf6, ...Be7, castle, ...c5 break or minority-attack defence.", traps: "Bad light-square bishop problems if you play too passively.", models: "Add QGD games.", children: [] },
      { id: crypto.randomUUID(), title: "Slav-style setup", move: "1.d4 d5 2.c4 c6", idea: "Solid centre with a healthier light-square bishop.", plans: "Develop bishop before ...e6 where possible, strike with ...c5/e5 later.", traps: "Watch early e4 attempts and queen-side tactical themes.", models: "Add Slav games.", children: [] }
    ]
  }
];

let data = load();

function load(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(!saved) return starterData;
  try { return JSON.parse(saved); } catch { return starterData; }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); render(); }
function allNodes(nodes=data, arr=[]){ nodes.forEach(n => { arr.push(n); allNodes(n.children || [], arr); }); return arr; }
function findNode(id, nodes=data){ for(const n of nodes){ if(n.id===id) return n; const found=findNode(id,n.children||[]); if(found) return found; } }
function removeNode(id, nodes=data){ const i=nodes.findIndex(n=>n.id===id); if(i>=0){ nodes.splice(i,1); return true; } return nodes.some(n=>removeNode(id,n.children||[])); }
function escapeHtml(s=""){ return s.replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch])); }

function render(){
  renderStats();
  renderTree();
  renderEditor();
}
function renderStats(){
  const nodes = allNodes();
  const studied = nodes.filter(n => (n.idea||n.plans||n.traps||n.models)?.trim()).length;
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${nodes.length}</b><span>moves / branches</span></div>
    <div class="stat"><b>${studied}</b><span>with notes</span></div>
    <div class="stat"><b>${nodes.filter(n=>n.children?.length).length}</b><span>branch points</span></div>`;
}
function renderTree(){
  const q = document.getElementById("searchInput").value.toLowerCase();
  document.getElementById("tree").innerHTML = renderNodes(data, q);
  document.querySelectorAll(".node-btn").forEach(btn => btn.addEventListener("click", () => { selectedId = btn.dataset.id; render(); }));
}
function match(n,q){ return !q || [n.title,n.move,n.idea,n.plans,n.traps,n.models].join(" ").toLowerCase().includes(q) || (n.children||[]).some(c=>match(c,q)); }
function renderNodes(nodes,q){
  return nodes.filter(n=>match(n,q)).map(n => `
    <div class="node">
      <button class="node-btn ${selectedId===n.id?'active':''}" data-id="${n.id}">
        <div class="node-title"><span>${escapeHtml(n.title)}</span>${n.move?`<span class="move-pill">${escapeHtml(n.move)}</span>`:""}</div>
        ${n.idea?`<div class="node-idea">${escapeHtml(n.idea).slice(0,105)}${n.idea.length>105?'…':''}</div>`:""}
      </button>
      ${n.children?.length?`<div class="children">${renderNodes(n.children,q)}</div>`:""}
    </div>`).join("");
}
function renderEditor(){
  const n = findNode(selectedId);
  document.getElementById("emptyState").classList.toggle("hidden", !!n);
  document.getElementById("editor").classList.toggle("hidden", !n);
  document.getElementById("deleteNodeBtn").disabled = !n;
  if(!n) return;
  nodeTitle.value=n.title||""; nodeMove.value=n.move||""; nodeIdea.value=n.idea||""; nodePlans.value=n.plans||""; nodeTraps.value=n.traps||""; nodeModels.value=n.models||"";
}

newRootBtn.onclick = () => openDialog("Add opening", null);
addChildBtn.onclick = () => openDialog("Add reply / next move", selectedId);
function openDialog(title,parentId){
  dialogTitle.textContent = title; dialogName.value=""; dialogMove.value="";
  nodeDialog.showModal();
  nodeForm.onsubmit = e => {
    e.preventDefault();
    const node = { id: crypto.randomUUID(), title: dialogName.value.trim(), move: dialogMove.value.trim(), idea:"", plans:"", traps:"", models:"", children:[] };
    if(parentId) findNode(parentId).children.push(node); else data.push(node);
    selectedId = node.id; nodeDialog.close(); save();
  };
}
editor.onsubmit = e => {
  e.preventDefault();
  const n = findNode(selectedId); if(!n) return;
  Object.assign(n,{title:nodeTitle.value, move:nodeMove.value, idea:nodeIdea.value, plans:nodePlans.value, traps:nodeTraps.value, models:nodeModels.value});
  save();
};
deleteNodeBtn.onclick = () => { if(selectedId && confirm("Delete this branch and all children?")){ removeNode(selectedId); selectedId=null; save(); }};
searchInput.oninput = renderTree;
resetBtn.onclick = () => { if(confirm("Reset to the starter GM-path repertoire?")){ localStorage.removeItem(STORAGE_KEY); data = structuredClone(starterData); selectedId=null; save(); }};
exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "opening-tree-repertoire.json"; a.click(); URL.revokeObjectURL(a.href);
};
importFile.onchange = async e => {
  const file=e.target.files[0]; if(!file) return;
  try{ data = JSON.parse(await file.text()); selectedId=null; save(); } catch { alert("That JSON file could not be imported."); }
};
randomBtn.onclick = () => {
  const pool = allNodes().filter(n => n.move || n.idea || n.plans || n.traps);
  currentCard = pool[Math.floor(Math.random()*pool.length)];
  answerBox.classList.add("hidden");
  practiceCard.innerHTML = `<p class="card-label">Recall drill</p><h3>${escapeHtml(currentCard.move || currentCard.title)}</h3><p>What is the idea, plan, and danger behind this move?</p>`;
};
showAnswerBtn.onclick = () => {
  if(!currentCard) randomBtn.click();
  answerBox.classList.remove("hidden");
  answerBox.innerHTML = `<b>${escapeHtml(currentCard.title)}</b><br><br><b>Idea:</b> ${escapeHtml(currentCard.idea||"Add your explanation.")}<br><br><b>Plans:</b> ${escapeHtml(currentCard.plans||"Add plans.")}<br><br><b>Traps:</b> ${escapeHtml(currentCard.traps||"Add warnings.")}`;
};
markKnowBtn.onclick = () => flash("Good. Now explain it without looking next time.");
markMissBtn.onclick = () => flash("Good data. Add or sharpen the note, then drill it again.");
function flash(msg){ answerBox.classList.remove("hidden"); answerBox.textContent = msg; }

render();
