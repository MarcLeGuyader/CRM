const $ = (s)=>document.querySelector(s);
const statusEl = $("#status");
const prog = $("#prog");
const progText = $("#prog-text");
const logEl = $("#log");

function setStatus(t){ statusEl.textContent=t; }
function setProgress(done,total){ const pct = total? Math.round(100*done/total):0; prog.value=pct; progText.textContent = pct+"%"; }
function logEvent({phase, action, op, path="", target="", message="", details=null, level=null}){
  const tag = level ? level.toUpperCase() : (op==="SUMMARY" ? "SUMMARY" : (phase==="dryrun" ? "DRYRUN" : "APPLY"));
  const text = `${action} ${op}${path?(" "+path):""}${target?(" → "+target):""}${message?(" — "+message):""}${details?(" "+JSON.stringify(details)):""}`;
  const div = document.createElement("div");
  div.className = "log-line";
  const badge = document.createElement("span"); badge.className = "tag " + tag; badge.textContent = tag;
  const span = document.createElement("span"); span.textContent = " " + text;
  div.appendChild(badge); div.appendChild(span);
  logEl.appendChild(div); logEl.scrollTop = logEl.scrollHeight;
}

// iPad-safe: injecte un CSS grid layout pour la treeview (comme dans le tester)
function injectTreeLayoutCSS(){
  if (document.getElementById("tree-safe-style")) return;
  const css = `
    .tree .node{
      display:grid !important;
      grid-template-columns:16px 18px 1fr !important;
      align-items:center !important;
      column-gap:8px !important;
      padding:2px 6px !important;
      color:#111827 !important;
    }
    .tree .toggle{ width:16px; text-align:center; cursor:pointer; user-select:none; }
    .tree input[type="checkbox"]{ width:18px; height:18px; margin:0; }
    .tree .name{
      min-width:0 !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      display:block !important;
      color:#111827 !important;
    }
    .tree .name.folder::before{ content:"📁 "; }
    .tree .name.file::before  { content:"📄 "; }
  `;
  const tag = document.createElement("style");
  tag.id = "tree-safe-style";
  tag.textContent = css;
  document.head.appendChild(tag);
}

