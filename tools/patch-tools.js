// tools/patch-tools.js — Outil Patch (Dry-run / Apply) — sécurisé & verbeux

export const BUILD_TAG = { file: "patch-tools.js", note: "v11.4 - fixed syntax + .old backup + file import" };

const TV = window.TV;
const $  = (s) => document.querySelector(s);
const safeLog = (tag, msg, data) => { try { TV?.log?.(tag, msg, data); } catch (e) {} };

// --- iOS / iPad smart punctuation guard ---
function desmartUnicode(s) {
  return String(s ?? "")
    .normalize('NFKC')
    .replace(/\uFEFF/g,'')          // BOM
    .replace(/\u00A0/g,' ')         // NBSP → espace
    .replace(/[\u2018\u2019]/g,"'") // ‘ ’ → '
    .replace(/[\u201C\u201D]/g,'"') // “ ” → "
    .replace(/\u2026/g,'...')       // … → ...
    .replace(/[\u2013\u2014]/g,'-') // – — → -
    .replace(/\r\n?/g,'\n');        // CRLF → LF
}
function hasSmartChars(s){
  return /[\uFEFF\u00A0\u2018\u2019\u201C\u201D\u2026\u2013\u2014]/.test(s||"");
}
function sanitizeInput(s, fieldName){
  const clean = desmartUnicode(s);
  if (hasSmartChars(s) && TV?.log) TV.log('WARN', `[sanitize] ${fieldName||'input'} contained smart chars; normalized`);
  return clean;
}

