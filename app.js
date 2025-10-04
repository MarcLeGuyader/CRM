
// app.js — wiring + persistence + import/export + live filter
(function () {
  const ALT_ROW_RGB = 'rgb(216,214,208)'; // zebra color
  const STORAGE_KEY = 'crm_state_v1';

  const ctx = {
    opps: [],
    filters: { q: '' },
    debug: { enabled: false },
  };
  window.__CRM_CTX__ = ctx;

  // Helpers
  const $ = (s, r=document)=>r.querySelector(s);
  const on = (el, ev, fn)=> el && el.addEventListener(ev, fn, false);
  function downloadFile(filename, mime, content) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function log(...args){
    try{ window.DebugConsole && window.DebugConsole.log(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); }catch{}
    console.log('[CRM]', ...args);
  }

  // Demo rows
  function demoRows() {
    return [
      { id:'OPP-001', company:'Maello', contactFirst:'Marc', contactLast:'Le Guyader', title:'Migration CRM', value:12000, stage:'Prospecting', owner:'Marc' },
      { id:'OPP-002', company:'Acme',   contactFirst:'Alice', contactLast:'Martin',    title:'Support Pack', value:4500,  stage:'Qualified',  owner:'Sam'  },
      { id:'OPP-003', company:'Globex', contactFirst:'John',  contactLast:'Doe',       title:'Integration',  value:22000, stage:'Proposal',   owner:'Sven' },
      { id:'OPP-004', company:'Initech',contactFirst:'Peter', contactLast:'Gibbons',   title:'Upsell',       value:7600,  stage:'Negotiation',owner:'Marc' },
    ];
  }

  // Persistence
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        ctx.opps = Array.isArray(s.opps) ? s.opps : demoRows();
        ctx.filters = s.filters || { q: '' };
        return;
      }
    } catch {}
    ctx.opps = demoRows();
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ opps: ctx.opps, filters: ctx.filters }));
    log('State saved.');
  }

  // Import / Export (CSV only, XLSX out of scope for now)
  function tryImportCSV(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const headers = lines.shift().split(',').map(h => h.trim());
    const rows = lines.map(line => {
      const cells = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => row[h] = (cells[i] ?? '').trim());
      return {
        id: row.id || `OPP-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
        company: row.company || row.societe || '',
        contactFirst: row.contactFirst || row.prenom || '',
        contactLast:  row.contactLast  || row.nom    || '',
        title: row.title || row.opportunity || '',
        value: Number(row.value || row.montant || 0),
        stage: row.stage || row.etape || 'Prospecting',
        owner: row.owner || ''
      };
    });
    ctx.opps = rows;
    window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
    saveState();
    log('CSV imported:', rows.length, 'rows');
  }
  function parseCSVLine(line){
    const out=[], re=/(?:^|,)(?:"([^"\\]*(?:""[^"\\]*)*)"|([^",]*))/g; let m;
    while((m=re.exec(line))!==null) out.push((m[1]||m[2]||'').replace(/""/g,'"'));
    return out;
  }
  function exportCSV() {
    if (!ctx.opps.length) { alert('No data to export'); return; }
    const headers = ['id','company','contactFirst','contactLast','title','value','stage','owner'];
    const body = ctx.opps.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const csv = headers.join(',') + '\n' + body;
    downloadFile('crm_export.csv', 'text/csv;charset=utf-8', csv);
    log('CSV exported.');
  }

  // Button handlers (IDs = hyphenated per index.html)
  function attachActions() {
    on($('#btn-filter'), () => window.FilterConsole && window.FilterConsole.toggle(ctx));
    on($('#btn-debug'),  () => window.DebugConsole  && window.DebugConsole.toggle());
    on($('#btn-new'),    () => {
      const id = `OPP-${Date.now().toString().slice(-6)}`;
      ctx.opps.unshift({ id, company:'', contactFirst:'', contactLast:'', title:'(new)', value:0, stage:'Prospecting', owner:'' });
      window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
      saveState();
      log('New opportunity created:', id);
    });
    on($('#btn-reset'),  () => {
      ctx.filters = { q: '' };
      window.FilterConsole && window.FilterConsole.resetUI();
      window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
      saveState();
      log('Reset done.');
    });
    on($('#btn-upload'), () => {
      let fi = $('#hiddenFile');
      if (!fi) {
        fi = document.createElement('input');
        fi.type = 'file';
        fi.id = 'hiddenFile';
        fi.accept = '.csv, text/csv';
        fi.style.display = 'none';
        document.body.appendChild(fi);
      }
      fi.value = '';
      fi.onchange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.name.toLowerCase().endsWith('.csv')) {
          const reader = new FileReader();
          reader.onload = () => tryImportCSV(reader.result);
          reader.readAsText(f);
        } else {
          alert('Please export your Excel as CSV and import the CSV here.');
        }
      };
      fi.click();
    });
    on($('#btn-export'), exportCSV);
    on($('#btn-save'),   saveState);
  }

  // Live filter
  function applyFiltersAndRender() {
    const q = (ctx.filters.q || '').toLowerCase().trim();
    const rows = !q ? ctx.opps : ctx.opps.filter(r => {
      const company = (r.company||'').toLowerCase();
      const contact = `${r.contactFirst||''} ${r.contactLast||''}`.toLowerCase();
      const title = (r.title||'').toLowerCase();
      return company.includes(q) || contact.includes(q) || title.includes(q) || String(r.value).includes(q) || (r.stage||'').toLowerCase().includes(q);
    });
    window.RenderTable && window.RenderTable.render(ctx, rows, ALT_ROW_RGB);
  }
  window.__CRM_applyFiltersAndRender = applyFiltersAndRender;

  function init() {
    loadState();
    attachActions();
    window.FilterConsole && window.FilterConsole.init(ctx, (q)=>{
      ctx.filters.q = q;
      applyFiltersAndRender();
      saveState();
    });
    window.DebugConsole && window.DebugConsole.init();
    window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
    log('CRM initialized.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
