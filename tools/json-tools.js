// json-tools.js — Outil JSON séparé (Arborescence / Complet)
// Requiert que app.js soit chargé avant et expose window.TV


export const BUILD_TAG = {
  file: "json-tools.js",
  note: "v5",
};

const TV = window.TV;
if (!TV) {
  console.error('[JSON-TOOLS] TV API not found (app.js not loaded yet).');
}

// Alias rapides
const $ = (s) => document.querySelector(s);

// Logs sûrs
function safeLog(tag, msg, data) {
  try { TV?.log?.(tag, msg, data); } catch {}
}

// Boutons busy
const busyOn  = () => ['#btn-gen-json','#btn-copy-json','#btn-dl-json'].forEach(s=>$(s)&&($(s).disabled=true));
const busyOff = () => ['#btn-gen-json','#btn-copy-json','#btn-dl-json'].forEach(s=>$(s)&&($(s).disabled=false));

/* ========= Helpers locaux (autonomes) ========= */
const BIN_EXTS = [".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".otf",".zip",".gz",".mp4",".mov",".webm",".mp3",".wav",".7z",".wasm"];
function isBinaryPath(p){ const L=p.toLowerCase(); return BIN_EXTS.some(ext => L.endsWith(ext)); }

function b64ToUint8(b64){
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return bytes;
}
function decodeBase64ToText(b64){
  const bytes = b64ToUint8(b64);
  try { return new TextDecoder("utf-8", {fatal:false}).decode(bytes); }
  catch {
    let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(bin)); } catch { return bin; }
  }
}

/* ========= Fetch de contenu (local, via TV.ghBase/TV.ghHeaders) ========= */
async function fetchFileWithContent({owner, repo, branch, token, path}){
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: TV.ghHeaders(token) });
  if (res.status === 404) throw new Error(`Missing: ${path}`);
  if (!res.ok) throw new Error(`GET contents ${path} → ${res.status}`);

  const j = await res.json(); // { content (base64), size, encoding, ... }
  const size = j.size ?? (j.content ? b64ToUint8(j.content.replace(/\n/g,"")).length : 0);
  const binary = isBinaryPath(path);

  if (binary) {
    // garder base64
    const content = (j.content || "").replace(/\n/g,"");
    return { path, type:"binary", size, content, contentEncoding: 'base64' };
  } else {
    const b64 = (j.content || "").replace(/\n/g,"");
    const text = decodeBase64ToText(b64);
    return { path, type:"text", size: text.length, content: text };
  }
}

/* ========= Génération JSON selon le mode ========= */
async function generateSelectionJSON(){
  safeLog('INFO', '[enter] generateSelectionJSON()');

  try{
    const rawMode = document.querySelector('input[name="json-mode"]:checked');
    const mode = (rawMode?.value) || 'full';
    safeLog('INFO', `Mode JSON sélectionné : ${mode}`, { hasRadio: !!rawMode });

    const owner = $('#owner').value.trim();
    const repo  = $('#repo').value.trim();
    const branch= $('#branch').value.trim() || 'main';
    const token = $('#token').value.trim() || null;

    if (!TV?.state?.root) {
      safeLog('ERROR', 'JSON: root absent (arbre non chargé)');
      return;
    }

    // Reconstituer la sélection depuis l’arbre (fiable iPad)
    const filesSel = TV.collectSelectedFilesFromTree(TV.state.root).sort();

    busyOn();
    $('#status').textContent = 'Génération en cours…';

    if (filesSel.length === 0) {
      if (mode === 'tree') {
        $('#json-out').value = '[]';
      } else {
        $('#json-out').value = JSON.stringify({
          repo: `${owner}/${repo}`,
          branch, generatedAt: new Date().toISOString(),
          totalFiles: 0, files: []
        }, null, 2);
      }
      safeLog('INFO', 'JSON: aucune sélection', { count: 0, mode });
      return;
    }

    if (mode === 'tree') {
      // Liste simple (chemins uniquement)
      const txt = JSON.stringify(filesSel, null, 2);
      $('#json-out').value = txt;
      safeLog('INFO','JSON (arborescence) généré', { count: filesSel.length });
      return;
    }

    // Mode "Complet" : télécharger le contenu de chaque fichier
    const outFiles = [];
    let done = 0;
    for (const p of filesSel){
      try{
        const f = await fetchFileWithContent({ owner, repo, branch, token, path: p });
        outFiles.push(f);
        done++;
        if (done % 10 === 0) safeLog('INFO','Progress', { done, total: filesSel.length });
      }catch(e){
        safeLog('ERROR', `Échec contenu: ${p}`, { error: String(e) });
      }
    }

    const bundle = {
      repo: `${owner}/${repo}`,
      branch,
      generatedAt: new Date().toISOString(),
      totalFiles: outFiles.length,
      files: outFiles
    };
    $('#json-out').value = JSON.stringify(bundle, null, 2);
    safeLog('INFO','JSON (complet) généré', { total: outFiles.length });

  }catch(e){
    safeLog('ERROR','Génération JSON échouée', { error: String(e) });
  } finally {
    $('#status').textContent = 'Prêt.';
    busyOff();
  }
}

/* ========= Copie / téléchargement ========= */
async function copyJSON(){
  try{
    const txt = $('#json-out')?.value || '';
    await navigator.clipboard.writeText(txt);
    safeLog('INFO', 'JSON copié');
  }catch(e){
    safeLog('ERROR', 'Copie JSON échouée', { error: String(e) });
  }
}
function downloadJSON(){
  try{
    const text = $('#json-out')?.value || '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    a.download = 'selection.json';
    a.click();
    safeLog('INFO', 'JSON téléchargé');
  }catch(e){
    safeLog('ERROR', 'Téléchargement JSON échoué', { error: String(e) });
  }
}

/* ========= Brancher les boutons (JSON tool only) ========= */
$('#btn-gen-json')?.addEventListener('click', generateSelectionJSON);
$('#btn-copy-json')?.addEventListener('click', copyJSON);
$('#btn-dl-json')?.addEventListener('click', downloadJSON);

/* ========= Sentinelles (debug utile) ========= */
window.addEventListener('unhandledrejection', e=>{
  safeLog('ERROR', 'unhandledrejection', { reason: String(e?.reason) });
});
window.addEventListener('error', e=>{
  safeLog('ERROR', 'window.onerror', { message: e?.message, source: e?.filename, line: e?.lineno, col: e?.colno });
});

window.JSON_BUILD_TAG = BUILD_TAG;    // dans json-tools.js
