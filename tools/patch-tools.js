// patch-tools.js — Outil de “patching” (Dry-run / Apply)
// Requiert app.js (fenêtre expose window.TV) + champs #owner/#repo/#branch/#token dans l’UI
// UI attendue dans l’onglet Patch :
//  - <textarea id="patch-in"></textarea>   // où coller le JSON des patchs
//  - <textarea id="patch-out" readonly></textarea> // résultats (dry-run / apply)
//  - <button id="btn-patch-dryrun"></button>
//  - <button id="btn-patch-apply"></button>

export const BUILD_TAG = {
  file: "patch-tools.js",
  note: "v1",
};

// Expose au window pour le “Build tags” récap depuis index.html
window.PATCH_BUILD_TAG = BUILD_TAG;

const TV = window.TV;
if (!TV) console.error("[PATCH-TOOLS] TV API not found (app.js manquant ?).");

// Aliases
const $ = (s) => document.querySelector(s);
const safeLog = (tag, msg, data) => { try { TV?.log?.(tag, msg, data); } catch {} };

// ---------------- Helpers génériques ----------------
function readContext() {
  return {
    owner:  $('#owner')?.value.trim(),
    repo:   $('#repo')?.value.trim(),
    branch: $('#branch')?.value.trim() || 'main',
    token:  $('#token')?.value.trim() || null,
  };
}
function setBusy(b) {
  ['#btn-patch-dryrun','#btn-patch-apply'].forEach(s => { const el = $(s); if (el) el.disabled = !!b; });
}
function out(text) {
  const ta = $('#patch-out'); if (ta) ta.value = text;
}
function getPatchJSON() {
  const raw = $('#patch-in')?.value || '';
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("Patch JSON invalide: " + e.message);
  }
}
function ensureString(x){ return (typeof x === 'string') ? x : String(x ?? ''); }

