const $ = s => document.querySelector(s);
const state = { root: null, selection: new Set() };

// --- GitHub API
const ghBase = (o,r)=>`https://api.github.com/repos/${o}/${r}`;
const ghHeaders = t => t ? {Accept:'application/vnd.github+json',Authorization:`token ${t}`} : {Accept:'application/vnd.github+json'};

async function getTree(o,r,b,t){
  const ref = await fetch(`${ghBase(o,r)}/git/refs/heads/${b}`,{headers:ghHeaders(t)});
  if(!ref.ok) throw new Error(`refs ${b} → ${ref.status}`);
  const {object:{sha}} = await ref.json();
  const commit = await fetch(`${ghBase(o,r)}/git/commits/${sha}`,{headers:ghHeaders(t)});
  if(!commit.ok) throw new Error(`commit → ${commit.status}`);
  const {tree:{sha:treeSha}} = await commit.json();
  const tree = await fetch(`${ghBase(o,r)}/git/trees/${treeSha}?recursive=1`,{headers:ghHeaders(t)});
  if(!tree.ok) throw new Error(`tree → ${tree.status}`);
  const j = await tree.json();
  return (j.tree||[]).filter(n=>n.type==='blob').map(n=>n.path);
}

// --- Build hierarchy
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

// --- Tri-state helpers
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

// --- Render (true tri-state)
function renderTree(root,container){
  container.innerHTML='';
  const ul=document.createElement('ul'); ul.className='branch';

  function nodeRow(n){
    const li=document.createElement('li');
    const row=document.createElement('div'); row.className='node';

    const toggle=document.createElement('span'); toggle.className='toggle';
    toggle.textContent = n.type==='dir' ? (n.open?'▼':'►') : '•';
    if(n.type==='dir'){ toggle.addEventListener('click',()=>{n.open=!n.open;renderTree(root,container);}); }

    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!n.checked;
    const syncInd=()=>{ cb.indeterminate=!!n.ind; };

    cb.addEventListener('click',(ev)=>{
      if(n.type==='file') return;
      ev.preventDefault();
      const stateNow=getDirVisualState(n);
      if(stateNow==='partial') setNodeChecked(n,true);
      else if(stateNow==='all') setNodeChecked(n,false);
      else setNodeChecked(n,true);
      refreshTriState(root); renderTree(root,container);
    });

    cb.addEventListener('change',()=>{
      if(n.type!=='file') return;
      setNodeChecked(n,cb.checked);
      refreshTriState(root);
      renderTree(root,container);
    });

    const name=document.createElement('span');
    name.className='name '+(n.type==='dir'?'folder':'file');
    name.textContent=n.name||'/';
    name.style.display='block';

    row.append(toggle,cb,name);
    li.appendChild(row);

    if(n.type==='dir' && n.open && n.children && n.children.size){
      const ul2=document.createElement('ul'); ul2.className='branch';
      const sorted=Array.from(n.children.values())
        .sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1)));
      for(const c of sorted) ul2.appendChild(nodeRow(c));
      li.appendChild(ul2);
    }

    queueMicrotask(syncInd); // Safari/iPad
    return li;
  }

  const sortedTop=Array.from(root.children.values())
    .sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1)));
  for(const c of sortedTop) ul.appendChild(nodeRow(c));

  container.appendChild(ul);
  updateSelCount();
}

// --- Utils for expand/collapse/all/none
function expandAll(n){if(n.type==='dir'){n.open=true;n.children.forEach(expandAll);}}
function collapseAll(n){if(n.type==='dir'){n.open=false;n.children.forEach(collapseAll);}}
function checkAll(n){setNodeChecked(n,true);}
function uncheckAll(n){setNodeChecked(n,false);}

// --- Load repo
async function load(){
  const o=$('#owner').value.trim(),r=$('#repo').value.trim(),b=$('#branch').value.trim(),t=$('#token').value.trim();
  const s=$('#status'); s.textContent='Chargement…';
  try{
    const paths=await getTree(o,r,b,t);
    state.root=buildHierarchy(paths);
    state.selection.clear();
    refreshTriState(state.root);
    renderTree(state.root,$('#tree'));
    s.textContent=`OK — ${paths.length} fichiers`;
  }catch(e){ s.textContent='Erreur: '+e.message; }
}

// --- Buttons
$('#btn-load').addEventListener('click',load);
$('#btn-expand').addEventListener('click',()=>{if(state.root){expandAll(state.root);renderTree(state.root,$('#tree'));}});
$('#btn-collapse').addEventListener('click',()=>{if(state.root){collapseAll(state.root);renderTree(state.root,$('#tree'));}});
$('#btn-all').addEventListener('click',()=>{if(state.root){checkAll(state.root);refreshTriState(state.root);renderTree(state.root,$('#tree'));}});
$('#btn-none').addEventListener('click',()=>{if(state.root){uncheckAll(state.root);refreshTriState(state.root);renderTree(state.root,$('#tree'));}});

// Auto-load default
load();
