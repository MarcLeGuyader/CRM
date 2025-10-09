const $ = s => document.querySelector(s);
const state = { root: null, selection: new Set() };

// Console helpers
const logEl = $('#log');
function log(tag, msg, data=null){
  const line = document.createElement('div'); line.className = 'log-line';
  const badge = document.createElement('span'); badge.className = 'tag ' + (tag||'INFO'); badge.textContent = tag || 'INFO';
  const text = document.createElement('span'); text.textContent = ' ' + msg + (data ? ' ' + JSON.stringify(data) : '');
  line.append(badge, text); logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight;
}
$('#btn-log-clear').addEventListener('click', ()=>{ logEl.textContent=''; });
$('#btn-log-copy').addEventListener('click', async ()=>{ const t = logEl.innerText; try{ await navigator.clipboard.writeText(t); }catch{} });
$('#btn-log-dl').addEventListener('click', ()=>{ const blob=new Blob([logEl.innerText],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='console.log.txt'; a.click(); });

// GitHub API
const ghBase=(o,r)=>`https://api.github.com/repos/${o}/${r}`;
const ghHeaders=t=>t?{Accept:'application/vnd.github+json',Authorization:`token ${t}`}:{Accept:'application/vnd.github+json'};

async function getTree(o,r,b,t){
  log('INFO', `Fetch refs ${b}`);
  let ref=await fetch(`${ghBase(o,r)}/git/refs/heads/${b}`,{headers:ghHeaders(t)});
  if(!ref.ok) throw new Error(`refs ${b} → ${ref.status}`);
  let {object:{sha}} = await ref.json();

  log('INFO','Fetch commit');
  let commit=await fetch(`${ghBase(o,r)}/git/commits/${sha}`,{headers:ghHeaders(t)});
  if(!commit.ok) throw new Error(`commit → ${commit.status}`);
  let {tree:{sha:treeSha}} = await commit.json();

  log('INFO','Fetch tree (recursive)');
  let tree=await fetch(`${ghBase(o,r)}/git/trees/${treeSha}?recursive=1`,{headers:ghHeaders(t)});
  if(!tree.ok) throw new Error(`tree → ${tree.status}`);
  let j = await tree.json();

  const paths = (j.tree||[]).filter(n=>n.type==='blob').map(n=>n.path);
  log('INFO','Tree loaded', {files:paths.length});
  return paths;
}

// Build hierarchy
function buildHierarchy(paths){
  const root={name:'/',path:'',type:'dir',open:true,children:new Map(),checked:false,ind:false};
  for(const p of paths){
    const parts=p.split('/'); let cur=root;
    for(let i=0;i<parts.length;i++){
      const name=parts[i], end=i===parts.length-1;
      if(end){
        cur.children.set(name,{name,path:(cur.path?cur.path+'/':'')+name,type:'file',checked:false,ind:false});
      }else{
        if(!cur.children.has(name)){
          cur.children.set(name,{name,path:(cur.path?cur.path+'/':'')+name,type:'dir',open:false,children:new Map(),checked:false,ind:false});
        }
        cur = cur.children.get(name);
      }
    }
  }
  return root;
}

// Tri-state helpers
function setNodeChecked(n,checked){
  n.checked = checked; n.ind = false;
  if(n.type==='file'){
    if(checked) state.selection.add(n.path); else state.selection.delete(n.path);
    return;
  }
  if(n.children) n.children.forEach(ch => setNodeChecked(ch, checked));
}
function refreshTriState(root){
  function dfs(node){
    if(node.type==='file') return {total:1,checked:node.checked?1:0};
    let total=0,checked=0,ind=false;
    node.children.forEach(ch=>{
      const r=dfs(ch); total+=r.total; checked+=r.checked;
      if(ch.ind) ind=true;
    });
    node.ind = ind || (checked>0 && checked<total);
    node.checked = !node.ind && total>0 && (checked===total);
    return {total,checked};
  }
  dfs(root);
}
function getDirVisualState(n){
  if(n.ind) return 'partial';
  if(n.checked) return 'all';
  return 'none';
}
function updateSelCount(){ $('#sel-count').textContent = `Sélection : ${state.selection.size} fichiers`; }

// Render (true tri-state + Safari-safe indeterminate)
function renderTree(root,container){
  container.innerHTML='';
  const ul=document.createElement('ul'); ul.className='branch';

  function nodeRow(n){
    const li=document.createElement('li');
    const row=document.createElement('div'); row.className='node';

    const toggle=document.createElement('span'); toggle.className='toggle';
    toggle.textContent = n.type==='dir' ? (n.open?'▼':'►') : '•';
    if(n.type==='dir'){ toggle.addEventListener('click',()=>{ n.open=!n.open; renderTree(root,container); }); }

    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!n.checked;
    const syncInd=()=>{ cb.indeterminate=!!n.ind; };

    cb.addEventListener('click',(ev)=>{
      if(n.type==='file') return;
      ev.preventDefault(); // handle directory cycle ourselves
      const stateNow=getDirVisualState(n);
      if(stateNow==='partial') setNodeChecked(n,true);
      else if(stateNow==='all') setNodeChecked(n,false);
      else setNodeChecked(n,true);
      refreshTriState(root); renderTree(root,container);
    });

    cb.addEventListener('change',()=>{
      if(n.type!=='file') return; // dirs handled in 'click'
      setNodeChecked(n,cb.checked);
      refreshTriState(root);
      renderTree(root,container);
    });

    const name=document.createElement('span');
    name.className='name '+(n.type==='dir'?'folder':'file');
    name.textContent=n.name||'/'; name.style.display='block';

    row.append(toggle,cb,name); li.appendChild(row);

    if(n.type==='dir' && n.open && n.children && n.children.size){
      const ul2=document.createElement('ul'); ul2.className='branch';
      const sorted=Array.from(n.children.values())
        .sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1)));
      for(const c of sorted) ul2.appendChild(nodeRow(c));
      li.appendChild(ul2);
    }

    // set indeterminate AFTER in DOM (Safari/iPad)
    queueMicrotask(syncInd);
    return li;
  }

  const top=Array.from(root.children.values())
    .sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1)));
  for(const c of top) ul.appendChild(nodeRow(c));

  container.appendChild(ul);
  updateSelCount();
}

