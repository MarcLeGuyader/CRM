const $ = s => document.querySelector(s);
const state = {root:null,selection:new Set()};
const ghBase=(o,r)=>`https://api.github.com/repos/${o}/${r}`;
const ghHeaders=t=>t?{Accept:'application/vnd.github+json',Authorization:`token ${t}`}:{Accept:'application/vnd.github+json'};
async function getTree(o,r,b,t){
 let ref=await fetch(`${ghBase(o,r)}/git/refs/heads/${b}`,{headers:ghHeaders(t)});
 if(!ref.ok)throw new Error(`refs ${b} → ${ref.status}`);
 let refJ=await ref.json();
 let commit=await fetch(`${ghBase(o,r)}/git/commits/${refJ.object.sha}`,{headers:ghHeaders(t)});
 let commitJ=await commit.json();
 let tree=await fetch(`${ghBase(o,r)}/git/trees/${commitJ.tree.sha}?recursive=1`,{headers:ghHeaders(t)});
 let treeJ=await tree.json();
 return(treeJ.tree||[]).filter(n=>n.type==='blob').map(n=>n.path);
}
function buildHierarchy(paths){const root={name:'/',path:'',type:'dir',open:true,children:new Map(),checked:false,ind:false};
 for(const p of paths){const parts=p.split('/');let cur=root;
  for(let i=0;i<parts.length;i++){const name=parts[i],end=i===parts.length-1;
   if(end){cur.children.set(name,{name,path:(cur.path?cur.path+'/':'')+name,type:'file',checked:false,ind:false});}
   else{if(!cur.children.has(name)){cur.children.set(name,{name,path:(cur.path?cur.path+'/':'')+name,type:'dir',open:false,children:new Map(),checked:false,ind:false});}
        cur=cur.children.get(name);} } }return root;}
function setNodeChecked(n,chk){n.checked=chk;n.ind=false;if(n.type==='file'){if(chk)state.selection.add(n.path);else state.selection.delete(n.path);}else if(n.children){n.children.forEach(ch=>setNodeChecked(ch,chk));}}
function refreshTriState(root){function walk(n){if(n.type==='file')return{total:1,checked:n.checked?1:0};
 let tot=0,ch=0,ind=false;n.children.forEach(c=>{const r=walk(c);tot+=r.total;ch+=r.checked;if(c.ind)ind=true;});
 n.ind=ind||(ch>0&&ch<tot);n.checked=(ch===tot&&tot>0&&!n.ind);return{total:tot,checked:ch};}walk(root);}
function updateSelCount(){$('#sel-count').textContent=`Sélection : ${state.selection.size} fichiers`;}

function renderTree(root,c){c.innerHTML='';const ul=document.createElement('ul');ul.className='branch';
 function nodeRow(n){const li=document.createElement('li');const row=document.createElement('div');row.className='node';
  const toggle=document.createElement('span');toggle.className='toggle';toggle.textContent=n.type==='dir'?(n.open?'▼':'►'):'•';
  if(n.type==='dir'){toggle.addEventListener('click',()=>{n.open=!n.open;renderTree(root,c);});}
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!n.checked;cb.indeterminate=!!n.ind;
  cb.addEventListener('change',()=>{setNodeChecked(n,cb.checked);refreshTriState(root);renderTree(root,c);});
  const name=document.createElement('span');name.className='name '+(n.type==='dir'?'folder':'file');name.textContent=n.name||'/';name.style.display='block';
  row.append(toggle,cb,name);li.appendChild(row);
  if(n.type==='dir'&&n.open&&n.children&&n.children.size){const ul2=document.createElement('ul');ul2.className='branch';
   const sorted=Array.from(n.children.values()).sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1)));
   for(const c2 of sorted)ul2.appendChild(nodeRow(c2));li.appendChild(ul2);}return li;}
 for(const c2 of Array.from(root.children.values()).sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1))))ul.appendChild(nodeRow(c2));
 c.appendChild(ul);updateSelCount();}

async function load(){const o=$('#owner').value.trim(),r=$('#repo').value.trim(),b=$('#branch').value.trim(),t=$('#token').value.trim(),s=$('#status');
 s.textContent='Chargement…';try{const p=await getTree(o,r,b,t);state.root=buildHierarchy(p);state.selection.clear();refreshTriState(state.root);renderTree(state.root,$('#tree'));s.textContent=`OK — ${p.length} fichiers`;}catch(e){s.textContent='Erreur: '+e.message;}}
$('#btn-load').addEventListener('click',load);
load();