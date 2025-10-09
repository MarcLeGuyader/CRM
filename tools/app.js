const $ = s => document.querySelector(s);
const state = {
  root: null,
  selection: new Set(),
  filter: ""
};

// --- GitHub API (public)
const ghBase = (o,r) => `https://api.github.com/repos/${o}/${r}`;
async function getTree(owner, repo, branch){
  // 1) refs/heads/:branch -> commit SHA
  const ref = await fetch(`${ghBase(owner,repo)}/git/refs/heads/${branch}`);
  if (!ref.ok) throw new Error(`refs ${branch} → ${ref.status}`);
  const refJ = await ref.json();

  // 2) commit -> tree SHA
  const commit = await fetch(`${ghBase(owner,repo)}/git/commits/${refJ.object.sha}`);
  if (!commit.ok) throw new Error(`commit → ${commit.status}`);
  const commitJ = await commit.json();

  // 3) tree?recursive=1 -> list of blobs/trees
  const tree = await fetch(`${ghBase(owner,repo)}/git/trees/${commitJ.tree.sha}?recursive=1`);
  if (!tree.ok) throw new Error(`tree → ${tree.status}`);
  const treeJ = await tree.json();

  // Return only file paths
  return (treeJ.tree || [])
    .filter(n => n.type === "blob")
    .map(n => n.path);
}

// --- Build hierarchy from paths
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
            type:"dir", open:false, children:new Map(),
            checked:false, ind:false
          });
        }
        cur = cur.children.get(name);
      }
    }
  }
  return root;
}

// --- Tri-state helpers
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
  $("#sel-count").textContent = `Sélection : ${state.selection.size} fichiers`;
}

// --- Render tree (iPad-safe grid)
function renderTree(root, container){
  container.innerHTML = "";
  const ul = document.createElement("ul");
  ul.className = "branch";

  const filter = (state.filter||"").toLowerCase();

  function nodeRow(n){
    // Filtrage naïf : masque les fichiers qui ne matchent pas, garde les dossiers s'ils contiennent un match
    if(filter){
      const selfMatch = (n.name||"").toLowerCase().includes(filter) || (n.path||"").toLowerCase().includes(filter);
      if(n.type==="file" && !selfMatch) return null;
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
    nameSpan.style.display = "block"; // iPad safety

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
      // Si filtre actif et aucun enfant visible → masquer ce dossier (sauf s'il match lui-même)
      if(filter && childUl.children.length===0){
        const selfMatch = (n.name||"").toLowerCase().includes(filter) || (n.path||"").toLowerCase().includes(filter);
        if(!selfMatch) return null;
      }
      if(childUl.children.length) li.appendChild(childUl);
    }
    return li;
  }

  const top = Array.from(root.children.values())
    .sort((a,b)=> (a.type===b.type ? a.name.localeCompare(b.name) : (a.type==="dir" ? -1 : 1)));
  for(const c of top){
    const row = nodeRow(c);
    if(row) ul.appendChild(row);
  }

  container.appendChild(ul);
  updateSelCount();
}

// --- Load from GitHub
async function loadFromGitHub(){
  const owner = $("#owner").value.trim() || "MarcLeGuyader";
  const repo  = $("#repo").value.trim()  || "CRM";
  const branch= $("#branch").value.trim()|| "main";
  const status = $("#status");

  status.textContent = "Chargement…";
  try{
    const paths = await getTree(owner, repo, branch);
    state.root = buildHierarchy(paths);
    state.selection.clear();
    refreshTriState(state.root);
    renderTree(state.root, $("#tree"));
    status.textContent = `OK — ${paths.length} fichiers`;
  }catch(e){
    status.textContent = `Erreur: ${e.message}`;
  }
}

// --- Boot
$("#btn-load").addEventListener("click", loadFromGitHub);
$("#filter").addEventListener("keydown", (e)=>{
  if(e.key === "Enter"){
    state.filter = e.currentTarget.value || "";
    renderTree(state.root, $("#tree"));
  }
});

// Auto-charger CRM/main au premier affichage
loadFromGitHub();
