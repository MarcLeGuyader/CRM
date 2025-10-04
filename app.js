import './ui/filters.js';
import './ui/debug.js';
import './ui/render-table.js';
import { importCsv } from './services/import-csv.js';
import { importXlsx } from './services/import-xlsx.js';
import { exportCsv, exportXlsx } from './services/export.js';

const STORAGE_KEY = 'crm_state_v1';
const state = { rows: [], filters: { q: '', stage: '' } };
const $ = (s, r=document)=> r.querySelector(s);
function log(...a){ const pre=$('#debugLog'); const line=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '); if(pre){ pre.textContent+=(pre.textContent?'\n':'')+line; pre.scrollTop=pre.scrollHeight;} console.log('[CRM]',...a); }

function demoRows(){ return [
  { company:'Maello', contactFirst:'Marc', contactLast:'Le Guyader', opportunity:'Migration CRM', amount:12000, stage:'Discovery', owner:'Marc' },
  { company:'Acme', contactFirst:'Alice', contactLast:'Martin', opportunity:'Support Pack', amount:4500, stage:'Qualified', owner:'Sam' },
  { company:'Globex', contactFirst:'John', contactLast:'Doe', opportunity:'Integration', amount:22000, stage:'Negotiation', owner:'Sven' },
  { company:'Initech', contactFirst:'Peter', contactLast:'Gibbons', opportunity:'Upsell', amount:7600, stage:'Closing', owner:'Marc' }
];}
function load(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const o=JSON.parse(raw); state.rows=o.rows||demoRows(); state.filters=o.filters||{q:'',stage:''}; return;} }catch{} state.rows=demoRows(); }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); log('Saved'); }

function filteredRows(){
  const q=(state.filters.q||'').toLowerCase().trim();
  const s=(state.filters.stage||'').toLowerCase().trim();
  return state.rows.filter(r=>{
    const hay=`${r.company||''} ${r.contactFirst||''} ${r.contactLast||''} ${r.opportunity||''} ${r.owner||''} ${r.stage||''}`.toLowerCase();
    const okQ=!q||hay.includes(q);
    const okS=!s||(String(r.stage||'').toLowerCase()===s);
    return okQ&&okS;
  });
}
function render(){
  const tbody=document.querySelector('#opp-table tbody');
  const rows=filteredRows();
  tbody.innerHTML=rows.map(r=>{
    const full=`${r.contactFirst||''} ${r.contactLast||''}`.trim();
    const amt=(r.amount!=null&&!Number.isNaN(Number(r.amount)))? Number(r.amount).toLocaleString(undefined,{style:'currency',currency:'EUR'}) : '';
    return `<tr>
      <td><div class="cell-company"><span class="company">${r.company||''}</span><span class="contact">${full||''}</span></div></td>
      <td>${r.opportunity||''}</td>
      <td>${amt}</td>
      <td>${r.stage||''}</td>
      <td>${r.owner||''}</td>
    </tr>`;
  }).join('');
  if(!rows.length){ tbody.innerHTML=`<tr><td colspan="5" style="padding:12px;color:#666;font-style:italic;">No opportunities match your filter.</td></tr>`; }
}

