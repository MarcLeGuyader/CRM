
const $ = (s)=>document.querySelector(s);
const statusEl = $("#status");
const prog = $("#prog");
const progText = $("#prog-text");
const logEl = $("#log");

function setStatus(t, cls=""){ statusEl.textContent=t; }
function setProgress(done, total){ const pct = total? Math.round(100*done/total):0; prog.value=pct; progText.textContent = pct+"%"; }
function logEvent({phase, action, op, path="", target="", size=null, sha=null, message="", details=null, level=null}) {
  const tag = level ? level.toUpperCase() : (op==="SUMMARY" ? "SUMMARY" : (phase==="dryrun" ? "DRYRUN" : "APPLY"));
  const text = `${action} ${op}${path?(" "+path):""}${target?(" → "+target):""}${message?(" — "+message):""}${details?(" "+JSON.stringify(details)):""}`;
  const div = document.createElement("div");
  div.className = "log-line";
  const badge = document.createElement("span");
  badge.className = "tag " + tag;
  badge.textContent = tag;
  const span = document.createElement("span");
  span.textContent = " " + text;
  div.appendChild(badge); div.appendChild(span);
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// GitHub API helpers
const ghBase = (o,r)=>`https://api.github.com/repos/${o}/${r}`;
const headers=(t)=>({Accept:"application/vnd.github+json", Authorization:`Bearer ${t}`});
async function gh(url, token){ const res=await fetch(url,{headers:headers(token)}); if(!res.ok) throw new Error(`${res.status}`); return res.json(); }
async function getTree(o,r,b,tok){
  const ref=await gh(`${ghBase(o,r)}/git/refs/heads/${b}`, tok);
  const commit=await gh(`${ghBase(o,r)}/git/commits/${ref.object.sha}`, tok);
  const tree=await gh(`${ghBase(o,r)}/git/trees/${commit.tree.sha}?recursive=1`, tok);
  return { tree: tree.tree||[], headSha: ref.object.sha, treeSha: commit.tree.sha };
}
async function getShaIfExists(o,r,tok,path){
  const url=`${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const res=await fetch(url,{headers:headers(tok)});
  if(res.status===404) return null;
  if(!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const j=await res.json(); return j.sha||null;
}
async function deleteFile(o,r,b,tok,path,msg,sha){
  const url=`${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const body={message:msg,branch:b,sha};
  const res=await fetch(url,{method:"DELETE",headers:headers(tok),body:JSON.stringify(body)});
  if(!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}
async function putFile(o,r,b,tok,path,contentB64,msg,sha=null){
  const url=`${ghBase(o,r)}/contents/${encodeURIComponent(path)}`;
  const body={message:msg,branch:b,content:contentB64};
  if(sha) body.sha=sha;
  const res=await fetch(url,{method:"PUT",headers:headers(tok),body:JSON.stringify(body)});
  if(!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
}

// State
const state = {
  owner:"", repo:"", branch:"main", token:"", targetRoot:"/", mode:"patch", dry:"on",
  nodes:[], tree:null, selection: new Set(),
  protectedList:[".github/workflows","LICENSE","README.md","CNAME"]
};

function guessType(path){
  const lower=path.toLowerCase();
  const bins=[".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".otf",".zip",".gz",".mp4",".mov",".webm",".mp3",".wav",".7z",".wasm",".map",".csv.gz"];
  return bins.some(ext=>lower.endsWith(ext)) ? "binary" : "text";
}

// Build tree with expand/collapse
function buildHierarchy(paths){
  const root={ name:"/", path:"", type:"dir", open:true, children:new Map() };
  for(const p of paths){
    const parts=p.split("/");
    let cur=root;
    for(let i=0;i<parts.length;i++){
      const name=parts[i];
      const atEnd=i===parts.length-1;
      if(atEnd){
        cur.children.set(name,{name, path:(cur.path?cur.path+"/":"")+name, type:"file", checked:false, ind:false});
      }else{
        if(!cur.children.has(name)){
          const child={name, path:(cur.path?cur.path+"/":"")+name, type:"dir", open:false, children:new Map(), checked:false, ind:false};
          cur.children.set(name, child);
        }
        cur=cur.children.get(name);
      }
    }
  }
  return root;
}
function renderTree(node, container){
  container.innerHTML="";
  const ul=document.createElement("ul");
  ul.className="branch";
  function row(n){
    const li=document.createElement("li");
    const wrap=document.createElement("div"); wrap.className="node";
    const toggle=document.createElement("span"); toggle.className="toggle"; toggle.textContent = n.type==="dir" ? (n.open?"▼":"►") : "•";
    if(n.type==="dir"){
      toggle.addEventListener("click",()=>{ n.open=!n.open; renderTree(node, container); });
    }
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!n.checked; cb.indeterminate=!!n.ind;
    cb.addEventListener("change", ()=>{
      setNodeChecked(n, cb.checked);
      refreshTriState(node);
      renderTree(node, container);
    });
    const name=document.createElement("span"); name.className="name "+(n.type==="dir"?"folder":""); name.textContent=n.name||"/";
    wrap.appendChild(toggle); wrap.appendChild(cb); wrap.appendChild(name);
    li.appendChild(wrap);
    if(n.type==="dir" && n.open && n.children && n.children.size){
      const childUl=document.createElement("ul"); childUl.className="branch";
      for(const c of Array.from(n.children.values()).sort((a,b)=> (a.type===b.type? a.name.localeCompare(b.name) : (a.type==="dir"?-1:1)))){
        childUl.appendChild(row(c));
      }
      li.appendChild(childUl);
    }
    return li;
  }
  // root children
  for(const c of node.children.values()){
    ul.appendChild(row(c));
  }
  container.appendChild(ul);
}
function setNodeChecked(n, checked){
  n.checked=checked; n.ind=false;
  if(n.type==="file"){
    if(checked) state.selection.add(n.path); else state.selection.delete(n.path);
  }else if(n.children){
    n.children.forEach(ch=> setNodeChecked(ch, checked));
  }
  updateSelCount();
}
function refreshTriState(root){
  function walk(n){
    if(n.type==="file") return {total:1, checked: n.checked?1:0};
    let total=0, checked=0, ind=false;
    n.children.forEach(ch=>{
      const r=walk(ch); total+=r.total; checked+=r.checked;
      if(ch.ind) ind=true;
    });
    n.ind = ind || (checked>0 && checked<total);
    n.checked = (checked===total && total>0 && !n.ind);
    return {total, checked};
  }
  walk(root);
}
function updateSelCount(){
  $("#sel-count").textContent = `Selected: ${state.selection.size} files`;
}

function normalizeRoot(p){ if(!p) return "/"; if(!p.startswith) return ("/"+p).replace("//","/"); return p; }

// Connect & refresh
async function connect(){
  state.owner=$("#owner").value.trim();
  state.repo=$("#repo").value.trim();
  state.branch=$("#branch").value.trim()||"main";
  state.targetRoot=$("#target-root").value.trim()||"/";
  state.token=$("#token").value.trim();
  state.mode=$("#mode").value;
  if(!state.owner||!state.repo||!state.token){ setStatus("Owner/Repo/Token required."); return; }
  setStatus("Loading repository tree…");
  try{
    const { tree } = await getTree(state.owner,state.repo,state.branch,state.token);
    state.nodes=tree;
    const filePaths=tree.filter(x=>x.type==="blob").map(x=>x.path);
    state.tree=buildHierarchy(filePaths);
    state.selection.clear();
    renderTree(state.tree, $("#tree"));
    updateSelCount();
    setStatus(`Connected. Files: ${filePaths.length}`);
  }catch(e){ setStatus("Error: "+(e.message||e)); }
}

// Deletes
async function runDelete(dry){
  const owner=state.owner, repo=state.repo, branch=state.branch, token=state.token;
  const allow=$("#allow-protected").checked;
  const files=Array.from(state.selection).sort();
  let del=0, prot=0, nf=0, err=0;
  for(const path of files){
    const protectedPath = state.protectedList.some(p=> path===p or path.startsWith(p+"/"));
    try{
      const sha=await getShaIfExists(owner,repo,token,path);
      if(!sha){ logEvent({phase:"dryrun",action:"DELETE",op:"SKIP",path,message:"not found"}); nf++; continue; }
      if(dry || (protectedPath and not allow)){
        logEvent({phase:"dryrun",action:"DELETE",op: protectedPath?"WARN":"PLAN",path,message: protectedPath?"protected path": "[tool] remove", details:{sha}});
      }else{
        await deleteFile(owner,repo,branch,token,path,"[tool] remove",sha);
        logEvent({phase:"apply",action:"DELETE",op:"DONE",path}); del++;
      }
    }catch(ex){
      logEvent({phase: dry?"dryrun":"apply",action:"DELETE",op:"ERROR",path,message:String(ex)}); err++;
    }
  }
  logEvent({phase: dry?"dryrun":"apply",action:"DELETE",op:"SUMMARY",details:{deleted:del,protected:prot,notFound:nf,errors:err}});
}

// Deploy
async function parseDeployInput(){
  const f=$("#deploy-file").files[0];
  if(!f) throw new Error("Choose a file (ZIP or single file).");
  if(f.name.toLowerCase().endsWith(".zip")){
    const zip=await JSZip.loadAsync(f);
    const files=[];
    for(const e of Object.values(zip.files)){
      if(e.dir) continue;
      const isBin=guessType(e.name)==="binary";
      const content=await e.async(isBin?"base64":"text");
      files.push({ path:e.name, type:isBin?"binary":"text", content });
    }
    return {kind:"zip", files};
  }else{
    const isBin=guessType(f.name)==="binary";
    const content= isBin? await fileToBase64(f) : await f.text();
    return {kind:"single", files:[{ path:f.name, type:isBin?"binary":"text", content }]};
  }
}
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result.split(",")[1]); r.onerror=reject; r.readAsDataURL(file);
  });
}

async function runDeploy(dry){
  const owner=state.owner, repo=state.repo, branch=state.branch, token=state.token;
  const targetRoot=$("#target-root").value.trim().replace(/^\/+/,"");
  const mode=$("#mode").value;
  const input=await parseDeployInput();
  const existing=state.nodes.filter(n=>n.type==="blob" && (targetRoot? n.path.startsWith(targetRoot+"/") : True)).map(n=>n.path);
  const incomingFull = input.files.map(f => (targetRoot? (targetRoot+"/"+f.path).replace(/\/+/g,"/"): f.path));
  let add=0, upd=0, del=0, err=0;

  if(dry){
    for(const p of incomingFull){
      if(!existing.includes(p)) { logEvent({phase:"dryrun",action:"DEPLOY",op:"ADD",path:p}); add++; }
      else { logEvent({phase:"dryrun",action:"DEPLOY",op:"UPDATE",path:p,details:{approx:true}}); upd++; }
    }
    if(mode==="replace"){
      const orphans = existing.filter(p => !incomingFull.includes(p));
      for(const p of orphans){ logEvent({phase:"dryrun",action:"DEPLOY",op:"DELETE",path:p}); del++; }
    }
    logEvent({phase:"dryrun",action:"DEPLOY",op:"SUMMARY",details:{add,update:upd,delete:del,errors:err}});
    return;
  }

  // apply
  for(const f of input.files){
    const tgt = (targetRoot? (targetRoot+"/"+f.path).replace(/\/+/g,"/") : f.path);
    try{
      const sha = await getShaIfExists(owner,repo,token,tgt);
      const base64 = f.type==="binary" ? f.content : btoa(unescape(encodeURIComponent(f.content)));
      await putFile(owner,repo,branch,token,tgt,base64,"[tool] deploy", sha||null);
      logEvent({phase:"apply",action:"DEPLOY",op: sha?"UPDATED":"ADDED",path:tgt});
      if(sha) upd++; else add++;
    }catch(ex){
      logEvent({phase:"apply",action:"DEPLOY",op:"ERROR",path:tgt,message:String(ex)}); err++;
    }
  }
  if(mode==="replace"){
    const orphans = existing.filter(p => !incomingFull.includes(p));
    for(const p of orphans){
      try{
        const sha=await getShaIfExists(owner,repo,token,p);
        if(sha){ await deleteFile(owner,repo,branch,token,p,"[tool] replace cleanup",sha); logEvent({phase:"apply",action:"DEPLOY",op:"DELETED",path:p}); del++; }
      }catch(ex){ logEvent({phase:"apply",action:"DEPLOY",op:"ERROR",path:p,message:String(ex)}); err++; }
    }
  }
  logEvent({phase:"apply",action:"DEPLOY",op:"SUMMARY",details:{added:add,updated:upd,deleted:del,errors:err}});
}

// Wiring
$("#btn-connect").addEventListener("click", connect);
$("#btn-refresh").addEventListener("click", connect);
$("#btn-select-all").addEventListener("click", ()=>{
  function walk(n){ if(n.type==="file"){ n.checked=true; state.selection.add(n.path); } else if(n.children){ n.open=true; n.children.forEach(walk); } }
  walk(state.tree); renderTree(state.tree, $("#tree"));
  $("#sel-count").textContent = `Selected: ${state.selection.size} files`;
});
$("#btn-select-none").addEventListener("click", ()=>{
  function walk(n){ if(n.type==="file"){ n.checked=false; state.selection.delete(n.path); } else if(n.children){ n.children.forEach(walk); } }
  walk(state.tree); renderTree(state.tree, $("#tree"));
  $("#sel-count").textContent = `Selected: ${state.selection.size} files`;
});
$("#filter").addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ // rebuild a filtered, expanded view
  const q=$("#filter").value.trim().toLowerCase();
  if(!q){ renderTree(state.tree, $("#tree")); return; }
  // simple filter: expand all and hide non-matching files
  function walk(n){
    if(n.type==="file") return n.path.toLowerCase().includes(q);
    let has=false;
    n.open=true;
    n.children.forEach((c,k)=>{
      const keep=walk(c);
      if(!keep) n.children.delete(k);
      has=has||keep;
    });
    return has;
  }
  const clone=JSON.parse(JSON.stringify(state.tree,(k,v)=> (v instanceof Map? Array.from(v.entries()): v)));
  // fallback: just re-render the main tree (filter live is optional in v0.2)
  renderTree(state.tree, $("#tree"));
}});

