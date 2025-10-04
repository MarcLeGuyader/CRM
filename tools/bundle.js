// Repository Bundler — English UI, progress bar, per-file error handling, Copy/Download JSON, ZIP export
// Runs fully in the browser. Token (if provided) is used in-memory only.

// ---------- Small DOM helpers ----------
const $ = s => document.querySelector(s);
const outTA = $("#out");
const statusEl = $("#status");
const btnGen = $("#btn-gen");
const btnCopy = $("#btn-copy");
const btnDLJson = $("#btn-dl-json");
const btnDLZip = $("#btn-dl-zip");
const logEl = $("#log");
const prog = $("#prog");
const progText = $("#prog-text");

function log(...args){
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logEl.textContent += (logEl.textContent ? '\n' : '') + line;
  // keep console too
  console.log('[BUNDLER]', ...args);
}
function setStatus(text, cls=''){
  statusEl.textContent = text;
  statusEl.className = 'muted ' + cls;
}

// ---------- Config & utils ----------
const BIN_EXTS = [
  ".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",
  ".pdf",".woff",".woff2",".ttf",".eot",".otf",
  ".zip",".gz",".mp4",".mov",".webm",".mp3",".wav",".7z"
];

function isBinaryPath(p){
  const low = p.toLowerCase();
  return BIN_EXTS.some(ext => low.endsWith(ext));
}

const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
};

function ghBase(owner, repo){ return `https://api.github.com/repos/${owner}/${repo}`; }
function headers(token){
  return token ? { Accept:'application/vnd.github+json', Authorization:`Bearer ${token}` }
               : { Accept:'application/vnd.github+json' };
}

// auto-fill owner/repo if hosted on GitHub Pages like <owner>.github.io/<repo>
(function detectDefaults(){
  try{
    const host = location.hostname; // e.g., marcleguyader.github.io
    const path = location.pathname.split('/').filter(Boolean); // [ "CRM", "tools", "bundle.html" ]
    const owner = host.split('.')[0] || '';
    const repo  = path[0] || '';
    if (!$("#owner").value) $("#owner").value = owner;
    if (!$("#repo").value)  $("#repo").value  = repo;
  }catch{}
})();

