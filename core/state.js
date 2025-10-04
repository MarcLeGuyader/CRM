import { loadAll, saveAll, resetAll } from './storage.js';

export function initState(settings){
  const { rows, companies, contacts, compInfo, contInfo } = loadAll();
  const ctx = { rows, companies, contacts, compInfo, contInfo, settings, editingIndex: -1 };
  ctx.save = () => saveAll(ctx);
  ctx.reset = () => resetAll(ctx);
  rebuildIndexes(ctx);
  return ctx;
}

export function rebuildIndexes(ctx){
  // --- Companies: id -> name ---
  ctx.compById = {};
  // From name->id map
  for (const [name, id] of Object.entries(ctx.companies || {})){
    const k = String(id || "").trim();
    if (k) ctx.compById[k] = name;
  }
  // From compInfo (id -> {name})
  for (const [id, info] of Object.entries(ctx.compInfo || {})){
    const k = String(id || "").trim();
    const n = (info && info.name) ? String(info.name).trim() : "";
    if (k && n) ctx.compById[k] = n;
  }

  // --- Contacts: id -> "First « Last »" or display name ---
  ctx.contById = {};
  for (const [id, info] of Object.entries(ctx.contInfo || {})){
    const k = String(id || "").trim();
    if (!k) continue;
    const first = String(info?.first || "").trim();
    const last  = String(info?.last  || "").trim();
    const name  = String(info?.name  || "").trim();
    const disp  = (first || last) ? `${first} « ${last} »`.trim() : name;
    if (disp) ctx.contById[k] = disp;
  }
}