// ---------- UTF-8 <-> base64 helpers ----------
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToUtf8(b64) {
  const bin = atob((b64 || "").replace(/\n/g,""));
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  try {
    return new TextDecoder("utf-8", { fatal:false }).decode(bytes);
  } catch (e) {
    // fallback
    let s = "";
    for (let i=0;i<len;i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
}

// ---------- GitHub helpers ----------
async function ghGetFile({ owner, repo, branch, token, path }) {
  const url = `${TV.ghBase(owner, repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: TV.ghHeaders(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json(); // { content(b64), sha, size, path, ... }
}
async function ghPutFile({ owner, repo, branch, token, path, sha, content, message, committer }) {
  const url = `${TV.ghBase(owner,repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `Patch: update ${path}`,
    branch,
    sha,
    content: utf8ToBase64(content),
  };
  if (committer) body.committer = committer;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...TV.ghHeaders(token), "Content-Type":"application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch((e)=>"");
    throw new Error(`PUT ${path} → ${res.status} ${txt || ""}`);
  }
  return res.json();
}

// ---------- Backup helpers (.old) ----------
async function getOldShaIfExists(ctx, backupPath){
  try {
    const metaOld = await ghGetFile({ ...ctx, path: backupPath });
    return metaOld?.sha || null;
  } catch (e){
    // ghGetFile lève une erreur non-OK; si 404, on ignore
    if (String(e).includes('→ 404')) return null;
    throw e;
  }
}
async function writeBackupOld(ctx, path, original, committer){
  const backupPath = `${path}.old`;
  const oldSha = await getOldShaIfExists(ctx, backupPath);
  await ghPutFile({
    ...ctx,
    path: backupPath,
    sha: oldSha || undefined,  // si existe → overwrite; sinon → create
    content: original,
    message: `Backup: copy of ${path} -> ${backupPath}`,
    committer,
  });
}

// ---------- Préconditions strictes ----------
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkPreconditions(meta, text, pre, logFn) {
  if (!pre) return { ok: true, why: "no-pre" };
  const log = logFn || ((t, m, d) => console.log(t, m, d));

  // size côté API: meta.size = taille en octets du blob GitHub. Sinon fallback text.length (UTF-16 JS)
  const size   = (typeof meta?.size === "number") ? meta.size : text.length;
  const shaGit = meta?.sha || null;
  const sha256 = await sha256Hex(text);

  const fails = [];
  if (pre.expectSize && pre.expectSize !== size) fails.push(`size ${size}≠${pre.expectSize}`);
  if (pre.expectSha && pre.expectSha !== shaGit) fails.push(`sha ${shaGit}≠${pre.expectSha}`);
  if (pre.expectIncludes && !text.includes(pre.expectIncludes)) fails.push(`missing "${pre.expectIncludes}"`);
  if (pre.expectHash?.algo?.toLowerCase() === "sha256" && pre.expectHash.value !== sha256)
    fails.push(`sha256 ${sha256}≠${pre.expectHash.value}`);

  const strict = pre.strict !== false; // strict par défaut
  const ok = fails.length === 0;

  if (!ok && strict) {
    log("ERROR", "[preconditions] mismatch strict", { path: meta?.path, fails, metaSha: shaGit, size, sha256 });
    return { ok: false, why: "strict-mismatch", detail: fails };
  }
  if (!ok && !strict) {
    log("WARN", "[preconditions] mismatch (relaxed)", { fails, metaSha: shaGit, size, sha256 });
    return { ok: true, why: "relaxed" };
  }

  log("INFO", "[preconditions] OK", { sha: shaGit, size, sha256 });
  return { ok: true, why: "ok" };
}

// ---------- UI helpers ----------
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
  const raw0 = $('#patch-in')?.value || "";
  const raw  = sanitizeInput(raw0, '#patch-in');
  let j;
  try { j = JSON.parse(raw); } catch(e){ throw new Error(`JSON invalide: ${e.message}`); }
  if (!j || !Array.isArray(j.changes) || j.changes.length===0) {
    throw new Error('Patch JSON: "changes" vide ou absent');
  }
  return j;
};
const setOut = (txt) => { const ta = $('#patch-out'); if (ta) ta.value = txt; };

// ---------- Text ops ----------
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

// ---------- Application d'un set d'ops sur un texte ----------
function applyOpsToText(text, ops, reportArr) {
  let cur = text;
  let anyChange = false;

  for (const op of (ops || [])) {
    let res = { changed:false, out:cur }, note = "";
    switch (op.type) {
      case "replace":
        res = replaceOnce(cur, op.find ?? "", op.replace ?? "");
        reportArr?.push?.(`  + replace: ${res.changed ? "1 occur. remplacée" : "0"}`);
        break;
      case "replace_all":
        res = replaceAll(cur, op.find ?? "", op.replace ?? "");
        reportArr?.push?.(`  + replace_all: ${res.count ?? 0} occur. remplacée(s)`);
        break;
      case "replace_regex":
        res = replaceRegex(cur, op.pattern ?? "", op.flags ?? "", op.replace ?? "");
        reportArr?.push?.(`  + replace_regex: ${res.changed ? `${res.count||"?"} occur.` : "0"}`);
        break;
      case "insert_after_anchor":
        res = insertAfterAnchor(cur, op.anchor ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"anchor manquante"})`;
        reportArr?.push?.(`  + insert_after_anchor: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "insert_before_anchor":
        res = insertBeforeAnchor(cur, op.anchor ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"anchor manquante"})`;
        reportArr?.push?.(`  + insert_before_anchor: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "insert_after_line":
        res = insertAfterLine(cur, op.line_match?.regex ?? "", op.line_match?.flags ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"regex sans match"})`;
        reportArr?.push?.(`  + insert_after_line: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "insert_before_line":
        res = insertBeforeLine(cur, op.line_match?.regex ?? "", op.line_match?.flags ?? "", op.lines ?? []);
        note = res.changed ? "" : ` (${res.info||"regex sans match"})`;
        reportArr?.push?.(`  + insert_before_line: ${res.changed ? "OK" : "NOOP"}${note}`);
        break;
      case "delete_line":
        res = deleteLine(cur, op.find ?? "", op.line_match?.regex, op.line_match?.flags);
        reportArr?.push?.(`  + delete_line: ${res.changed ? "supprimé(s)" : "0"}`);
        break;
      default:
        reportArr?.push?.(`  - OP inconnue: ${op.type}`);
        res = { changed:false, out:cur };
    }
    if (res.changed) { cur = res.out; anyChange = true; }
  }

  return { text: cur, changed: anyChange };
}