$("#btn-export-json").addEventListener("click", ()=>{
  const files=Array.from(state.selection).sort().map(p=>({path:p,type:guessType(p)}));
  const payload={ meta:{repo:state.repo,branch:state.branch,generatedAt:new Date().toISOString(),count:files.length}, selection:files };
  $("#out-json").value = JSON.stringify(payload,null,2);
  logEvent({phase:"apply",action:"EXPORT",op:"READY",message:"selection.json prepared",details:{files:files.length}});
});
$("#btn-export-json-dl").addEventListener("click", ()=>{
  const text=$("#out-json").value||"{}";
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  a.download="selection.json"; a.click();
});
$("#btn-export-list").addEventListener("click", ()=>{
  const scope=$("#list-scope").value; const fmt=$("#list-format").value;
  const paths = (scope==="selection" ? Array.from(state.selection).sort() : state.nodes.filter(n=>n.type==="blob").map(n=>n.path).sort());
  if(fmt==="text"){
    const txt = paths.map(p=>"/"+p).join("\\n");
    $("#out-list").value=txt;
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"})); a.download="tree-list.txt"; a.click();
    logEvent({phase:"apply",action:"LIST",op:"READY",message:"tree-list.txt generated",details:{count:paths.length}});
  }else{
    const j = JSON.stringify({generatedAt:new Date().toISOString(),count:paths.length,paths},null,2);
    $("#out-list").value=j;
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([j],{type:"application/json"})); a.download="tree-list.json"; a.click();
    logEvent({phase:"apply",action:"LIST",op:"READY",message:"tree-list.json generated",details:{count:paths.length}});
  }
});

$("#btn-delete-dry").addEventListener("click", ()=>runDelete(true));
$("#btn-delete-apply").addEventListener("click", async ()=>{
  const count = state.selection.size;
  if(count>=10 && !confirm(`You selected ${count} files. Proceed with deletion?`)) return;
  await runDelete(false);
});

$("#btn-deploy-dry").addEventListener("click", ()=>runDeploy(true));
$("#btn-deploy-apply").addEventListener("click", async ()=>{
  const replace = $("#mode").value==="replace";
  if(replace && !confirm("Replace mode will delete files in the target not present in the archive. Proceed?")) return;
  await runDeploy(false);
});

// Try to auto-fill owner/repo when hosted on Pages
(function autoguess(){
  try{
    const host=location.hostname; const owner=host.split(".")[0]; const parts=location.pathname.split("/").filter(Boolean);
    if(!$("#owner").value) $("#owner").value = owner || "";
    if(!$("#repo").value) $("#repo").value = parts[0] || "";
  }catch{}
})();
