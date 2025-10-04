// Deploy to GitHub from bundle JSON or ZIP — client-only, commits via REST API
// Notes sécurité: le token n'est jamais stocké (mémoire volatile du navigateur).

const $ = s => document.querySelector(s);
const logEl = $("#log");
const statusEl = $("#status");

function log(...args){ const line=args.map(a=>typeof a==='object'?JSON.stringify(a):String(a)).join(' '); logEl.textContent += (logEl.textContent?'\n':'') + line; }
function setStatus(s, cls=''){ statusEl.textContent=s; statusEl.className='muted '+cls; }

const state = {
  files: null,     // [{path, content(base64 or text), type: 'text'|'binary'}...]
  removeList: [],  // computed when mode=replace
};

const BIN_EXTS = [".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".zip",".mp4",".mov"];

function isBinaryPath(p){ const low=p.toLowerCase(); return BIN_EXTS.some(ext=>low.endsWith(ext)); }

function fromBundleJSON(txt){
  const j = JSON.parse(txt);
  if (!j.files || !Array.isArray(j.files)) throw new Error("JSON invalide: 'files' absent");
  // normalise
  return j.files
    .filter(f => f && f.path && (f.content!=null || f.error==null))
    .map(f => ({
      path: f.path.replace(/^\.?\//,''),
      type: f.type || (isBinaryPath(f.path) ? 'binary' : 'text'),
      // le bundle peut contenir du base64 pour binary; pour text on prend tel quel
      content: String(f.content ?? '')
    }));
}

async function fromZipFile(file){
  const zip = await JSZip.loadAsync(file);
  const out = [];
  await Promise.all(Object.keys(zip.files).map(async name => {
    const entry = zip.files[name];
    if (entry.dir) return;
    const path = name.replace(/^\.?\//,'');
    const binary = isBinaryPath(path);
    const content = binary
      ? await entry.async('base64')
      : await entry.async('text');
    out.push({ path, type: binary ? 'binary' : 'text', content });
  }));
  return out;
}

// ---- GitHub REST helpers ----------------------------------------------------
function ghBase(owner, repo){ return `https://api.github.com/repos/${owner}/${repo}`; }

async function ghGet(owner, repo, token, path){
  const r = await fetch(`${ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  return r;
}

async function ghPut(owner, repo, token, branch, path, contentBase64, message, sha=null){
  const body = { message, content: contentBase64, branch };
  if (sha) body.sha = sha;
  const r = await fetch(`${ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body)
  });
  if (!r.ok){ const t=await r.text(); throw new Error(`PUT ${path} -> ${r.status}: ${t}`); }
  return r.json();
}

async function ghDelete(owner, repo, token, branch, path, message, sha){
  const r = await fetch(`${ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message, branch, sha })
  });
  if (!r.ok){ const t=await r.text(); throw new Error(`DEL ${path} -> ${r.status}: ${t}`); }
  return r.json();
}

async function getShaIfExists(owner, repo, token, path){
  const r = await ghGet(owner, repo, token, path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HEAD ${path} -> ${r.status}`);
  const j = await r.json();
  return j.sha || null;
}

async function listRepoTree(owner, repo, token, branch){
  // récupère le SHA de la branche puis l'arbre complet
  const r1 = await fetch(`${ghBase(owner,repo)}/git/refs/heads/${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (!r1.ok) throw new Error(`refs ${branch} -> ${r1.status}`);
  const ref = await r1.json();
  const commitSha = ref.object.sha;

  const r2 = await fetch(`${ghBase(owner,repo)}/git/commits/${commitSha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (!r2.ok) throw new Error(`commit -> ${r2.status}`);
  const commit = await r2.json();
  const treeSha = commit.tree.sha;

  const r3 = await fetch(`${ghBase(owner,repo)}/git/trees/${treeSha}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (!r3.ok) throw new Error(`tree -> ${r3.status}`);
  const tree = await r3.json();
  // ne renvoie que les blobs (fichiers)
  return (tree.tree || []).filter(x => x.type === 'blob').map(x => x.path);
}

// -----------------------------------------------------------------------------

function toBase64(str){
  // encode text to base64 (UTF-8)
  return btoa(unescape(encodeURIComponent(str)));
}

async function validateInput(){
  const jsonTxt = $("#json-in").value.trim();
  const zipFile = $("#zip-in").files[0] || null;
  if (!jsonTxt && !zipFile) throw new Error("Fournis un bundle JSON OU un fichier ZIP.");

  if (jsonTxt){
    state.files = fromBundleJSON(jsonTxt);
    log(`Bundle JSON: ${state.files.length} fichier(s) prêts.`);
  } else {
    state.files = await fromZipFile(zipFile);
    log(`ZIP: ${state.files.length} fichier(s) prêts.`);
  }
}

function sanityFilter(list){
  // on évite d'écraser l'outil lui-même en mode replace
  return list.filter(p => !/^tools\/deploy\.(html|js)$/i.test(p));
}

async function dryRun(){
  const owner = $("#gh-owner").value.trim();
  const repo  = $("#gh-repo").value.trim();
  const branch= $("#gh-branch").value.trim() || "main";
  const token = $("#gh-token").value.trim();
  const mode  = $("#mode").value;

  if (!owner || !repo || !token) throw new Error("Owner, repo, token requis.");

  const incoming = state.files.map(f=>f.path);
  log(`Incoming paths: ${incoming.length}`);

  if (mode === 'replace'){
    const existing = await listRepoTree(owner, repo, token, branch);
    const toRemove = sanityFilter(existing.filter(p => !incoming.includes(p)));
    state.removeList = toRemove;
    log(`Mode REPLACE: ${toRemove.length} fichier(s) seront supprimés (hors tools/deploy.*).`);
  } else {
    state.removeList = [];
    log(`Mode PATCH: aucune suppression.`);
  }
}

async function deploy(){
  const owner = $("#gh-owner").value.trim();
  const repo  = $("#gh-repo").value.trim();
  const branch= $("#gh-branch").value.trim() || "main";
  const token = $("#gh-token").value.trim();
  const msg   = $("#gh-message").value.trim() || "Deploy via tools/deploy";

  if (!owner || !repo || !token) throw new Error("Owner, repo, token requis.");

  // 1) Supprimer si mode replace
  for (const path of state.removeList){
    const sha = await getShaIfExists(owner, repo, token, path);
    if (!sha) continue;
    log(`DEL ${path}`);
    await ghDelete(owner, repo, token, branch, path, `[deploy] remove ${path}`, sha);
  }

  // 2) Upsert fichiers
  for (const f of state.files){
    const sha = await getShaIfExists(owner, repo, token, f.path);
    let base64;
    if (f.type === 'binary'){
      // déjà base64 depuis bundle/zip
      base64 = f.content;
    } else {
      base64 = toBase64(f.content);
    }
    log(`${sha ? 'PUT' : 'NEW'} ${f.path}`);
    await ghPut(owner, repo, token, branch, f.path, base64, msg, sha);
  }

  log('✅ Déploiement terminé.');
  setStatus('Done.', 'ok');
}

// UI events
$("#btn-validate").addEventListener('click', async ()=>{
  try {
    setStatus('Validation…');
    logEl.textContent = '';
    await validateInput();
    setStatus('Entrée valide — tu peux Dry run ou Déployer', 'ok');
    $("#btn-deploy").disabled = false;
  } catch(e){
    setStatus('Erreur: '+(e.message||e), 'warn'); log(e);
  }
});

$("#btn-dryrun").addEventListener('click', async ()=>{
  try {
    setStatus('Dry run…'); log('--- Dry run ---');
    await validateInput();
    await dryRun();
    setStatus('Dry run terminé (voir log).', 'ok');
    $("#btn-deploy").disabled = false;
  } catch(e){
    setStatus('Erreur: '+(e.message||e), 'warn'); log(e);
  }
});

$("#btn-deploy").addEventListener('click', async ()=>{
  try {
    setStatus('Déploiement en cours…');
    await deploy();
  } catch(e){
    setStatus('Erreur: '+(e.message||e), 'warn'); log(e);
  }
});
