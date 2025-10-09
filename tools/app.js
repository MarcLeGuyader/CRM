// --- Données démo (remplace par ta propre liste si tu veux)
const DEMO_PATHS = [
  "index.html",
  "styles.css",
  "app.js",
  "modules/opportunity-table/opportunity-table.js",
  "modules/dialogs/dialogs.js",
  "assets/logo.png",
  "README.md",
  "tools/deploy.html",
  "tools/cleaner.js",
  "tools/bundle.js"
];

const $ = s => document.querySelector(s);
const treeEl = $("#tree");
const selCountEl = $("#sel-count");

const state = {
  root: null,
  selection: new Set(), // chemins fichiers cochés
  filter: ""
};

// ---- Construction hiérarchique à partir des chemins
function buildHierarchy(paths){
  const root = { name:"/", path:"", type:"dir", open:true, children:new Map(), checked:false, ind:false };
  for(const p of paths){
    const parts = p.split("/");
    let cur = root;
    for(let i=0;i<parts.length;i++){
      const name = parts[i];
      const atEnd = i === parts.length - 1;
      if(atEnd){
        cur.children.set(name, {
          name, path: (cur.path?cur.path+"/":"")+name,
          type:"file", checked:false, ind:false
        });
      }else{
        if(!cur.children.has(name)){
          cur.children.set(name, {
            name, path:(cur.path?cur.path+"/":"")+name,
            type:"dir", open:true, children:new Map(),
            checked:false, ind:false
          });
        }
        cur = cur.children.get(name);
      }
    }
  }
  return root;
}

// ---- Rendu avec tri-state (3 états)
function renderTree(root, container){
  container.innerHTML = "";
  const ul = document.createElement("ul");
  ul.className = "branch";

  const filter = (state.filter||"").trim().toLowerCase();

  function nodeRow(n){
    // Filtrage simple : si un fichier ne matche pas et qu'aucun enfant ne matche → on masque
    if(filter){
      const matchesSelf = (n.path||"").toLowerCase().includes(filter) || (n.name||"").toLowerCase().includes(filter);
      let hasMatchInChildren = false;
      if(n.type==="dir" && n.children){
        for(const c of n.children.values()){
          if(((c.path||"") + "/" + (c.name||"")).toLowerCase().includes(filter)){ hasMatchInChildren = true; break; }
        }
      }
      if(!matchesSelf && !hasMatchInChildren && n.type==="file") return null;
    }

    const li = document.createElement("li");
    const row = document.createElement("div"); row.className = "node";

    const toggle = document.createElement("span");
    toggle.className = "toggle";
    toggle.textContent = n.type==="dir" ? (n.open?"▼":"►") : "•";
    if(n.type==="dir"){
      toggle.addEventListener("click", ()=>{ n.open = !n.open; renderTree(root, container); });
    }

    const cb = document.createElement("input"); cb.type="checkbox";
    cb.checked = !!n.checked; cb.indeterminate = !!n.ind;
    cb.addEventListener("change", ()=>{
      setNodeChecked(n, cb.checked);
      refreshTriState(root);
      renderTree(root, container);
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "name " + (n.type==="dir" ? "folder" : "file");
    nameSpan.textContent = n.name || "/";
    nameSpan.style.display = "block"; // ceinture-bretelles iPad

    row.append(toggle, cb, nameSpan);
    li.appendChild(row);

    if(n.type==="dir" && n.open && n.children && n.children.size){
      const childUl = document.createElement("ul"); childUl.className = "branch";
      const sorted = Array.from(n.children.values())
        .sort((a,b)=> (a.type===b.type ? a.name.localeCompare(b.name) : (a.type==="dir" ? -1 : 1)));
      for(const c of sorted){
        const item = nodeRow(c);
        if(item) childUl.appendChild(item);
      }
      if(childUl.children.length) li.appendChild(childUl);
      else if(filter && !((n.path||"")+n.name).toLowerCase().includes(filter)) return null;
    }

    return li;
  }

  // racine : on n’affiche pas la ligne "/" elle-même
  const items = Array.from(root.children.values())
    .sort((a,b)=> (a.type===b.type ? a.name.localeCompare(b.name) : (a.type==="dir" ? -1 : 1)));
  for(const c of items){
    const row = nodeRow(c);
    if(row) ul.appendChild(row);
  }

  container.appendChild(ul);
  updateSelCount();
}

// ---- Tri-state helpers
function setNodeChecked(n, checked){
  n.checked = checked; n.ind = false;
  if(n.type==="file"){
    if(checked) state.selection.add(n.path); else state.selection.delete(n.path);
  }else if(n.type==="dir" && n.children){
    n.children.forEach(ch => setNodeChecked(ch, checked));
  }
}
function refreshTriState(root){
  function walk(n){
    if(n.type==="file") return { total:1, checked: n.checked?1:0 };
    let total=0, checked=0, ind=false;
    n.children.forEach(ch=>{
      const r = walk(ch);
      total += r.total; checked += r.checked;
      if(ch.ind) ind = true;
    });
    n.ind = ind || (checked>0 && checked<total);
    n.checked = (checked===total && total>0 && !n.ind);
    return { total, checked };
  }
  walk(root);
}
function updateSelCount(){
  selCountEl.textContent = `Sélection : ${state.selection.size} fichiers`;
}

// ---- Boot
function init(){
  state.root = buildHierarchy(DEMO_PATHS);
  refreshTriState(state.root);
  renderTree(state.root, treeEl);

  $("#filter").addEventListener("keydown", (e)=>{
    if(e.key==="Enter"){
      state.filter = e.currentTarget.value || "";
      renderTree(state.root, treeEl);
    }
  });
}
init();
