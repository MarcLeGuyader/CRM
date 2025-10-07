
// Unified Repo Tool — client-side only
// Features: Tree listing with tri-state selection; Export selection JSON/listing; Delete (dry-run/apply); Deploy (ZIP/single file); Unified Console.
// NOTE: This is a functional MVP focused on the requested features.

const $ = (s)=>document.querySelector(s);
const statusEl = $("#status");
const prog = $("#prog");
const progText = $("#prog-text");
const logEl = $("#log");

function setStatus(t, cls=""){ statusEl.textContent=t; statusEl.className = "status " + (cls||""); }
function setProgress(done, total){ const pct = total? Math.round(100*done/total):0; prog.value=pct; progText.textContent = pct+"%"; }
function logEvent({phase, action, op, path="", target="", size=null, sha=null, message="", details=null, level=null}) {
  const ts = new Date().toISOString();
  const tag = level ? level.toUpperCase() : (op==="SUMMARY" ? "SUMMARY" : (phase==="dryrun" ? "DRYRUN" : "APPLY"));
  const line = `[${new Date().toLocaleTimeString()}] ${tag} ${action} ${op}${path?(" "+path):""}${target?(" → "+target):""}${size!=null?(" ("+size+"B)"): ""}${message?(" — "+message):""}${details?(" "+JSON.stringify(details)):""}`;
  const div = document.createElement("div");
  div.className = "log-line";
  const badge = document.createElement("span");
  badge.className = "tag " + (tag==="DRYRUN"?"DRYRUN": tag==="APPLY"?"APPLY": tag==="SUMMARY"?"SUMMARY": tag==="ERROR"?"ERROR": tag==="WARN"?"WARN":"");
  badge.textContent = tag;
  const span = document.createElement("span");
  span.textContent = " " + line.replace(/^\[[^\]]+\] /,""); // avoid duplicate tag text
  div.appendChild(badge); div.appendChild(span);
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------- GitHub API helpers
const ghBase = (o,r)=>`https://api.github.com/repos/${o}/${r}`;
function headers(token){ return { Accept:"application/vnd.github+json", Authorization:`Bearer ${token}` }; }