// Expand/collapse
function expandAll(n){ if(n.type==='dir'){ n.open=true; n.children.forEach(expandAll);} }
function collapseAll(n){ if(n.type==='dir'){ n.open=false; n.children.forEach(collapseAll);} }

// Selection JSON tool
function generateSelectionJSON(){
  const files = Array.from(state.selection).sort();
  const payload = {
    repo: $('#owner').value.trim() + '/' + $('#repo').value.trim(),
    branch: $('#branch').value.trim(),
    generatedAt: new Date().toISOString(),
    count: files.length,
    paths: files
  };
  $('#json-out').value = JSON.stringify(payload, null, 2);
  log('INFO', 'JSON généré', {count: files.length});
}
async function copyJSON(){
  try{ await navigator.clipboard.writeText($('#json-out').value||''); log('INFO','JSON copié'); }catch{}
}
function downloadJSON(){
  const text = $('#json-out').value || '';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
  a.download='selection.json'; a.click();
}

// Wire tools
$('#btn-gen-json').addEventListener('click', generateSelectionJSON);
$('#btn-copy-json').addEventListener('click', copyJSON);
$('#btn-dl-json').addEventListener('click', downloadJSON);

// Load repo
async function load(){
  const o=$('#owner').value.trim(), r=$('#repo').value.trim(), b=$('#branch').value.trim(), t=$('#token').value.trim();
  const s=$('#status'); s.textContent='Chargement…';
  try{
    const paths=await getTree(o,r,b,t);
    state.root=buildHierarchy(paths);
    state.selection.clear();
    refreshTriState(state.root);
    renderTree(state.root,$('#tree'));
    s.textContent=`OK — ${paths.length} fichiers`;
    log('INFO','Arborescence chargée', {files:paths.length});
  }catch(e){
    s.textContent='Erreur: '+e.message;
    log('ERROR', 'Chargement échoué', {error:String(e)});
  }
}
$('#btn-load').addEventListener('click', load);
$('#btn-expand').addEventListener('click', ()=>{ if(state.root){ expandAll(state.root); renderTree(state.root,$('#tree')); log('INFO','Tout ouvrir'); } });
$('#btn-collapse').addEventListener('click', ()=>{ if(state.root){ collapseAll(state.root); renderTree(state.root,$('#tree')); log('INFO','Tout fermer'); } });

// 🔁 Auto-load au démarrage (MarcLeGuyader/CRM main)
load();