function attachHeader(){
  $('#btnFilter')?.addEventListener('click', ()=>toggleFilter(true));
  $('#filterClose')?.addEventListener('click', ()=>toggleFilter(false));
  $('#filterClear')?.addEventListener('click', ()=>{ state.filters={q:'',stage:''}; $('#filterInput').value=''; $('#filterStage').value=''; render(); });
  $('#filterInput')?.addEventListener('input', e=>{ state.filters.q=e.target.value; render(); });
  $('#filterStage')?.addEventListener('change', e=>{ state.filters.stage=e.target.value; render(); });
  $('#btnDebug')?.addEventListener('click', ()=>toggleDebug());
  $('#dbgHide')?.addEventListener('click', ()=>toggleDebug(false));
  $('#dbgClear')?.addEventListener('click', ()=>{ const pre=$('#debugLog'); if(pre) pre.textContent=''; });
  $('#btnReset')?.addEventListener('click', ()=>{ state.filters={q:'',stage:''}; $('#filterInput').value=''; $('#filterStage').value=''; render(); log('Reset filters'); });
  $('#btnSave')?.addEventListener('click', ()=>{ save(); alert('State saved'); });
  $('#btnExport')?.addEventListener('click', ()=>{ const csv=exportCsv(state.rows); const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='CRM_Opportunities.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500); log('Export CSV'); });
  $('#btnUpload')?.addEventListener('click', pickFile);
  $('#btnNew')?.addEventListener('click', openNewDialog);
  $('#dlg-cancel')?.addEventListener('click', e=>{ e.preventDefault(); closeDlg(); });
  $('#dlg-ok')?.addEventListener('click', e=>{ e.preventDefault(); submitDlg(); });
}
function toggleFilter(force){ const p=$('#filterPanel'); if(!p) return; const show=(force===true)?true:(force===false?false:p.classList.contains('hidden')); p.classList.toggle('hidden', !show); p.setAttribute('aria-hidden', String(!show)); if(show) $('#filterInput')?.focus(); }
function toggleDebug(force){ const s=$('#debugConsole'); if(!s) return; const show=(force===undefined)? s.classList.contains('hidden') : force; s.classList.toggle('hidden', !show); s.setAttribute('aria-hidden', String(!show)); }

function pickFile(){
  let inp=document.getElementById('hiddenFile');
  if(!inp){ inp=document.createElement('input'); inp.type='file'; inp.id='hiddenFile'; inp.accept='.csv,.xlsx'; inp.style.display='none'; document.body.appendChild(inp); }
  inp.value='';
  inp.onchange=async e=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    try{
      if(f.name.toLowerCase().endsWith('.csv')){ const txt=await f.text(); const rows=importCsv(txt); mergeRows(rows); }
      else { if(window.XLSX){ const buf=await f.arrayBuffer(); const rows=importXlsx(buf); mergeRows(rows); } else { alert('XLSX not available; use CSV.'); } }
      render(); save(); log('Import done.');
    }catch(err){ console.error(err); alert('Import error: '+(err?.message||err)); }
  };
  inp.click();
}
function mergeRows(incoming){
  let added=0, updated=0;
  for(const r of incoming){
    const row={
      company: r['Opportunity.Client']||r.company||'',
      contactFirst: r.contactFirst||r.first||r['Contact.First']||'',
      contactLast:  r.contactLast ||r.last ||r['Contact.Last'] ||'',
      opportunity:  r['Opportunity.Name']||r.opportunity||r.title||'',
      amount: Number(r['Opportunity.ClosingValue'] ?? r.amount ?? 0) || 0,
      stage: r['Opportunity.SalesStep']||r.stage||'',
      owner: r['Opportunity.Owner']||r.owner||''
    };
    const idx=state.rows.findIndex(x=>(x.company||'')===row.company && (x.opportunity||'')===row.opportunity);
    if(idx>=0){ state.rows[idx]=row; updated++; } else { state.rows.push(row); added++; }
  }
  log(`Merge rows: +${added}, ~${updated}`);
}
function openNewDialog(){ const dlg=document.getElementById('dlg'); const id='OPP-'+String(Date.now()).slice(-6); document.getElementById('f-id').value=id; dlg.showModal(); }
function closeDlg(){ document.getElementById('dlg').close('cancel'); }
function submitDlg(){
  const form=document.getElementById('frm'); const data=Object.fromEntries(new FormData(form).entries());
  const row={ company:data['Opportunity.Client']||'', contactFirst:'', contactLast:'', opportunity:data['Opportunity.Name']||'', amount:Number(data['Opportunity.ClosingValue']||0)||0, stage:data['Opportunity.SalesStep']||'', owner:data['Opportunity.Owner']||'' };
  state.rows.unshift(row); closeDlg(); render(); save(); log('New opportunity created.');
}

document.addEventListener('DOMContentLoaded', ()=>{ load(); attachHeader(); render(); log('CRM initialized.'); });
