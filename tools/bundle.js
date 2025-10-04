// Full project bundler (GitHub API) avec détection auto de la branche, token optionnel, et log

const $ = s => document.querySelector(s);
const outTA = $("#out");
const statusEl = $("#status");
const btnGen = $("#btn-gen");
const btnCopy = $("#btn-copy");
const logEl = $("#log");

function log(...args){
  const line = args.map(a=>typeof a==='object'?JSON.stringify(a):String(a)).join(' ');
  logEl.textContent += (logEl.textContent?'\n':'') + line;
  console.log('[BUNDLE]', ...args);
}

const BIN_EXTS = [
  ".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",
  ".pdf",".woff",".woff2",".ttf",".eot",".otf",
  ".zip",".gz",".mp4",".mov",".webm",".mp3",".wav"
];

const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
};

function isBinaryPath(p){
  const low = p.toLowerCase();
  return BIN_EXTS.some(ext => low.endsWith(ext));
}

function ghBase(owner, repo){ return `https://api.github.com/repos/${owner}/${repo}`; }

function headers(token){
  return token ? { Accept:'application/vnd.github+json', Authorization:`Bearer ${token}` }
               : { Accept:'application/vnd.github+json' };
}

async function detectDefaults(){
  // propose owner/repo depuis l’URL GitHub Pages
  try{
    const host = location.hostname; // ex: marcleguyader.github.io
    const path = location.pathname.split('/').filter(Boolean); // ["CRM","tools","bundle.html"]
    const owner = host.split('.')[0] || '';
    const repo  = path[0] || '';
    if (!$("#owner").value) $("#owner").value = owner;
    if (!$("#repo").value)  $("#repo").value  = repo;
  }catch{}
}

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
  return (j.tree || []).filter(x => x.type === "blob").map(x => x.path);
}

async function fetchRawText(owner, repo, branch, path){
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`raw text ${path} -> ${res.status}`);
  return await res.text();
}

async function fetchRawBinaryBase64(owner, repo, branch, path){
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`raw bin ${path} -> ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function generate(){
  btnGen.disabled = true; btnCopy.disabled = true; outTA.value = ""; logEl.textContent = "";
  statusEl.textContent = "Detecting repo/branch…";

  try{
    // 1) lire paramètres
    let owner = $("#owner").value.trim();
    let repo  = $("#repo").value.trim();
    let branch= $("#branch").value.trim();
    const token = $("#token").value.trim() || null;

    if (!owner || !repo){
      throw new Error("Owner et Repository requis (ex: owner=marcleguyader, repo=CRM).");
    }

    // 2) détecter la branche par défaut si non fournie
    if (!branch){
      const info = await getRepoInfo(owner, repo, token);
      branch = info.default_branch || 'main';
      log(`Default branch detected: ${branch}`);
    } else {
      log(`Branch provided: ${branch}`);
    }

    // 3) lister tous les fichiers
    const ref = await getBranchRef(owner, repo, branch, token);
    const commitSha = ref.object.sha;
    log('Commit SHA:', commitSha);

    const commit = await getCommit(owner, repo, commitSha, token);
    const treeSha = commit.tree.sha;
    log('Tree SHA:', treeSha);

    const paths = await getTreeRecursive(owner, repo, treeSha, token);
    log(`Found ${paths.length} files in tree`);
    statusEl.textContent = `Found ${paths.length} files. Fetching contents…`;

    if (!paths.length){
      statusEl.textContent = "0 fichier trouvé. Vérifie la branche ou les permissions du repo.";
    }

    // 4) télécharger contenu de chaque fichier
    const items = [];
    for (const p of paths){
      try{
        const binary = isBinaryPath(p);
        if (binary){
          const content = await fetchRawBinaryBase64(owner, repo, branch, p);
          items.push({ path: p, size: content.length, type: "binary", hash: djb2(content), content });
        } else {
          const content = await fetchRawText(owner, repo, branch, p);
          items.push({ path: p, size: content.length, type: "text", hash: djb2(content), content });
        }
      } catch(e){
        items.push({ path: p, error: String(e.message || e) });
      }
    }

    // 5) bundle final
    const now = new Date();
    const versionStr = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    const bundle = {
      meta: {
        project: repo || "CRM_Modular_Full",
        version: `Full Project Capture - ${versionStr}`,
        generatedAt: now.toISOString(),
        totalFiles: items.length
      },
      files: items
    };

    outTA.value = JSON.stringify(bundle, null, 2);
    statusEl.textContent = `✅ Done — ${items.length} files captured.`;
    btnCopy.disabled = false;

  } catch(e){
    statusEl.textContent = "❌ Error: " + (e.message || e);
    log('ERROR:', e.message || e);
  } finally {
    btnGen.disabled = false;
  }
}

async function copyOut(){
  try { await navigator.clipboard.writeText(outTA.value || ""); statusEl.textContent = "Copied to clipboard."; }
  catch { outTA.select(); document.execCommand("copy"); }
}

// init
await detectDefaults();
btnGen.addEventListener('click', generate);
btnCopy.addEventListener('click', copyOut);
