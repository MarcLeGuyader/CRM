import { VERSION_STAMP } from './config/version.js';
import { settings } from './config/settings.js';
import { initState } from './core/state.js';
import { on, setText } from './ui/dom.js';
import { attachFilters } from './ui/filters.js';
import { attachDebug } from './ui/debug.js';
import { attachDialog } from './ui/dialog.js';
import { renderTable } from './ui/render-table.js';
import { importXlsx } from './services/import-xlsx.js';
import { importCsv } from './services/import-csv.js';
import { exportXlsx, exportCsv } from './services/export.js';

window.addEventListener('DOMContentLoaded', () => {
  setText('.title .version', VERSION_STAMP);
  const ctx = initState(settings);

  attachFilters(ctx, () => renderTable(ctx));
  attachDebug(ctx);
  attachDialog(ctx, () => renderTable(ctx));

  on('#btn-new','click', () => ctx.openEditor());
  on('#btn-save','click', () => { ctx.save(); alert('Data saved locally.'); });

//  on('#btn-reset','click', () => {
//    if(!confirm('Reset local data?')) return;
//    ctx.reset(); renderTable(ctx);
//  });

on('#btn-reset','click', () => {
  if(!confirm('Reset local data?')) return;
  ctx.reset();
  ['#q','#f-client','#f-owner','#f-step','#f-nextdate'].forEach(sel=>{
    const el=document.querySelector(sel);
    if(!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  const tb=document.getElementById('tbody'); 
  if (tb) tb.innerHTML = '';
  renderTable(ctx);
  alert('Local data cleared.');
});

  
  on('#btn-export-xlsx','click', () => exportXlsx(ctx));
  on('#btn-export-csv','click',  () => exportCsv(ctx));

  const fin=document.getElementById('file-input');
  if (fin) fin.addEventListener('change', async ev => {
    const f=ev.target.files?.[0]; if (!f) return;
    const ext=f.name.toLowerCase().split('.').pop();
    try {
      if (ext==='csv') await importCsv(ctx,f);
      else await importXlsx(ctx,f);
      renderTable(ctx);
    } catch (e){
      alert('Import error. Check headers & sheet names.');
      console.error(e);
    } finally {
      ev.target.value='';
    }
  });

  renderTable(ctx);
  console.log('[CRM] started', { rows: ctx.rows.length, companies: Object.keys(ctx.companies).length, contacts: Object.keys(ctx.contInfo).length });
});