// ---------- Dry-run ----------
async function patchDryRun() {
  safeLog("INFO", "[enter] patchDryRun()");
  busy(true);
  $('#status').textContent = 'Patch — Dry-run…';

  try {
    const ctx = readCtx();
    const spec = getPatchJSON();

    let out = `DRY-RUN — Patching ${ctx.owner}/${ctx.repo}@${ctx.branch}\n\n`;

    let i = 0;
    for (const change of spec.changes) {
      i++;
      safeLog("VERBOSE", `[patchDryRun] Fichier ${i}/${spec.changes.length}: ${change.path}`);
      out += `# ${change.path}\n`;
      try {
        const meta = await ghGetFile({ ...ctx, path: change.path });
        const text = base64ToUtf8(meta.content || "");
        safeLog("VERBOSE", `[patchDryRun] Fichier récupéré`, { path: change.path, size: meta.size ?? text.length });

        const preChk = await checkPreconditions(meta, text, change.pre, TV?.log);
        if (!preChk.ok) {
          out += `  ❌ Préconditions NON satisfaites — patch ignoré (strict)\n\n`;
          continue;
        }

        const report = [];
        const { text: patched, changed } = applyOpsToText(text, change.ops || [], report);

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

// ---------- Apply ----------
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
        const original = base64ToUtf8(meta.content || "");

        const preChk = await checkPreconditions(meta, original, change.pre, TV?.log);
        if (!preChk.ok) {
          out += `  ❌ Préconditions NON satisfaites — patch ignoré (strict)\n\n`;
          continue;
        }

        const report = [];
        const { text: patched, changed } = applyOpsToText(original, change.ops || [], report);
        report.forEach(line => out += `    ${line}\n`);
        if (!changed) { out += `  => inchangé (skip)\n\n`; continue; }

        // Backup avant écriture
        try {
          await writeBackupOld(ctx, change.path, original, committer);
          out += `  backup: ${change.path}.old ✅\n`;
          safeLog('INFO','Backup .old écrit', { path: change.path + '.old' });
        } catch (e) {
          out += `  backup: ${change.path}.old ❌ ${String(e)}\n`;
          safeLog('WARN','Backup .old impossible', { path: change.path + '.old', error: String(e) });
        }

        await ghPutFile({
          ...ctx,
          path: change.path,
          sha: meta.sha, // verrouillage optimiste
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

// ---------- Wire buttons ----------
document.getElementById('btn-patch-dryrun')?.addEventListener('click', patchDryRun);
document.getElementById('btn-patch-apply')?.addEventListener('click', patchApply);

// ---------- Input hardening (on load) ----------
(function hardenEditors(){
  const taIn  = document.getElementById('patch-in');
  const taOut = document.getElementById('patch-out');
  [taIn, taOut].forEach(ta => {
    if (!ta) return;
    ta.setAttribute('autocapitalize','off');
    ta.setAttribute('autocorrect','off');
    ta.setAttribute('autocomplete','off');
    ta.setAttribute('spellcheck','false');
    ta.setAttribute('inputmode','none');
    ta.setAttribute('wrap','off');
  });
  if (taIn){
    taIn.addEventListener('input', ()=>{
      const v = taIn.value;
      if (hasSmartChars(v)){
        const pos = taIn.selectionStart;
        taIn.value = desmartUnicode(v);
        const p = Math.min(pos, taIn.value.length);
        taIn.selectionStart = taIn.selectionEnd = p;
        const warn = document.getElementById('patch-warn');
        if (warn) warn.textContent = '⚠️ Caractères “smart” détectés et normalisés.';
      } else {
        const warn = document.getElementById('patch-warn');
        if (warn) warn.textContent = '';
      }
    });
  }
})();

// ---------- Import JSON depuis un fichier (bouton) ----------
(function setupJsonFileImport(){
  try {
    const ta = document.getElementById('patch-in');
    if (!ta) return; // pas d'éditeur détecté

    // Crée le bouton
    const btn = document.createElement('button');
    btn.textContent = '📂 Load JSON file';
    btn.className = 'ghost';
    btn.type = 'button';
    btn.style.margin = '8px 0';
    // Insère le bouton juste avant le textarea
    ta.parentNode?.insertBefore(btn, ta);

    // Input fichier caché
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    btn.addEventListener('click', ()=> input.click());
    input.addEventListener('change', async ()=>{
      const file = input.files?.[0];
      if(!file){ TV?.log?.('WARN','Aucun fichier JSON sélectionné'); return; }
      try {
        const rawText = await file.text();
        // Nettoie d'abord (au cas où) puis parse
        const cleanText = typeof sanitizeInput === 'function' ? sanitizeInput(rawText, file.name) : rawText;
        const parsed = JSON.parse(cleanText);
        // Réinjecte joliment formaté dans le textarea pour inspection/édition
        ta.value = JSON.stringify(parsed, null, 2);
        TV?.log?.('INFO', `Fichier JSON importé: ${file.name}`);
        // Message d'avertissement visuel optionnel
        const warn = document.getElementById('patch-warn');
        if (warn) warn.textContent = '';
      } catch(e){
        TV?.log?.('ERROR', 'Erreur lecture JSON', { file:file?.name, error:String(e) });
        alert('Erreur de lecture du fichier JSON : ' + (e?.message || e));
      } finally {
        // Permettre un re-choix du même fichier si besoin
        input.value = '';
      }
    });
  } catch(err){
    TV?.log?.('ERROR','setupJsonFileImport failed',{ error:String(err) });
  }
})();

// ---------- Sentinelles ----------
window.addEventListener('unhandledrejection', e => {
  safeLog('ERROR','unhandledrejection (patch)', { reason:String(e?.reason) });
});
window.addEventListener('error', e => {
  safeLog('ERROR','window.onerror (patch)', {
    message:e?.message, source:e?.filename, line:e?.lineno, col:e?.colno
  });
});

// ---------- Expose tag (index build résumé) ----------
window.PATCH_BUILD_TAG = BUILD_TAG;
