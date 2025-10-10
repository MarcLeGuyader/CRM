// tools/patch-tools.js — Outil Patch (Dry-run / Apply) — support étendu des opérations

export const BUILD_TAG = { file: "patch-tools.js", note: "v2 (ops étendues)" };

const TV = window.TV;
const $ = (s) => document.querySelector(s);
const safeLog = (tag, msg, data) => { try { TV?.log?.(tag, msg, data); } catch {} };

// --- GitHub helpers ---
async function ghGetFile({ owner, repo, branch, token, path }) {
  const url = `${TV.ghBase(owner, repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: TV.ghHeaders(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json(); // { content (b64), sha, path, ... }
}
async function ghPutFile({ owner, repo, branch, token, path, sha, content, message, committer }) {
  const url = `${TV.ghBase(owner, repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `Patch: update ${path}`,
    branch,
    sha,
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (committer) body.committer = committer;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...TV.ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>"");
    throw new Error(`PUT ${path} → ${res.status} ${txt || ""}`);
  }
  return res.json();
}

// --- UI helpers ---
const busy = (on) => {
  ["#btn-patch-dryrun", "#btn-patch-apply"].forEach(id => { const el = $(id); if (el) el.disabled = !!on; });
};
const readCtx = () => ({
  owner:  $('#owner').value.trim(),
  repo:   $('#repo').value.trim(),
  branch: $('#branch').value.trim() || 'main',
  token:  $('#token').value.trim() || null,
});
const getPatchJSON = () => {
  const raw = $('#patch-in')?.value || "";
  let j;
  try { j = JSON.parse(raw); } catch(e){ throw new Error(`JSON invalide: ${e.message}`); }
  if (!j || !Array.isArray(j.changes) || j.changes.length===0) {
    throw new Error('Patch JSON: "changes" vide ou absent');
  }
  return j;
};
const setOut = (txt) => { const ta = $('#patch-out'); if (ta) ta.value = txt; };

// --- text ops ---
function replaceOnce(text, find, repl) {
  const idx = text.indexOf(find);
  if (idx < 0) return { changed:false, out:text, count:0 };
  const out = text.slice(0,idx) + repl + text.slice(idx+find.length);
  return { changed:true, out, count:1 };
}
function replaceAll(text, find, repl) {
  if (!find) return { changed:false, out:text, count:0 };
  let count = 0;
  let out = text;
  let idx;
  while ((idx = out.indexOf(find)) !== -1) {
    out = out.slice(0, idx) + repl + out.slice(idx + find.length);
    count++;
  }
  return { changed: count>0, out, count };
}
function replaceRegex(text, pattern, flags, repl) {
  const rx = new RegExp(pattern, flags || "");
  if (!rx.test(text)) return { changed:false, out:text, count:0 };
  const out = text.replace(rx, repl);
  let count = 0;
  if (flags?.includes('g')) {
    const m = text.match(new RegExp(pattern, flags));
    count = m ? m.length : 0;
  } else count = 1;
  return { changed:true, out, count };
}
function byLines(text) { return text.replace(/\r\n/g, "\n").split("\n"); }
function joinLines(lines) { return lines.join("\n"); }

