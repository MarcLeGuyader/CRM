// Repository Bundler — English UI, progress bar, per-file error handling, Copy/Download JSON, ZIP export

let $, outTA, statusEl, btnGen, btnCopy, btnDLJson, btnDLZip, logEl, prog, progText;

function initSelectors(){
  $ = (s) => document.querySelector(s);
  outTA      = $("#out");
  statusEl   = $("#status");
  btnGen     = $("#btn-gen");
  btnCopy    = $("#btn-copy");
  btnDLJson  = $("#btn-dl-json");
  btnDLZip   = $("#btn-dl-zip");
  logEl      = $("#log");
  prog       = $("#prog");
  progText   = $("#prog-text");
}

function log(...args){
  if (!logEl) return;
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logEl.textContent += (logEl.textContent ? '\n' : '') + line;
  console.log('[BUNDLER]', ...args);
}
function setStatus(text, cls=''){
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'muted ' + cls;
}

// ---- Config & utils
const BIN_EXTS = [".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".otf",".zip",".gz",".mp4",".mov",".webm",".mp3",".wav",".7z"];
const isBinaryPath = (p)=> BIN_EXTS.some(ext => p.toLowerCase().endsWith(ext));
const djb2 = (str) => { let h=5381; for (let i=0;i<str.length;i++) h=((h<<5)+h)+str.charCodeAt(i); return (h>>>0).toString(16).padStart(8,"0"); };

const ghBase = (owner, repo) => `https://api.github.com/repos/${owner}/${repo}`;
const headers = (token) => token ? { Accept:'application/vnd.github+json', Authorization:`Bearer ${token}` } : { Accept:'application/vnd.github+json' };

// Try to auto-fill owner/repo if hosted on Pages
function detectDefaults(){
  try{
    const host = location.hostname;             // e.g., marcleguyader.github.io
    const path = location.pathname.split('/').filter(Boolean); // [repo, ...]
    const owner = host.split('.')[0] || '';
    const repo  = path[0] || '';
    const o = $("#owner"), r = $("#repo");
    if (o && !o.value) o.value = owner;
    if (r && !r.value) r.value = repo;
  }catch{}
}

// ---- GitHub API helpers
async function getRepoInfo(owner, repo, token){
  const r = await fetch(`${ghBase(owner,repo)}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`Repo info ${owner}/${repo} -> ${r.status}`);
  return r.json();
}
async function getBranchRef(owner, repo, branch, token){
  const r = await fetch(`${ghBase(owner,repo)}/git/refs/heads/${branch}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`refs ${branch} -> ${r.status}`);
  return r.json();
}
async function getCommit(owner, repo, commitSha, token){
  const r = await fetch(`${ghBase(owner,repo)}/git/commits/${commitSha}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`commit ${commitSha} -> ${r.status}`);
  return r.json();
}
async function getTreeRecursive(owner, repo, treeSha, token){
  const r = await fetch(`${ghBase(owner,repo)}/git/trees/${treeSha}?recursive=1`, { headers: headers(token) });
  if (!r.ok) throw new Error(`tree ${treeSha} -> ${r.status}`);
  const j = await r.json();
  return (j.tree || []).filter(x => x.type === "blob").map(x => x.path);
}
async function fetchWithRetry(url, asBinary=false, attempts=3, delayMs=350){
  let lastErr;
  for (let i=0;i<attempts;i++){
    try{
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      if (asBinary){
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let j=0;j<bytes.length;j++) bin += String.fromCharCode(bytes[j]);
        return btoa(bin);
      }
      return await res.text();
    }catch(e){
      lastErr = e;
      if (i < attempts-1) await new Promise(r=>setTimeout(r, delayMs*(i+1)));
    }
  }
  throw lastErr;
}
const rawUrl = (owner, repo, branch, path) => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

// ---- Progress
function setProgress(done, total){
  if (!prog || !progText) return;
  const pct = total ? Math.round((done/total)*100) : 0;
  prog.max = 100;
  prog.value = pct;
  progText.textContent = `${done} / ${total}`;
}

// ---- Main
async function generate(){
  if (!btnGen) return;
  btnGen.disabled = true;
  if (btnCopy) btnCopy.disabled = true;
  if (btnDLJson) btnDLJson.disabled = true;
  if (btnDLZip) btnDLZip.disabled = true;
  if (outTA) outTA.value = "";
  if (logEl) logEl.textContent = "";
  setProgress(0, 0);
  setStatus("Detecting repository/branch…");

  try{
    const owner = ($("#owner")?.value || "").trim();
    const repo  = ($("#repo") ?.value || "").trim();
    let branch  = ($("#branch")?.value || "").trim();
    const token = ($("#token") ?.value || "").trim() || null;

    if (!owner || !repo) throw new Error("Owner and Repository are required.");

    if (!branch){
      const info = await getRepoInfo(owner, repo, token);
      branch = info.default_branch || 'main';
      log(`Default branch detected: ${branch}`);
    } else {
      log(`Branch provided: ${branch}`);
    }

    const ref = await getBranchRef(owner, repo, branch, token);
    const commitSha = ref.object.sha;
    log('Commit SHA:', commitSha);

    const commit = await getCommit(owner, repo, commitSha, token);
    const treeSha = commit.tree.sha;
    log('Tree SHA:', treeSha);

    const paths = await getTreeRecursive(owner, repo, treeSha, token);
    log(`Found ${paths.length} files in tree`);
    setStatus(`Fetching ${paths.length} files…`);
    setProgress(0, paths.length);

    const items = [];
    let done = 0;
    for (const p of paths){
      const isBin = isBinaryPath(p);
      const url = rawUrl(owner, repo, branch, p);
      try{
        const content = await fetchWithRetry(url, isBin, 3, 350);
        const hash = djb2(content);
        items.push({ path: p, size: content.length, type: isBin ? "binary" : "text", hash, content });
      }catch(e){
        log(`ERROR fetching ${p}: ${e.message || e}`);
        items.push({ path: p, type: "error", error: String(e && e.message ? e.message : e) });
      }finally{
        done++; setProgress(done, paths.length);
      }
    }

    const now = new Date();
    const versionStr = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    const bundle = {
      meta: { project: repo || "CRM_Modular_Full", version: `Full Project Capture - ${versionStr}`, generatedAt: now.toISOString(), totalFiles: items.length },
      files: items
    };
    const jsonText = JSON.stringify(bundle, null, 2);
    if (outTA) outTA.value = jsonText;

    setStatus(`Done — ${items.length} files captured.`, "ok");
    if (btnCopy) btnCopy.disabled = false;
    if (btnDLJson) btnDLJson.disabled = false;
    if (btnDLZip) btnDLZip.disabled = false;

  } catch(e){
    setStatus("Error: " + (e.message || e), "warn");
    log("FATAL:", e.message || e);
  } finally {
    if (btnGen) btnGen.disabled = false;
  }
}

// ---- Actions
async function copyJSON(){
  try{
    await navigator.clipboard.writeText(outTA?.value || "");
    setStatus("Bundle copied to clipboard.", "ok");
  }catch{
    outTA?.select();
    document.execCommand("copy");
    setStatus("Bundle selected; press ⌘/Ctrl+C to copy.", "ok");
  }
}
function fileNameBase(){
  const repo = ($("#repo")?.value.trim() || "repo");
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  return `${repo}-bundle-${ts}`;
}
function downloadJSON(){
  const blob = new Blob([outTA?.value || ""], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileNameBase() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setStatus("JSON downloaded.", "ok");
}
async function downloadZIP(){
  if (!window.JSZip){ setStatus("JSZip not loaded.", "warn"); return; }
  const zip = new JSZip();
  const bundleText = outTA?.value || "{}";
  zip.file("bundle.json", bundleText);

  try{
    const parsed = JSON.parse(bundleText);
    if (parsed && Array.isArray(parsed.files)){
      const folder = zip.folder("files");
      let i=0;
      for (const f of parsed.files){
        i++; if (i % 25 === 0) setStatus(`Building ZIP… ${i}/${parsed.files.length}`);
        if (!f || !f.path) continue;
        if (f.type === "binary" && typeof f.content === "string"){ folder.file(f.path, f.content, { base64: true }); }
        else if (f.type === "text" && typeof f.content === "string"){ folder.file(f.path, f.content); }
        else if (f.type === "error"){ folder.file(f.path + ".ERROR.txt", String(f.error || "unknown error")); }
        else if (typeof f.content === "string"){ folder.file(f.path, f.content); }
      }
    }
  }catch(e){ log("ZIP note:", e.message || e); }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileNameBase() + ".zip";
  document.body.appendChild(a); a.click(); a.remove();
  setStatus("ZIP downloaded.", "ok");
}

// ---- Boot (ensure DOM is ready before wiring)
window.addEventListener('DOMContentLoaded', () => {
  initSelectors();
  console.log('[BUNDLER] boot');
  detectDefaults();

  if (!btnGen) { console.error('btn-gen not found'); setStatus('Init error: button not found', 'warn'); return; }

  btnGen.addEventListener('click', generate);
  btnCopy?.addEventListener('click', copyJSON);
  btnDLJson?.addEventListener('click', downloadJSON);
  btnDLZip?.addEventListener('click', downloadZIP);

  setStatus('Ready.');
});