async function gh(url, token){
  const res = await fetch(url, { headers: headers(token) });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function getTree(o,r,b,tok){
  const ref = await gh(`${ghBase(o,r)}/git/refs/heads/${b}`, tok);
  const commit = await gh(`${ghBase(o,r)}/git/commits/${ref.object.sha}`, tok);
  const tree = await gh(`${ghBase(o,r)}/git/trees/${commit.tree.sha}?recursive=1`, tok);
  return { tree: tree.tree || [], headSha: ref.object.sha, treeSha: commit.tree.sha };
}
async function getShaIfExists(o,r,tok,path){
  const url = `${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: headers(tok) });
  if(res.status===404) return null;
  if(!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const j = await res.json();
  return j.sha || null;
}
async function deleteFile(o,r,b,tok,path,msg,sha){
  const url = `${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const body = { message: msg, branch: b, sha };
  const res = await fetch(url, { method:"DELETE", headers: headers(tok), body: JSON.stringify(body) });
  if(!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}
async function putFile(o,r,b,tok,path,contentB64,msg,sha=null){
  const url = `${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const body = { message: msg, branch: b, content: contentB64 };
  if(sha) body.sha = sha;
  const res = await fetch(url, { method:"PUT", headers: headers(tok), body: JSON.stringify(body) });
  if(!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
}

// ---------------- State & tree building
const state = {
  owner: "", repo: "", branch: "main", token: "", targetRoot: "/",
  mode: "patch", dry: "on",
  headSha: null, treeSha: null,
  nodes: [], // flat from API: {path,type,mode,sha}
  // derived tree: directory structure with tri-state
  tree: null,
  selection: new Set(), // files selected (paths)
  protectedList: [".github/workflows","LICENSE","README.md","CNAME"]
};

function normalizeRoot(p){
  if(!p) return "/";
  if(p[0] !== "/") p = "/" + p;
  if(!p.endsWith("/")) p += "/";
  if(p==="//") p="/";
  return p;
}

function buildHierarchy(flat){
  // Build nested folders/files for UI
  const root = { name:"/", path:"", type:"dir", children: new Map(), parent:null, checked:false, ind:false };
  for(const node of flat){
    const path = node.path;
    const parts = path.split("/");
    let cur = root;
    for(let i=0;i<parts.length;i++){
      const part = parts[i];
      const isFile = (i===parts.length-1);
      if(isFile){
        cur.children.set(part, { name: part, path: (cur.path? cur.path+"/":"") + part, type:"file", checked:false, ind:false });
      }else{
        const nextPath = (cur.path? cur.path+"/":"") + part;
        if(!cur.children.has(part)){
          cur.children.set(part, { name: part, path: nextPath, type:"dir", children: new Map(), parent: cur, checked:false, ind:false });
        }
        cur = cur.children.get(part);
      }
    }
  }
  return root;
}

function renderTree(container, node){
  container.innerHTML = "";
  const ul = document.createElement("ul");
  ul.style.listStyle = "none";
  ul.style.paddingLeft = "12px";
  function renderNode(n, parentUl){
    const li = document.createElement("li");
    const row = document.createElement("div"); row.className="node";
    const cb = document.createElement("input"); cb.type="checkbox";
    cb.checked = !!n.checked; cb.indeterminate = !!n.ind;
    cb.addEventListener("change", ()=>{
      setNodeChecked(n, cb.checked);
      updateTriState(n);
      refreshTreeCheckboxes(container, state.tree);
    });
    const icon = document.createElement("span"); icon.textContent = n.type==="dir" ? "📁" : "📄";
    const name = document.createElement("span"); name.className="name"; name.textContent = n.name || "/";
    const badge = document.createElement("span"); badge.className="badge";
    badge.textContent = n.type==="dir" ? "" : "";
    row.appendChild(cb); row.appendChild(icon); row.appendChild(name); row.appendChild(badge);
    li.appendChild(row);

    if(n.type==="dir" && n.children && n.children.size){
      const childUl = document.createElement("ul");
      childUl.style.listStyle="none"; childUl.style.paddingLeft="14px";
      for(const child of Array.from(n.children.values()).sort((a,b)=> (a.type===b.type) ? a.name.localeCompare(b.name) : (a.type==="dir"?-1:1))){
        renderNode(child, childUl);
      }
      li.appendChild(childUl);
    }
    parentUl.appendChild(li);
  }
  renderNode(node, ul);
  container.appendChild(ul);
}

function setNodeChecked(node, checked){
  node.checked = checked;
  node.ind = false;
  if(node.type==="dir" && node.children){
    for(const child of node.children.values()){
      setNodeChecked(child, checked);
    }
  }
  if(node.type==="file"){
    if(checked) state.selection.add(node.path);
    else state.selection.delete(node.path);
  }else{
    // propagate to selection: include all file descendants
    function collectFiles(n){
      if(n.type==="file"){ if(checked) state.selection.add(n.path); else state.selection.delete(n.path); return; }
      for(const c of n.children.values()) collectFiles(c);
    }
    collectFiles(node);
  }
}
function updateTriState(node){
  if(!node || node.type!=="dir" || !node.children) return;
  let total=0, checked=0, ind=false;
  for(const c of node.children.values()){
    total++;
    if(c.type==="dir"){ updateTriState(c); if(c.ind) ind=true; }
    if(c.checked) checked++;
    if(c.ind) ind=true;
  }
  node.ind = ind || (checked>0 && checked<total);
  node.checked = (checked===total && !node.ind);
}
function refreshTreeCheckboxes(container, root){
  // re-render to update indeterminate states
  renderTree(container, root);
}

function collectSelectedFilesFromTree(node, arr){
  if(node.type==="file" && node.checked) arr.push(node.path);
  if(node.type==="dir" && node.children){
    for(const c of node.children.values()) collectSelectedFilesFromTree(c, arr);
  }
  return arr;
}

function filterTree(root, text){
  if(!text) return root;
  const q = text.toLowerCase();
  // Return a pruned copy showing only matching branches
  function cloneIfMatches(n){
    if(n.type==="file"){
      if(n.path.toLowerCase().includes(q)){
        return {...n};
      }
      return null;
    }else{
      let keptChildren = [];
      for(const c of n.children.values()){
        const cc = cloneIfMatches(c);
        if(cc) keptChildren.push(cc);
      }
      if(keptChildren.length>0 || (n.name && n.name.toLowerCase().includes(q))){
        const copy = {...n, children: new Map()};
        for(const c of keptChildren){
          copy.children.set(c.name, c);
        }
        return copy;
      }
      return null;
    }
  }
  const res = cloneIfMatches(root);
  return res || {name:"(no matches)", type:"dir", children:new Map()};
}

// ---------------- Actions
function exportSelectionJSON(){
  const files = Array.from(state.selection).sort().map(p => ({ path: p, type: guessType(p) }));
  const payload = { meta: { repo: state.repo, branch: state.branch, generatedAt: new Date().toISOString(), count: files.length }, selection: files };
  const text = JSON.stringify(payload, null, 2);
  $("#out-json").value = text;
  logEvent({phase:"apply", action:"EXPORT", op:"READY", message:"selection.json prepared", details:{files: files.length}});
}
function downloadText(filename, text){
  const blob = new Blob([text],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove();
}
function exportListing(){
  const scope = $("#list-scope").value;
  const fmt = $("#list-format").value;
  let paths = [];
  if(scope==="selection") paths = Array.from(state.selection).sort();
  else paths = state.nodes.filter(n=>n.type==="blob").map(n=>n.path).sort();

  if(fmt==="text"){
    const txt = paths.map(p => "/"+p).join("\n");
    $("#out-list").value = txt;
    downloadText("tree-list.txt", txt);
    logEvent({phase:"apply", action:"LIST", op:"READY", message:"tree-list.txt generated", details:{count: paths.length}});
  }else{
    const j = { generatedAt: new Date().toISOString(), count: paths.length, paths };
    const text = JSON.stringify(j, null, 2);
    $("#out-list").value = text;
    const blob = new Blob([text],{type:"application/json;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="tree-list.json"; document.body.appendChild(a); a.click(); a.remove();
    logEvent({phase:"apply", action:"LIST", op:"READY", message:"tree-list.json generated", details:{count: paths.length}});
  }
}
function isProtected(path){
  return state.protectedList.some(p => path===p || path.startsWith(p+"/"));
}
function guessType(path){
  const lower = path.toLowerCase();
  const bins = [".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".otf",".zip",".gz",".mp4",".mov",".webm",".mp3",".wav",".7z"];
  return bins.some(ext => lower.endsWith(ext)) ? "binary" : "text";
}

// Delete
async function runDelete(dry){
  const owner=state.owner, repo=state.repo, branch=state.branch, token=state.token;
  const allowProtected = $("#allow-protected").checked;
  const selected = Array.from(state.selection).sort();
  let del=0, prot=0, nf=0, err=0;
  if(dry) setStatus("Simulating delete…"); else setStatus("Deleting…");
  for(const path of selected){
    if(isProtected(path) && !allowProtected){
      logEvent({phase:"dryrun", action:"DELETE", op:"WARN", path, message:"protected path skip", level:"warn"});
      prot++; continue;
    }
    try{
      const sha = await getShaIfExists(owner, repo, token, path);
      if(!sha){ logEvent({phase:"dryrun", action:"DELETE", op:"SKIP", path, message:"not found"}); nf++; continue; }
      if(dry){
        logEvent({phase:"dryrun", action:"DELETE", op:"PLAN", path, message:"[tool] remove", details:{sha}});
      }else{
        await deleteFile(owner, repo, branch, token, path, "[tool] remove", sha);
        logEvent({phase:"apply", action:"DELETE", op:"DONE", path});
        del++;
      }
    }catch(e){
      logEvent({phase: dry?"dryrun":"apply", action:"DELETE", op:"ERROR", path, message:String(e.message||e), level:"error"}); err++;
    }
  }
  logEvent({phase: dry?"dryrun":"apply", action:"DELETE", op:"SUMMARY", message:"done", details:{deleted:del, protectedSkipped:prot, notFound:nf, errors:err}});
  setStatus(dry? "Dry‑run complete." : "Delete complete.", "ok");
}

// Deploy
async function parseDeployInput(){
  const f = $("#deploy-file").files[0];
  if(!f) throw new Error("Choose a file (ZIP or single file).");
  if(f.name.toLowerCase().endsWith(".zip")){
    const zip = await JSZip.loadAsync(f);
    const entries = Object.values(zip.files);
    const results = [];
    for(const entry of entries){
      if(entry.dir) continue;
      const path = entry.name.replace(/^\.\//,"");
      const isBin = guessType(path)==="binary";
      const content = await entry.async(isBin?"base64":"text");
      results.push({ path, type: isBin?"binary":"text", content });
    }
    return { kind:"zip", files: results };
  }else{
    // single file: deploy at target root preserving file name
    const isBin = guessType(f.name)==="binary";
    const content = await (isBin? fileToBase64(f) : f.text());
    return { kind:"single", files:[{ path: f.name, type: isBin?"binary":"text", content }] };
  }
}
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>{ const base64 = fr.result.split(",")[1]; resolve(base64); };
    fr.onerror=()=>reject(fr.error);
    fr.readAsDataURL(file);
  });
}

async function runDeploy(dry){
  const owner=state.owner, repo=state.repo, branch=state.branch, token=state.token, target = normalizeRoot(state.targetRoot);
  const mode = state.mode; // patch or replace
  const input = await parseDeployInput();
  setStatus(dry? "Simulating deploy…" : "Deploying…");
  // Build map of target existing files (within target root)
  const existingPaths = state.nodes.filter(n => n.type==="blob" && ("/"+n.path).startsWith(target)).map(n => n.path);
  const existingSet = new Set(existingPaths);

  // Compute ops
  let add=0, upd=0, skip=0, del=0, err=0;
  const incoming = [];
  for(const f of input.files){
    const tgtPath = (target==="/" ? "" : target.slice(1)) + f.path.replace(/^\//,"");
    incoming.push(tgtPath);
    const exists = existingSet.has(tgtPath);
    if(dry){
      if(!exists) { logEvent({phase:"dryrun", action:"DEPLOY", op:"ADD", path:tgtPath, target}); add++; }
      else { logEvent({phase:"dryrun", action:"DEPLOY", op:"UPDATE", path:tgtPath, target, details:{approx:true}}); upd++; }
    }else{
      try{
        const sha = await getShaIfExists(owner, repo, token, tgtPath);
        const base64 = f.type==="binary" ? f.content : btoa(unescape(encodeURIComponent(f.content)));
        await putFile(owner, repo, branch, token, tgtPath, base64, "[tool] deploy", sha||null);
        logEvent({phase:"apply", action:"DEPLOY", op: (sha?"UPDATED":"ADDED"), path:tgtPath, target});
        sha ? upd++ : add++;
      }catch(e){
        logEvent({phase:"apply", action:"DEPLOY", op:"ERROR", path:tgtPath, message:String(e.message||e), level:"error"}); err++;
      }
    }
  }
  if(mode==="replace"){
    // Anything in target not in incoming should be deleted
    const toDelete = existingPaths.filter(p => !incoming.includes(p));
    for(const p of toDelete){
      if(dry){ logEvent({phase:"dryrun", action:"DEPLOY", op:"DELETE", path:p, target}); del++; }
      else {
        try{
          const sha = await getShaIfExists(owner, repo, token, p);
          if(sha){ await deleteFile(owner, repo, branch, token, p, "[tool] replace cleanup", sha); logEvent({phase:"apply", action:"DEPLOY", op:"DELETED", path:p}); del++; }
        }catch(e){
          logEvent({phase:"apply", action:"DEPLOY", op:"ERROR", path:p, message:String(e.message||e), level:"error"}); err++;
        }
      }
    }
  }
  logEvent({phase: dry?"dryrun":"apply", action:"DEPLOY", op:"SUMMARY", details:{add, update:upd, delete:del, skip, errors:err}});
  setStatus(dry? "Dry‑run complete." : "Deploy complete.", "ok");
}

// ---------------- Wiring & boot
async function connectAndLoad(){
  state.owner = $("#owner").value.trim();
  state.repo = $("#repo").value.trim();
  state.branch = $("#branch").value.trim() || "main";
  state.targetRoot = $("#target-root").value.trim() || "/";
  state.token = $("#token").value.trim();
  state.mode = $("#mode").value;
  state.dry = $("#dryrun").value;
  if(!state.owner || !state.repo || !state.token){ setStatus("Owner/Repo/Token required.", "warn"); return; }
  setStatus("Fetching repository tree…");
  try{
    const { tree, headSha, treeSha } = await getTree(state.owner, state.repo, state.branch, state.token);
    state.headSha = headSha; state.treeSha = treeSha;
    state.nodes = tree; // array with {path,type,mode,sha}
    state.tree = buildHierarchy(tree.filter(x=>x.type==="blob").map(x=>({path:x.path})));
    state.selection.clear();
    const treeContainer = $("#tree");
    renderTree(treeContainer, state.tree);
    setStatus(`Connected. Files: ${state.nodes.filter(n=>n.type==="blob").length}`, "ok");
  }catch(e){
    setStatus("Error: "+(e.message||e), "warn");
  }
}

function applyFilter(){
  const q = $("#filter").value.trim();
  const treeContainer = $("#tree");
  const view = q ? filterTree(state.tree, q) : state.tree;
  renderTree(treeContainer, view);
}

function selectAllNone(all){
  function walk(n){ if(n.type==="file"){ setNodeChecked(n, all); } else if(n.children){ for(const c of n.children.values()) walk(c); n.checked = all; n.ind=false; } }
  walk(state.tree); renderTree($("#tree"), state.tree);
}

// Log controls
$("#btn-log-clear").addEventListener("click", ()=>{ logEl.textContent=""; });
$("#btn-log-copy").addEventListener("click", ()=>{
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(logEl); sel.removeAllRanges(); sel.addRange(r);
  try{ document.execCommand("copy"); }catch{}
});
$("#btn-log-dl").addEventListener("click", ()=>{
  // Export as plain text
  const text = Array.from(logEl.querySelectorAll(".log-line")).map(el=>el.textContent).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text],{type:"text/plain"}));
  a.download = "actions-log.txt"; a.click();
});

// Buttons
$("#btn-connect").addEventListener("click", connectAndLoad);
$("#btn-refresh").addEventListener("click", connectAndLoad);
$("#btn-select-all").addEventListener("click", ()=>selectAllNone(true));
$("#btn-select-none").addEventListener("click", ()=>selectAllNone(false));
$("#filter").addEventListener("keydown", (e)=>{ if(e.key==="Enter") applyFilter(); });

$("#btn-export-json").addEventListener("click", ()=>exportSelectionJSON());
$("#btn-export-json-dl").addEventListener("click", ()=>{
  const text = $("#out-json").value || JSON.stringify({selection:Array.from(state.selection).sort()}, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text],{type:"application/json"}));
  a.download = "selection.json"; a.click();
});
$("#btn-export-list").addEventListener("click", exportListing);

$("#btn-delete-dry").addEventListener("click", ()=>runDelete(true));
$("#btn-delete-apply").addEventListener("click", async ()=>{
  // safety: if > 10 deletions planned, confirm
  const count = Array.from(state.selection).length;
  if(count>=10 && !confirm(`You selected ${count} files. Proceed with deletion?`)) return;
  await runDelete(false);
});

$("#btn-deploy-dry").addEventListener("click", ()=>runDeploy(true));
$("#btn-deploy-apply").addEventListener("click", async ()=>{
  const replace = state.mode==="replace";
  if(replace && !confirm("Replace mode will delete files in the target that are not in the archive. Proceed?")) return;
  await runDeploy(false);
});

// Attempt to guess owner/repo when hosted on Pages
(function autoguess(){
  try{
    const host = location.hostname; // marcleguyader.github.io
    const path = location.pathname.split("/").filter(Boolean); // [repo,...]
    const owner = host.split(".")[0];
    if(!$("#owner").value) $("#owner").value = owner || "";
    if(!$("#repo").value) $("#repo").value = path[0] || "";
  }catch{}
})();