function insertAfterAnchor(text, anchor, linesToInsert) {
  const lines = byLines(text);
  const idx = lines.findIndex(l => l.includes(anchor));
  if (idx < 0) return { changed:false, out:text, info:`anchor "${anchor}" introuvable` };
  const insert = Array.isArray(linesToInsert) ? linesToInsert : [String(linesToInsert ?? "")];
  lines.splice(idx+1, 0, ...insert);
  return { changed:true, out: joinLines(lines) };
}
function insertBeforeAnchor(text, anchor, linesToInsert) {
  const lines = byLines(text);
  const idx = lines.findIndex(l => l.includes(anchor));
  if (idx < 0) return { changed:false, out:text, info:`anchor "${anchor}" introuvable` };
  const insert = Array.isArray(linesToInsert) ? linesToInsert : [String(linesToInsert ?? "")];
  lines.splice(idx, 0, ...insert);
  return { changed:true, out: joinLines(lines) };
}
function insertAfterLine(text, regex, flags, linesToInsert) {
  const rx = new RegExp(regex, flags || "");
  const lines = byLines(text);
  const idx = lines.findIndex(l => rx.test(l));
  if (idx < 0) return { changed:false, out:text, info:`line regex "${regex}" introuvable` };
  const insert = Array.isArray(linesToInsert) ? linesToInsert : [String(linesToInsert ?? "")];
  lines.splice(idx+1, 0, ...insert);
  return { changed:true, out: joinLines(lines) };
}
function insertBeforeLine(text, regex, flags, linesToInsert) {
  const rx = new RegExp(regex, flags || "");
  const lines = byLines(text);
  const idx = lines.findIndex(l => rx.test(l));
  if (idx < 0) return { changed:false, out:text, info:`line regex "${regex}" introuvable` };
  const insert = Array.isArray(linesToInsert) ? linesToInsert : [String(linesToInsert ?? "")];
  lines.splice(idx, 0, ...insert);
  return { changed:true, out: joinLines(lines) };
}
function deleteLine(text, find, regex, flags) {
  const lines = byLines(text);
  let changed = false;
  let out;
  if (regex) {
    const rx = new RegExp(regex, flags || "");
    out = lines.filter(l => {
      const hit = rx.test(l);
      if (hit) changed = true;
      return !hit;
    });
  } else {
    out = lines.filter(l => {
      const hit = l.includes(find);
      if (hit) changed = true;
      return !hit;
    });
  }
  return { changed, out: joinLines(out) };
}

// --- apply ops on a single text ---
function applyOpsToText(text, ops, reportArr) {
  let cur = text;
  let anyChange = false;

  for (const op of ops) {
    let res = { changed:false, out:cur }; let note = "";
    switch (op.type) {
      case "replace":
        res = replaceOnce(cur, op.find ?? "", op.replace ?? "");
        reportArr.push(`  + replace: ${res.changed ? "1 occur. remplacée" : "0"}`);
        break;
      case "replace_all":
        res = replaceAll(cur, op.find ?? "", op.replace ?? "");
        reportArr.push(`  + replace_all: ${res.count} occur. remplacée(s)`);
        break;
      case "replace_regex":
        res = replaceRegex(cur, op.pattern ?? "", op.flags ?? "", op.replace ?? "");
        reportArr.push(`  + replace_regex: ${res.changed ? `${res.count||"?"} occur.` : "0"}`);
        break;
      case "insert_after_anchor":
        res = insertAfterAnchor(cur, op.anchor ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"anchor manquante"})`;
        reportArr.push(`  + insert_after_anchor: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "insert_before_anchor":
        res = insertBeforeAnchor(cur, op.anchor ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"anchor manquante"})`;
        reportArr.push(`  + insert_before_anchor: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "insert_after_line":
        res = insertAfterLine(cur, op.line_match?.regex ?? "", op.line_match?.flags ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"regex sans match"})`;
        reportArr.push(`  + insert_after_line: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "insert_before_line":
        res = insertBeforeLine(cur, op.line_match?.regex ?? "", op.line_match?.flags ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"regex sans match"})`;
        reportArr.push(`  + insert_before_line: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "delete_line":
        res = deleteLine(cur, op.find ?? "", op.line_match?.regex, op.line_match?.flags);
        reportArr.push(`  + delete_line: ${res.changed ? "supprimé(s)" : "0"}`);
        break;
      default:
        reportArr.push(`  - OP inconnue: ${op.type}`);
        res = { changed:false, out:cur };
    }
    if (res.changed) { cur = res.out; anyChange = true; }
  }

  return { text: cur, changed: anyChange };
}