// GitHub “contents” helpers
async function ghGetText({ owner, repo, branch, token, path }) {
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: TV.ghHeaders(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const j = await res.json(); // { content(base64), sha, ... }
  const b64 = (j.content || '').replace(/\n/g,'');
  const text = atob(b64);
  return { text, sha: j.sha, size: j.size ?? text.length };
}
async function ghPutText({ owner, repo, branch, token, path, text, sha, message, committer }) {
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`;
  // encode
  const b64 = btoa(text);
  const body = {
    message: message || `Patch: update ${path}`,
    content: b64,
    branch,
    sha,
  };
  if (committer) body.committer = committer;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...TV.ghHeaders(token), 'Content-Type':'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`PUT ${path} → ${res.status} ${t || ''}`);
  }
  return res.json();
}

// ----------------- Moteur de patchs (texte) -----------------
// On travaille en mode “ligne” (split '\n') pour la majorité des ops.
function applyOpsToText(origText, ops, report) {
  let text = origText;
  let lines = text.split('\n');

  const addRpt = (line) => report.push(line);

  for (const op of ops) {
    const type = op.type;
    try {
      switch (type) {
        case 'replace_once': {
          const find = ensureString(op.find);
          const repl = ensureString(op.replace);
          const idx = text.indexOf(find);
          if (idx === -1) { addRpt(`  - replace_once: NON TROUVÉ (${find.slice(0,80)}…)`); break; }
          text = text.replace(find, repl);
          lines = text.split('\n');
          addRpt(`  + replace_once: OK (longueur ${find.length}→${repl.length})`);
          break;
        }
        case 'replace_all': {
          const find = ensureString(op.find);
          const repl = ensureString(op.replace);
          const count = (text.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          if (!count) { addRpt(`  - replace_all: 0 occur.`); break; }
          text = text.split(find).join(repl);
          lines = text.split('\n');
          addRpt(`  + replace_all: ${count} occur. remplacée(s)`);
          break;
        }
        case 'insert_after': {
          const anchor = ensureString(op.anchor);
          const pos = lines.findIndex(line => line.includes(anchor));
          if (pos === -1) { addRpt(`  - insert_after: ancre NON TROUVÉE`); break; }
          const ins = ensureString(op.text);
          lines.splice(pos + 1, 0, ...ins.split('\n'));
          text = lines.join('\n');
          addRpt(`  + insert_after: après la 1ère ancre (#${pos+1})`);
          break;
        }
        case 'insert_before': {
          const anchor = ensureString(op.anchor);
          const pos = lines.findIndex(line => line.includes(anchor));
          if (pos === -1) { addRpt(`  - insert_before: ancre NON TROUVÉE`); break; }
          const ins = ensureString(op.text);
          lines.splice(pos, 0, ...ins.split('\n'));
          text = lines.join('\n');
          addRpt(`  + insert_before: avant la 1ère ancre (#${pos+1})`);
          break;
        }
        case 'delete_lines': {
          const from = Math.max(1, parseInt(op.from,10));
          const to   = Math.max(from, parseInt(op.to,10));
          const startIdx = from - 1;
          const count = Math.min(lines.length - startIdx, to - from + 1);
          if (count <= 0) { addRpt(`  - delete_lines: plage vide`); break; }
          lines.splice(startIdx, count);
          text = lines.join('\n');
          addRpt(`  + delete_lines: #${from}→#${to} (${count} lignes)`);
          break;
        }
        case 'replace_range': {
          const from = Math.max(1, parseInt(op.from,10));
          const to   = Math.max(from, parseInt(op.to,10));
          const startIdx = from - 1;
          const count = Math.min(lines.length - startIdx, to - from + 1);
          const replacement = ensureString(op.text).split('\n');
          if (count <= 0) { addRpt(`  - replace_range: plage vide`); break; }
          lines.splice(startIdx, count, ...replacement);
          text = lines.join('\n');
          addRpt(`  + replace_range: #${from}→#${to} (${count}→${replacement.length} lignes)`);
          break;
        }
        case 'append': {
          const ins = ensureString(op.text);
          if (text.length && !text.endsWith('\n')) text += '\n';
          text += ins;
          lines = text.split('\n');
          addRpt(`  + append: ${ins.split('\n').length} ligne(s) ajoutée(s) en fin de fichier`);
          break;
        }
        case 'prepend': {
          const ins = ensureString(op.text);
          text = ins + (ins.endsWith('\n') ? '' : '\n') + text;
          lines = text.split('\n');
          addRpt(`  + prepend: ${ins.split('\n').length} ligne(s) ajoutée(s) en début de fichier`);
          break;
        }
        default:
          addRpt(`  - OP inconnue: ${type}`);
      }
    } catch (e) {
      addRpt(`  ! OP ${type} → ERREUR: ${String(e)}`);
    }
  }

  return text;
}

// --------------- DRY-RUN ---------------
async function patchDryRun() {
  safeLog('INFO', '[enter] patchDryRun()');
  setBusy(true);
  $('#status').textContent = 'Patch dry-run…';

  try {
    const ctxUI = readContext();
    const patch = getPatchJSON();

    const ctx = {
      owner:  patch?.target?.owner  || ctxUI.owner,
      repo:   patch?.target?.repo   || ctxUI.repo,
      branch: patch?.target?.branch || ctxUI.branch,
      token:  ctxUI.token, // on n’a pas besoin du token pour un dry-run local
    };

    if (!Array.isArray(patch?.changes) || !patch.changes.length) {
      throw new Error('Patch JSON: "changes" vide ou absent');
    }

    let logTxt = `DRY-RUN — Patching ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    for (const change of patch.changes) {
      const path = ensureString(change.path);
      const ops  = Array.isArray(change.ops) ? change.ops : [];
      logTxt += `# ${path}\n`;

      try {
        const { text: origText } = await ghGetText({ ...ctx, path });
        const report = [];
        const newText = applyOpsToText(origText, ops, report);

        const changed = (newText !== origText);
        logTxt += report.map(l => `  ${l}`).join('\n') + '\n';
        logTxt += changed ? '  => CHANGÉ ✅\n\n' : '  => SANS CHANGEMENT ⏸️\n\n';

      } catch (e) {
        logTxt += `  !! ERREUR lecture: ${String(e)}\n\n`;
      }
    }

    out(logTxt);
    safeLog('DRYRUN', 'Patch dry-run terminé');

  } catch (e) {
    out(`Erreur dry-run:\n${String(e)}\n`);
    safeLog('ERROR', 'Patch dry-run échec', { error: String(e) });
  } finally {
    setBusy(false);
    $('#status').textContent = 'Prêt.';
  }
}