// GitHub
const ghBase = (o,r)=>`https://api.github.com/repos/${o}/${r}`;
const headers = (t)=>({Accept:"application/vnd.github+json", Authorization:`Bearer ${t}`});
async function gh(url, token){ const res = await fetch(url, { headers: headers(token) }); if(!res.ok) throw new Error(`${res.status}`); return res.json(); }
async function getTree(o,r,b,tok){
  const ref = await gh(`${ghBase(o,r)}/git/refs/heads/${b}`, tok);
  const commit = await gh(`${ghBase(o,r)}/git/commits/${ref.object.sha}`, tok);
  const tree = await gh(`${ghBase(o,r)}/git/trees/${commit.tree.sha}?recursive=1`, tok);
  return { tree: tree.tree||[], headSha: ref.object.sha, treeSha: commit.tree.sha };
}
async function getShaIfExists(o,r,tok,path){
  const url = `${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: headers(tok) });
  if(res.status===404) return null;
  if(!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const j = await res.json(); return j.sha || null;
}
async function deleteFile(o,r,b,tok,path,msg,sha){
  const url = `${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const body = { message: msg, branch: b, sha };
  const res = await fetch(url, { method:"DELETE", headers: headers(tok), body: JSON.stringify(body) });
  if(!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}
async function putFile(o,r,b,tok,path,contentB64,msg,sha){
  const url = `${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const body = { message: msg, branch: b, content: contentB64 };
  if(sha) body.sha = sha;
  const res = await fetch(url, { method:"PUT", headers: headers(tok), body: JSON.stringify(body) });
  if(!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
}

// State
const state = {
  owner:"", repo:"", branch:"main", token:"", targetRoot:"/",
  mode:"patch", dry:"on",
  nodes:[], tree:null, selection: new Set(),
  protectedList:[".github/workflows","LICENSE","README.md","CNAME"]
};

function guessType(path){
  const lower=path.toLowerCase();
  const bins=[".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".otf",".zip",".gz",".mp4",".mov",".webm",".mp3",".wav",".7z",".wasm",".map",".csv.gz"];
  return bins.some(ext=>lower.endsWith(ext)) ? "binary" : "text";
}

// Build tree
function buildHierarchy(paths){
  const root = { name:"/", path:"", type:"dir", open:true, children:new Map(), checked:false, ind:false };
  for(const p of paths){
    const parts = p.split("/");
    let cur = root;
    for(let i=0;i<parts.length;i++){
      const name = parts[i];
      const atEnd = i===parts.length-1;
      if(atEnd){
        cur.children.set(name, { name, path:(cur.path?cur.path+"/":"")+name, type:"file", checked:false, ind:false });
      }else{
        if(!cur.children.has(name)){
          cur.children.set(name, { name, path:(cur.path?cur.path+"/":"")+name, type:"dir", open:false, children:new Map(), checked:false, ind:false });
        }
        cur = cur.children.get(name);
      }
    }
  }
  return root;
}

function renderTree(root, container){
  container.innerHTML = "";
  const ul = document.createElement("ul");
  ul.className = "branch";
  function nodeRow(n){
    const li = document.createElement("li");
    const row = document.createElement("div"); row.className="node";
    const toggle = document.createElement("span"); toggle.className="toggle"; toggle.textContent = n.type==="dir" ? (n.open?"▼":"►") : "•";
    if(n.type==="dir"){ toggle.addEventListener("click", ()=>{ n.open=!n.open; renderTree(root, container); }); }
    const cb = document.createElement("input"); cb.type="checkbox"; cb.checked = !!n.checked; cb.indeterminate = !!n.ind;
    cb.addEventListener("change", ()=>{
      setNodeChecked(n, cb.checked);
      refreshTriState(root);
      renderTree(root, container);
    });
    const nameSpan = document.createElement("span");
    nameSpan.className = "name " + (n.type==="dir" ? "folder" : "file");
    nameSpan.textContent = n.name || "/";
    nameSpan.style.display = "block";   // iPad safety
    row.appendChild(toggle); row.appendChild(cb); row.appendChild(nameSpan);
    li.appendChild(row);
    if(n.type==="dir" && n.open && n.children && n.children.size){
      const childUl = document.createElement("ul"); childUl.className="branch";
      for(const c of Array.from(n.children.values()).sort((a,b)=> (a.type===b.type? a.name.localeCompare(b.name) : (a.type==="dir"?-1:1)))){
        childUl.appendChild(nodeRow(c));
      }
      li.appendChild(childUl);
    }
    return li;
  }
  for(const c of root.children.values()){ ul.appendChild(nodeRow(c)); }
  container.appendChild(ul);
  injectTreeLayoutCSS(); // applique le CSS iPad-safe
}

function setNodeChecked(n, checked){
  n.checked = checked; n.ind = false;
  if(n.type==="file"){
    if(checked) state.selection.add(n.path); else state.selection.delete(n.path);
  }else{
    n.children.forEach(ch => setNodeChecked(ch, checked));
  }
  updateSelCount();
}

function refreshTriState(root){
  function walk(n){
    if(n.type==="file") return { total:1, checked: n.checked?1:0 };
    let total=0, checked=0, ind=false;
    n.children.forEach(ch=>{
      const r = walk(ch); total += r.total; checked += r.checked;
      if(ch.ind) ind = true;
    });
    n.ind = ind || (checked>0 && checked<total);
    n.checked = (checked===total && total>0 && !n.ind);
    return { total, checked };
  }
  walk(root);
}
function updateSelCount(){ $("#sel-count").textContent = `Selected: ${state.selection.size} files`; }

// Connect
async function connect(){
  state.owner=$("#owner").value.trim();
  state.repo=$("#repo").value.trim();
  state.branch=$("#branch").value.trim()||"main";
  state.targetRoot=$("#target-root").value.trim()||"/";
  state.token=$("#token").value.trim();
  state.mode=$("#mode").value;
  if(!state.owner || !state.repo || !state.token){ setStatus("Owner/Repo/Token required."); return; }
  setStatus("Loading repository tree…");
  try{
    const { tree } = await getTree(state.owner,state.repo,state.branch,state.token);
    state.nodes = tree;
    const filePaths = tree.filter(x=>x.type==="blob").map(x=>x.path);
    state.tree = buildHierarchy(filePaths);
    state.selection.clear();
    renderTree(state.tree, $("#tree"));
    injectTreeLayoutCSS(); // iPad safety
    updateSelCount();
    setStatus(`Connected. Files: ${filePaths.length}`);
  }catch(e){ setStatus("Error: "+(e.message||e)); }
}

// (reste inchangé)
function exportSelectionJSON(){
  const files = Array.from(state.selection).sort().map(p=>({ path:p, type: guessType(p) }));
  const payload = { meta:{repo:state.repo,branch:state.branch,generatedAt:new Date().toISOString(),count:files.length}, selection:files };
  $("#out-json").value = JSON.stringify(payload, null, 2);
  logEvent({phase:"apply", action:"EXPORT", op:"READY", message:"selection.json prepared", details:{files:files.length}});
}
function downloadText(name, text, mime="text/plain"){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type:mime+";charset=utf-8"})); a.download=name; a.click(); }
function exportListing(){
  const scope=$("#list-scope").value; const fmt=$("#list-format").value;
  const paths = (scope==="selection" ? Array.from(state.selection).sort() : state.nodes.filter(n=>n.type==="blob").map(n=>n.path).sort());
  if(fmt==="text"){
    const txt = paths.map(p=>"/"+p).join("\n"); $("#out-list").value=txt; downloadText("tree-list.txt", txt, "text/plain"); logEvent({phase:"apply",action:"LIST",op:"READY",details:{count:paths.length}});
  }else{
    const txt = JSON.stringify({generatedAt:new Date().toISOString(),count:paths.length,paths}, null, 2); $("#out-list").value=txt; downloadText("tree-list.json", txt, "application/json"); logEvent({phase:"apply",action:"LIST",op:"READY",details:{count:paths.length}});
  }
}

// Delete, Deploy, and event wiring unchanged ↓
/* (garde le reste de ton code identique, sans autre modif) */
