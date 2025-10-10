// clean-tools.js — Supprime les fichiers sélectionnés (Dry-run / Exécution)
// Requiert app.js (window.TV)

export const BUILD_TAG = {
  file: "clean-tools.js",
  note: "v1",
};

const TV = window.TV;
if (!TV) console.error("[CLEAN-TOOLS] TV API not found.");

// Alias
const $ = s => document.querySelector(s);

// Log sûr vers la console UI
function safeLog(tag, msg, data){ try { TV?.log?.(tag, msg, data); } catch {} }

// Helpers GitHub
async function getContentMeta({owner, repo, branch, token, path}){
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: TV.ghHeaders(token) });
  if (res.status === 404) throw new Error(`Missing: ${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json(); // { sha, path, size, ... }
}

async function deleteContent({owner, repo, branch, token, path, sha, message, committer}){
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `Clean: remove ${path}`,
    sha,
    branch,
  };
  if (committer) body.committer = committer;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...TV.ghHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`DELETE ${path} → ${res.status} ${txt || ''}`);
  }
  return res.json(); // commit payload
}

// Récupération des inputs
function readContext(){
  return {
    owner:  $('#owner').value.trim(),
    repo:   $('#repo').value.trim(),
    branch: $('#branch').value.trim() || 'main',
    token:  $('#token').value.trim() || null,
  };
}

// Récupère la sélection actuelle (fichiers uniquement)
function getSelectedFiles(){
  if (!TV?.state?.root) return [];
  return TV.collectSelectedFilesFromTree(TV.state.root).sort();
}

// Boutons busy
function setBusy(b){
  ['#btn-clean-analyze', '#btn-clean-apply'].forEach(s=>{
    const el = $(s); if (el) el.disabled = !!b;
  });
}

// Affiche dans le textarea “Clean”
function printClean(text){
  const ta = $('#clean-out');
  if (ta) ta.value = text;
}

// DRY-RUN
async function cleanDryRun(){
  safeLog('INFO', '[enter] cleanDryRun()');
  setBusy(true);
  $('#status').textContent = 'Analyse (dry-run)…';

  try{
    const ctx = readContext();
    const files = getSelectedFiles();

    if (!files.length){
      printClean('Dry-run: aucune sélection.\n');
      safeLog('WARN', 'Dry-run: selection vide');
      return;
    }
    if (!ctx.token){
      safeLog('WARN', 'Dry-run sans token: OK (simulation), mais l’exécution nécessitera un PAT.');
    }

    let report = `DRY-RUN — ${files.length} fichier(s) seront supprimés sur ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;
    report += files.map(p => ` - ${p}`).join('\n') + '\n';
    report += '\nAucune requête DELETE n’a été envoyée.\n';
    printClean(report);

    safeLog('DRYRUN', 'Clean dry-run prêt', { count: files.length });
  }catch(e){
    safeLog('ERROR', 'Dry-run échec', { error: String(e) });
    printClean(`Erreur dry-run:\n${String(e)}\n`);
  }finally{
    setBusy(false);
    $('#status').textContent = 'Prêt.';
  }
}

// APPLY (exécution)
async function cleanApply(){
  safeLog('INFO', '[enter] cleanApply()');
  setBusy(true);
  $('#status').textContent = 'Suppression en cours…';

  try{
    const ctx = readContext();
    const files = getSelectedFiles();

    if (!files.length){
      printClean('Exécution: aucune sélection.\n');
      safeLog('WARN', 'Apply: selection vide');
      return;
    }
    if (!ctx.token){
      const msg = 'Un GitHub Token (PAT) est requis pour supprimer.';
      safeLog('ERROR', msg);
      printClean(`Erreur:\n${msg}\n`);
      return;
    }

    // Optionnel: committer (affiché dans l’historique)
    const committer = { name: 'TreeView Clean', email: 'noreply@example.com' };

    let ok = 0, ko = 0;
    let logTxt = `APPLY — suppression de ${files.length} fichier(s) sur ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    // Traite séquentiellement (simple et sûr). On pourrait paralléliser par petits lots si besoin.
    for (const path of files){
      try{
        // 1) récupère le SHA actuel (obligatoire pour DELETE contents)
        const meta = await getContentMeta({ ...ctx, path });
        const sha  = meta.sha;
        // 2) DELETE
        await deleteContent({
          ...ctx,
          path, sha,
          message: `Clean: remove ${path}`,
          committer
        });
        ok++;
        logTxt += `✔️ supprimé: ${path}\n`;
        safeLog('APPLY', 'Deleted', { path });
      }catch(err){
        ko++;
        logTxt += `❌ échec:   ${path} — ${String(err)}\n`;
        safeLog('ERROR', 'Delete failed', { path, error: String(err) });
      }
    }

    logTxt += `\nRésumé: ${ok} supprimé(s), ${ko} échec(s)\n`;
    printClean(logTxt);
    safeLog('SUMMARY', 'Clean terminé', { ok, ko, total: files.length });

  }catch(e){
    safeLog('ERROR', 'Apply échec', { error: String(e) });
    printClean(`Erreur exécution:\n${String(e)}\n`);
  }finally{
    setBusy(false);
    $('#status').textContent = 'Prêt.';
  }
}

// Brancher les boutons
$('#btn-clean-analyze')?.addEventListener('click', cleanDryRun);
$('#btn-clean-apply')  ?.addEventListener('click', cleanApply);

// Sentinelles
window.addEventListener('unhandledrejection', e=>{
  safeLog('ERROR', 'unhandledrejection (clean)', { reason: String(e?.reason) });
});
window.addEventListener('error', e=>{
  safeLog('ERROR', 'window.onerror (clean)', { message: e?.message, source: e?.filename, line: e?.lineno, col: e?.colno });
});