// --------------- APPLY ---------------
async function patchApply() {
  safeLog('INFO', '[enter] patchApply()');
  setBusy(true);
  $('#status').textContent = 'Patch apply…';

  try {
    const ctxUI = readContext();
    const patch = getPatchJSON();

    const ctx = {
      owner:  patch?.target?.owner  || ctxUI.owner,
      repo:   patch?.target?.repo   || ctxUI.repo,
      branch: patch?.target?.branch || ctxUI.branch,
      token:  ctxUI.token,
    };
    if (!ctx.token) throw new Error('Un GitHub Token (PAT) est requis pour APPLY.');

    const commitMsg   = patch?.commit?.message || 'Apply patch set';
    const committer   = patch?.commit?.committer || { name: 'Patch Tool', email: 'noreply@example.com' };

    if (!Array.isArray(patch?.changes) || !patch.changes.length) {
      throw new Error('Patch JSON: "changes" vide ou absent');
    }

    let ok=0, ko=0;
    let logTxt = `APPLY — Patching ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    for (const change of patch.changes) {
      const path = ensureString(change.path);
      const ops  = Array.isArray(change.ops) ? change.ops : [];
      logTxt += `# ${path}\n`;

      try {
        const { text: origText, sha } = await ghGetText({ ...ctx, path });
        const report = [];
        const newText = applyOpsToText(origText, ops, report);

        const changed = (newText !== origText);
        logTxt += report.map(l => `  ${l}`).join('\n') + '\n';

        if (!changed) {
          logTxt += '  => SANS CHANGEMENT ⏸️\n\n';
          continue;
        }

        await ghPutText({
          ...ctx,
          path,
          text: newText,
          sha,
          message: `${commitMsg} — ${path}`,
          committer,
        });

        ok++;
        logTxt += '  => ÉCRIT ✅\n\n';
        safeLog('APPLY', 'Patch applied', { path });

      } catch (e) {
        ko++;
        logTxt += `  !! ERREUR: ${String(e)}\n\n`;
        safeLog('ERROR', 'Patch apply failed', { path, error: String(e) });
      }
    }

    logTxt += `Résumé: ${ok} fichier(s) modifié(s), ${ko} échec(s)\n`;
    out(logTxt);
    safeLog('SUMMARY', 'Patch apply terminé', { ok, ko });

  } catch (e) {
    out(`Erreur apply:\n${String(e)}\n`);
    safeLog('ERROR', 'Patch apply échec', { error: String(e) });
  } finally {
    setBusy(false);
    $('#status').textContent = 'Prêt.';
  }
}

// Brancher boutons
$('#btn-patch-dryrun')?.addEventListener('click', patchDryRun);
$('#btn-patch-apply')?.addEventListener('click', patchApply);

// Sentinelles
window.addEventListener('unhandledrejection', e=>{
  safeLog('ERROR', 'unhandledrejection (patch)', { reason: String(e?.reason) });
});
window.addEventListener('error', e=>{
  safeLog('ERROR', 'window.onerror (patch)', { message: e?.message, source: e?.filename, line: e?.lineno, col: e?.colno });
});
