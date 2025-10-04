// Full project bundler (GitHub API based) — captures absolutely everything from the branch
// Works on GitHub Pages: lists files via GitHub REST API, fetches contents via raw.githubusercontent.com

const $ = s => document.querySelector(s);
const outTA = $("#out");
const statusEl = $("#status");
const btnGen = $("#btn-gen");
const btnCopy = $("#btn-copy");

// Extensions courantes binaires (on peut en rajouter si besoin)
const BIN_EXTS = [
  ".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",
  ".pdf",".woff",".woff2",".ttf",".eot",".otf",
  ".zip",".gz",".mp4",".mov",".webm",".mp3",".wav"
];

// -------- Helpers ------------------------------------------------------------

const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
};

function isBinaryPath(p){
  const low = p.toLowerCase();
  return BIN_EXTS.some(ext => low.endsWith(ext));
}

function detectRepo(){
  // Ex: https://marcleguyader.github.io/CRM/tools/bundle.html
  const owner = location.hostname.split(".")[0];
  const parts = location.pathname.split("/").filter(Boolean); // ["CRM","tools","bundle.html"]
  const repo  = parts[0] || "";
  const branch = "main";
  return { owner, repo, branch };
}

function ghBase(owner, repo){ return `https://api.github.com/repos/${owner}/${repo}`; }

// -------- GitHub API: list tree ---------------------------------------------

async function getBranchRef(owner, repo, branch){
  const r = await fetch(`${ghBase(owner,repo)}/git/refs/heads/${branch}`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!r.ok) throw new Error(`refs ${branch} -> ${r.status}`);
  return r.json(); // { object: { sha: <commitSha> } }
}

async function getCommit(owner, repo, commitSha){
  const r = await fetch(`${ghBase(owner,repo)}/git/commits/${commitSha}`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!r.ok) throw new Error(`commit ${commitSha} -> ${r.status}`);
  return r.json(); // { tree: { sha: <treeSha> } }
}

async function getTreeRecursive(owner, repo, treeSha){
  const r = await fetch(`${ghBase(owner,repo)}/git/trees/${treeSha}?recursive=1`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!r.ok) throw new Error(`tree ${treeSha} -> ${r.status}`);
  const j = await r.json();
  // ne garder que les blobs (fichiers)
  return (j.tree || []).filter(x => x.type === "blob").map(x => x.path);
}

// -------- Fetch file content -------------------------------------------------

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

// -------- Main generation ----------------------------------------------------

async function generate(){
  btnGen.disabled = true;
  btnCopy.disabled = true;
  statusEl.textContent = "Listing repository files via API…";
  outTA.value = "";

  try {
    const { owner, repo, branch } = detectRepo();

    // 1) Lister tous les fichiers du repo/branche via API
    const ref = await getBranchRef(owner, repo, branch);
    const commitSha = ref.object.sha;
    const commit = await getCommit(owner, repo, commitSha);
    const treeSha = commit.tree.sha;

    const paths = await getTreeRecursive(owner, repo, treeSha);
    statusEl.textContent = `Found ${paths.length} files. Fetching contents…`;

    // 2) Télécharger chaque fichier (texte vs binaire)
    const items = [];
    for (const p of paths){
      try {
        const binary = isBinaryPath(p);
        if (binary){
          const content = await fetchRawBinaryBase64(owner, repo, branch, p);
          items.push({ path: p, size: content.length, type: "binary", hash: djb2(content), content });
        } else {
          const content = await fetchRawText(owner, repo, branch, p);
          items.push({ path: p, size: content.length, type: "text", hash: djb2(content), content });
        }
      } catch (e){
        items.push({ path: p, error: String(e.message || e) });
      }
    }

    // 3) Bundle JSON
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

  } catch (e){
    statusEl.textContent = "❌ Error: " + (e.message || e);
  } finally {
    btnGen.disabled = false;
  }
}

// -------- Copy ---------------------------------------------------------------

async function copyOut(){
  try {
    await navigator.clipboard.writeText(outTA.value || "");
    statusEl.textContent = "Copied to clipboard.";
  } catch {
    outTA.select();
    document.execCommand("copy");
  }
}

// Events
btnGen.addEventListener("click", generate);
btnCopy.addEventListener("click", copyOut);
