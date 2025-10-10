// deploy-tools.js — Déploiement des fichiers sélectionnés (Dry-run / Apply)
// Requiert app.js (window.TV)

export const BUILD_TAG = {
  file: "deploy-tools.js",
  note: "v2",
};

// Expose la tag côté window pour le log récapitulatif de l’index
window.DEPLOY_BUILD_TAG = BUILD_TAG;

const TV = window.TV;
if (!TV) console.error("[DEPLOY-TOOLS] TV API not found.");

const $ = s => document.querySelector(s);
const safeLog = (tag, msg, data) => { try { TV?.log?.(tag, msg, data); } catch {} };

// -------- Helpers GitHub (ciblent le repo/branche saisis dans la bannière)
function readContext(){
  return {
    owner:  $('#owner').value.trim(),
    repo:   $('#repo').value.trim(),
    branch: $('#branch').value.trim() || 'main',
    token:  $('#token').value.trim() || null,
  };
}

// Récupère la sélection (chemins de fichiers)
function getSelectedFiles(){
  if (!TV?.state?.root) return [];
  return TV.collectSelectedFilesFromTree(TV.state.root).sort();
}

// GET contents pour savoir si le fichier existe dans la cible et/ou récupérer le sha
async function getContentMeta({owner, repo, branch, token, path}){
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: TV.ghHeaders(token) });
  if (res.status === 404) return null; // n'existe pas
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json(); // { sha, content (base64), ... }
}

// Récupère le contenu (toujours en base64) à partir du repo source (ici le même form saisi)
async function fetchContentBase64({owner, repo, branch, token, path}){
  const meta = await getContentMeta({ owner, repo, branch, token, path });
  if (!meta) throw new Error(`Source introuvable: ${path}`);
  // L’API renvoie déjà content base64 avec des sauts de ligne ; nettoyons-les
  const base64 = (meta.content || "").replace(/\n/g, "");
  return { base64, size: meta.size ?? 0 };
}

// PUT contents (création ou mise à jour)
async function putContent({owner, repo, branch, token, path, base64, message, sha, committer}){
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: base64, branch };
  if (sha) body.sha = sha;
  if (committer) body.committer = committer;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...TV.ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`PUT ${path} → ${res.status} ${txt || ''}`);
  }
  return res.json(); // commit payload
}

// Busy / output
function setBusy(b){
  ['#btn-deploy-zip', '#btn-deploy-single'].forEach(s=>{ const el=$(s); if (el) el.disabled = !!b; });
}
function printDeploy(text){
  const ta = $('#deploy-out'); if (ta) ta.value = text;
}

// ---------- Dry-run (simule le déploiement de la sélection)
async function deployDryRun(){
  safeLog('INFO', '[enter] deployDryRun()');
  setBusy(true);
  $('#status').textContent = 'Analyse (deploy dry-run)…';

  try{
    const ctx = readContext();
    const files = getSelectedFiles();
    if (!files.length){
      printDeploy('Dry-run: aucune sélection.\n');
      safeLog('WARN','Deploy dry-run: selection vide');
      return;
    }
    if (!ctx.token) {
      safeLog('WARN','Deploy dry-run sans token: OK (simulation), mais l’exécution nécessitera un PAT.');
    }

    // On vérifie pour chaque fichier s’il existe déjà (création vs update)
    let lines = [];
    for (const path of files){
      let exists = false;
      try{
        const meta = await getContentMeta({ ...ctx, path });
        exists = !!meta?.sha;
      }catch(e){
        // Si erreur autre que 404, on note l'erreur
        lines.push(` - ${path}  (ERREUR meta: ${String(e)})`);
        continue;
      }
      lines.push(` - ${path}  ${exists ? '(update)' : '(create)'}`);
    }

    let report = `DEPLOY — DRY-RUN — ${files.length} fichier(s) sur ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;
    report += lines.join('\n') + '\n';
    report += `\nAucun PUT n’a été envoyé.\n`;
    printDeploy(report);
    safeLog('DRYRUN','Deploy dry-run prêt', { count: files.length });
  }catch(e){
    safeLog('ERROR','Deploy dry-run échec', { error: String(e) });
    printDeploy(`Erreur deploy dry-run:\n${String(e)}\n`);
  }finally{
    setBusy(false);
    $('#status').textContent = 'Prêt.';
  }
}

// ---------- Apply (déploie réellement la sélection)
async function deployApply(){
  safeLog('INFO', '[enter] deployApply()');
  setBusy(true);
  $('#status').textContent = 'Déploiement en cours…';

  try{
    const ctx = readContext();
    const files = getSelectedFiles();
    if (!files.length){
      printDeploy('Exécution: aucune sélection.\n');
      safeLog('WARN','Deploy apply: selection vide');
      return;
    }
    if (!ctx.token){
      const msg = 'Un GitHub Token (PAT) est requis pour déployer.';
      safeLog('ERROR', msg);
      printDeploy(`Erreur:\n${msg}\n`);
      return;
    }

    const committer = { name: 'TreeView Deploy', email: 'noreply@example.com' };
    let ok = 0, ko = 0;
    let logTxt = `DEPLOY — APPLY — ${files.length} fichier(s) vers ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    for (const path of files){
      try{
        // base64 depuis le repo source (ici, identique aux inputs)
        const { base64 } = await fetchContentBase64({ ...ctx, path });

        // s'il existe déjà dans la cible, on fournit sha pour update
        let sha = null;
        try{
          const meta = await getContentMeta({ ...ctx, path });
          sha = meta?.sha || null;
        }catch(_) { /* 404 → création */ }

        await putContent({
          ...ctx, path, base64,
          message: `Deploy: ${path}`,
          sha, committer
        });

        ok++; logTxt += `✔️ deploy: ${path}\n`;
        safeLog('APPLY','Deployed', { path, updated: !!sha });
      }catch(err){
        ko++; logTxt += `❌ fail:   ${path} — ${String(err)}\n`;
        safeLog('ERROR','Deploy failed', { path, error: String(err) });
      }
    }

    logTxt += `\nRésumé: ${ok} ok, ${ko} échec(s)\n`;
    printDeploy(logTxt);
    safeLog('SUMMARY','Deploy terminé', { ok, ko, total: files.length });
  }catch(e){
    safeLog('ERROR','Deploy apply échec', { error: String(e) });
    printDeploy(`Erreur deploy apply:\n${String(e)}\n`);
} finally {
  setBusy(false);
  $('#status').textContent = 'Prêt.';
}
}

// ---------- Brancher les boutons (Deploy)
document.getElementById('btn-deploy-zip')?.addEventListener('click', deployDryRun);
document.getElementById('btn-deploy-single')?.addEventListener('click', deployApply);

// -- Build tag (exposé pour l’index)
export const BUILD_TAG = { file: 'deploy-tools.js', note: 'v1' };
window.DEPLOY_BUILD_TAG = BUILD_TAG;

// -- Sentinelles
window.addEventListener('unhandledrejection', e => {
  safeLog('ERROR', 'unhandledrejection (deploy)', { reason: String(e?.reason) });
});
window.addEventListener('error', e => {
  safeLog('ERROR', 'window.onerror (deploy)', {
    message: e?.message, source: e?.filename, line: e?.lineno, col: e?.colno
  });
});