// --- main: dry-run/apply ---
async function patchDryRun() {
  safeLog("INFO", "[enter] patchDryRun()");
  busy(true);
  $('#status').textContent = 'Patch — Dry-run…';

  try {
    const ctx = readCtx();
    safeLog("VERBOSE", "[patchDryRun] context", ctx);

    const spec = getPatchJSON();
    safeLog("VERBOSE", `[patchDryRun] ${spec.changes.length} fichier(s) à traiter`);

    let out = `DRY-RUN — Patching ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    let i = 0;
    for (const change of spec.changes) {
      i++;
      safeLog("VERBOSE", `[patchDryRun] Fichier ${i}/${spec.changes.length}: ${change.path}`);
      out += `# ${change.path}\n`;
      try {
        const meta = await ghGetFile({ ...ctx, path: change.path });
        safeLog("VERBOSE", `[patchDryRun] Fichier récupéré`, { path: change.path, size: meta.content?.length });

        const text = decodeURIComponent(escape(atob((meta.content || "").replace(/\n/g,""))));
        const report = [];
        const { text: patched, changed } = applyOpsToText(text, change.ops || [], report);
        safeLog("VERBOSE", `[patchDryRun] ${change.ops?.length || 0} opérations exécutées`, { changed });

        report.forEach(line => out += `    ${line}\n`);
        out += `  => ${changed ? "CHANGÉ ✅" : "inchangé"}\n\n`;
      } catch (e) {
        safeLog("ERROR", `[patchDryRun] Erreur sur ${change.path}`, { error: String(e) });
        out += `  !! Erreur: ${String(e)}\n\n`;
      }
    }

    setOut(out);
    safeLog("INFO", "[patchDryRun] terminé");
  } catch (e) {
    setOut(`Erreur dry-run:\n${String(e)}\n`);
    safeLog("ERROR", "[patchDryRun] échec", { error: String(e) });
  } finally {
    busy(false);
    $('#status').textContent = 'Prêt.';
  }
}

async function patchApply() {
  safeLog("INFO", "[enter] patchApply()");
  busy(true);
  $('#status').textContent = 'Patch — Apply…';

  try {
    const ctx = readCtx();
    const spec = getPatchJSON();
    if (!ctx.token) throw new Error("Un PAT GitHub est requis pour Apply.");

    const committer = { name: 'Patch Tool', email: 'noreply@example.com' };
    let out = `APPLY — Patching ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    for (const change of spec.changes) {
      out += `# ${change.path}\n`;
      try {
        const meta = await ghGetFile({ ...ctx, path: change.path });
        const original = decodeURIComponent(escape(atob((meta.content || "").replace(/\n/g,""))));
        const report = [];
        const { text: patched, changed } = applyOpsToText(original, change.ops || [], report);
        report.forEach(line => out += `    ${line}\n`);
        if (!changed) { out += `  => inchangé (skip)\n\n`; continue; }

        await ghPutFile({
          ...ctx,
          path: change.path,
          sha: meta.sha,
          content: patched,
          message: change.message || `Patch: update ${change.path}`,
          committer,
        });
        out += `  => ÉCRIT ✅\n\n`;
        safeLog("APPLY", "Patched", { path: change.path });
      } catch (e) {
        out += `  !! Erreur: ${String(e)}\n\n`;
        safeLog("ERROR", "Patch apply error", { path: change.path, error: String(e) });
      }
    }

    setOut(out);
    safeLog("SUMMARY", "Patch apply terminé");
  } catch (e) {
    setOut(`Erreur apply:\n${String(e)}\n`);
    safeLog("ERROR", "Patch apply échec", { error: String(e) });
  } finally {
    busy(false);
    document.getElementById('status').textContent = 'Prêt.';
  }
}

// --- wire buttons ---
document.getElementById('btn-patch-dryrun')?.addEventListener('click', patchDryRun);
document.getElementById('btn-patch-apply')?.addEventListener('click', patchApply);

// --- sentinelles ---
window.addEventListener('unhandledrejection', e => {
  safeLog('ERROR','unhandledrejection (patch)', { reason:String(e?.reason) });
});
window.addEventListener('error', e => {
  safeLog('ERROR','window.onerror (patch)', {
    message:e?.message, source:e?.filename, line:e?.lineno, col:e?.colno
  });
});

// --- expose tag global pour résumé de build ---
window.PATCH_BUILD_TAG = BUILD_TAG;
