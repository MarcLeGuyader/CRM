import { loadAll, saveAll, resetAll } from './storage.js';
export function initState(settings){
  const { rows, companies, contacts, compInfo, contInfo } = loadAll();
  const ctx = { rows, companies, contacts, compInfo, contInfo, settings, editingIndex: -1 };
  ctx.save = () => saveAll(ctx);
  ctx.reset = () => resetAll(ctx);
  return ctx;
}
