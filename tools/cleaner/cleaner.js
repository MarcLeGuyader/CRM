
// Repo Cleaner Tool (client-side only)
const $ = s => document.querySelector(s);
const logEl = $("#log"), statusEl = $("#status"), prog = $("#prog");
function log(...a){ logEl.textContent += (logEl.textContent?"\n":"")+a.join(" "); logEl.scrollTop=logEl.scrollHeight; console.log("[CLEANER]",...a); }
function setStatus(t,cls=""){ statusEl.textContent=t; statusEl.className=cls; }
function setProg(v){ prog.value=v; }

const gh = (o,r) => `https://api.github.com/repos/${o}/${r}`;

async function ghFetch(url, token){
  const res = await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json"}});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function getTree(o,r,b,tok){
  const ref = await ghFetch(`${gh(o,r)}/git/refs/heads/${b}`,tok);
  const sha = ref.object.sha;
  const commit = await ghFetch(`${gh(o,r)}/git/commits/${sha}`,tok);
  const treeSha = commit.tree.sha;
  const tree = await ghFetch(`${gh(o,r)}/git/trees/${treeSha}?recursive=1`,tok);
  return tree.tree.filter(x=>x.type==="blob").map(x=>x.path);
}
async function getSha(o,r,tok,path){
  const url = `${gh(o,r)}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url,{headers:{Authorization:`Bearer ${tok}`}});
  if(res.status===404) return null;
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const j = await res.json(); return j.sha;
}
async function delFile(o,r,b,tok,path,msg,sha){
  const url = `${gh(o,r)}/contents/${encodeURIComponent(path)}`;
  const body = {message:msg,branch:b,sha};
  const res = await fetch(url,{method:"DELETE",headers:{Authorization:`Bearer ${tok}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok) throw new Error(`${res.status}`);
  return true;
}

async function analyze(apply=false){
  try{
    const o=$("#gh-owner").value.trim(), r=$("#gh-repo").value.trim(), b=$("#gh-branch").value.trim(), t=$("#gh-token").value.trim();
    if(!o||!r||!t) throw new Error("Missing required fields");
    setStatus("Fetching tree…"); logEl.textContent="";
    const all=await getTree(o,r,b,t);
    const keep=$("#keep-list").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const keepP=keep.filter(x=>x.endsWith("/")), keepF=keep.filter(x=>!x.endsWith("/"));
    const del=all.filter(p=>!keepF.includes(p)&&!keepP.some(k=>p.startsWith(k)));
    setProg(0);
    log(`Found ${all.length} files, will delete ${del.length}`);
    if(!apply){ $("#btn-clean").disabled=false; setStatus("Dry-run complete.","ok"); return {all,del}; }
    let done=0; for(const f of del){ done++; setProg((done/del.length)*100); try{
      const sha=await getSha(o,r,t,f); if(sha){ await delFile(o,r,b,t,f,"[clean] remove unused",sha); log(`🗑️ ${f}`); }
    }catch(e){ log(`⚠️ ${f} ${e.message}`);} }
    setStatus("Cleanup done","ok"); log("✅ Cleanup complete.");
  }catch(e){ setStatus("Error: "+e.message,"warn"); log("❌",e.message); }
}

$("#btn-analyze").addEventListener("click",()=>analyze(false));
$("#btn-clean").addEventListener("click",()=>analyze(true));
$("#btn-download").addEventListener("click",()=>{
  const blob=new Blob([logEl.textContent],{type:"text/plain"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download="repo-cleaner-report.txt";a.click();a.remove();
});
setStatus("Ready.");