// ---------- GitHub API helpers ----------
async function getRepoInfo(owner, repo, token){
  const r = await fetch(`${ghBase(owner,repo)}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`Repo info ${owner}/${repo} -> ${r.status}`);
  return r.json(); // includes default_branch
}
async function getBranchRef(owner, repo, branch, token){
  const r = await fetch(`${ghBase(owner,repo)}/git/refs/heads/${branch}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`refs ${branch} -> ${r.status}`);
  return r.json(); // { object: { sha: <commitSha> } }
}
async function getCommit(owner, repo, commitSha, token){
  const r = await fetch(`${ghBase(owner,repo)}/git/commits/${commitSha}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`commit ${commitSha} -> ${r.status}`);
  return r.json(); // { tree: { sha: <treeSha> } }
}
async function getTreeRecursive(owner, repo, treeSha, token){
  const r = await fetch(`${ghBase(owner,repo)}/git/trees/${treeSha}?recursive=1`, { headers: headers(token) });
  if (!r.ok) throw new Error(`tree ${treeSha} -> ${r.status}`);
  const j = await r.json();
  // keep only blobs (files)
  return (j.tree || []).filter(x => x.type === "blob").map(x => x.path);
}
// Raw fetchers with retries and per-file error handling
async function fetchWithRetry(url, asBinary=false, attempts=3, delayMs=350){
  let lastErr;
  for (let i=0;i<attempts;i++){
    try{
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      if (asBinary){
        const buf = await res.arrayBuffer();
        // convert to base64
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let j=0;j<bytes.length;j++) bin += String.fromCharCode(bytes[j]);
        return btoa(bin);
      } else {
        return await res.text();
      }
    } catch(e){
      lastErr = e;
      if (i < attempts-1) await new Promise(r=>setTimeout(r, delayMs*(i+1)));
    }
  }
  throw lastErr;
}
function rawUrl(owner, repo, branch, path){
  // Use raw.githubusercontent.com for direct content
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

// ---------- Progress helpers ----------
function setProgress(done, total){
  const pct = total ? Math.round((done/total)*100) : 0;
  prog.max = 100;
  prog.value = pct;
  progText.textContent = `${done} / ${total}`;
}

// ---------- Main generator ----------
async function generate(){
  btnGen.disabled = true; btnCopy.disabled = true; btnDLJson.disabled = true; btnDLZip.disabled = true;
  outTA.value = ""; logEl.textContent = ""; setProgress(0, 0);
  setStatus("Detecting repository/branch…");

  try{
    let owner = $("#owner").value.trim();
    let repo  = $("#repo").value.trim();
    let branch= $("#branch").value.trim();
    const token = $("#token").value.trim() || null;

    if (!owner || !repo) throw new Error("Owner and Repository are required.");

    // 1) auto-detect default branch
    if (!branch){
      const info = await getRepoInfo(owner, repo, token);
      branch = info.default_branch || 'main';
      log(`Default branch detected: ${branch}`);
    } else {
      log(`Branch provided: ${branch}`);
    }

    // 2) list and fetch files
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
        items.push({
          path: p,
          size: content.length,
          type: isBin ? "binary" : "text",
          hash,
          content
        });
      } catch(e){
        log(`ERROR fetching ${p}: ${e.message || e}`);
        items.push({
          path: p,
          type: "error",
          error: String(e && e.message ? e.message : e)
        });
      } finally {
        done++; setProgress(done, paths.length);
      }
    }

    // 3) compose bundle JSON
    const now = new Date();
    const versionStr = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }); // spec: FR time in version
    const bundle = {
      meta: {
        project: repo || "CRM_Modular_Full",
        version: `Full Project Capture - ${versionStr}`,
        generatedAt: now.toISOString(),
        totalFiles: items.length
      },
      files: items
    };

    const jsonText = JSON.stringify(bundle, null, 2);
    outTA.value = jsonText;

    setStatus(`Done — ${items.length} files captured.`, "ok");
    btnCopy.disabled = false; btnDLJson.disabled = false; btnDLZip.disabled = false;

  } catch(e){
    setStatus("Error: " + (e.message || e), "warn");
    log("FATAL:", e.message || e);
  } finally {
    btnGen.disabled = false;
  }
}

// ---------- Actions: copy / download JSON / download ZIP ----------
async function copyJSON(){
  try {
    await navigator.clipboard.writeText(outTA.value || "");
    setStatus("Bundle copied to clipboard.", "ok");
  } catch {
    // Fallback
    outTA.select();
    document.execCommand("copy");
    setStatus("Bundle selected; press ⌘/Ctrl+C to copy.", "ok");
  }
}
function fileNameBase(){
  const repo = ($("#repo").value.trim() || "repo");
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  return `${repo}-bundle-${ts}`;
}
function downloadJSON(){
  const blob = new Blob([outTA.value || ""], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileNameBase() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setStatus("JSON downloaded.", "ok");
}
async function downloadZIP(){
  if (!window.JSZip){ setStatus("JSZip not loaded.", "warn"); return; }
  const zip = new JSZip();

  // Always include bundle.json (exact textarea content)
  const bundleText = outTA.value || "{}";
  zip.file("bundle.json", bundleText);

  // Optional: also explode files/ from the bundle (decoded)
  try{
    const parsed = JSON.parse(bundleText);
    if (parsed && Array.isArray(parsed.files)){
      const folder = zip.folder("files");
      let idx = 0, total = parsed.files.length;
      for (const f of parsed.files){
        idx++;
        // progress feedback in status (zip build step)
        if (idx % 25 === 0) setStatus(`Building ZIP… ${idx}/${total}`);

        if (!f || !f.path) continue;
        if (f.type === "binary" && typeof f.content === "string"){
          folder.file(f.path, f.content, { base64: true });
        } else if (f.type === "text" && typeof f.content === "string"){
          folder.file(f.path, f.content);
        } else if (f.type === "error"){
          // record an error note file so nothing is hidden
          folder.file(f.path + ".ERROR.txt", String(f.error || "unknown error"));
        } else if (typeof f.content === "string"){
          // default fallback
          folder.file(f.path, f.content);
        }
      }
    }
  } catch(e){
    log("ZIP build note:", e.message || e);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileNameBase() + ".zip";
  document.body.appendChild(a); a.click(); a.remove();
  setStatus("ZIP downloaded.", "ok");
}

// ---------- Wire up UI ----------
btnGen.addEventListener('click', generate);
btnCopy.addEventListener('click', copyJSON);
btnDLJson.addEventListener('click', downloadJSON);
btnDLZip.addEventListener('click', downloadZIP);
