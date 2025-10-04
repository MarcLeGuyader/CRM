
// app.js — reactivation of core buttons + init + basic data plumbing
(function () {
  const ALT_ROW_RGB = 'rgb(216,214,208)'; // requested zebra color
  const STORAGE_KEY = 'crm_state_v1';

  // --- Context (very light) ---
  const ctx = {
    opps: [],
    filters: { q: '' },
    debug: { enabled: false },
  };
  window.__CRM_CTX__ = ctx; // for quick introspection

  // --- Utils ---
  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function on(el, ev, fn) { el && el.addEventListener(ev, fn, false); }
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

  // --- Debug console integration ---
  function log(...args) {
    try {
      window.DebugConsole && window.DebugConsole.log(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    } catch(e){/*noop*/}
    console.log('[CRM]', ...args);
  }

  // --- Demo data (only if none found) ---
  function demoRows() {
    return [
      { id:'OPP-001', company:'Maello', contactFirst:'Marc', contactLast:'Le Guyader', title:'Migration CRM', value:12000, stage:'Prospecting' },
      { id:'OPP-002', company:'Acme', contactFirst:'Alice', contactLast:'Martin', title:'Support Pack', value:4500, stage:'Qualified' },
      { id:'OPP-003', company:'Globex', contactFirst:'John', contactLast:'Doe', title:'Integration', value:22000, stage:'Proposal' },
      { id:'OPP-004', company:'Initech', contactFirst:'Peter', contactLast:'Gibbons', title:'Upsell', value:7600, stage:'Negotiation' },
    ];
  }

  // --- Persistence ---
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        ctx.opps = Array.isArray(s.opps) ? s.opps : demoRows();
        ctx.filters = s.filters || { q: '' };
        return;
      }
    } catch(e){}
    ctx.opps = demoRows();
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ opps: ctx.opps, filters: ctx.filters }));
    log('State saved.');
  }

  // --- Import / Export ---
  function tryImportCSV(text) {
    // very tiny CSV — comma separated with header
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const headers = lines.shift().split(',').map(h => h.trim());
    const rows = lines.map(line => {
      const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, i) => row[h] = cells[i]);
      return {
        id: row.id || `OPP-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
        company: row.company || row.societe || '',
        contactFirst: row.contactFirst || row.prenom || '',
        contactLast: row.contactLast || row.nom || '',
        title: row.title || row.opportunity || '',
        value: Number(row.value || row.montant || 0),
        stage: row.stage || row.etape || 'Prospecting'
      };
    });
    ctx.opps = rows;
    window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
    saveState();
    log('CSV imported:', rows.length, 'rows');
  }

  function exportCSV() {
    if (!ctx.opps.length) { alert('No data to export'); return; }
    const headers = ['id','company','contactFirst','contactLast','title','value','stage'];
    const body = ctx.opps.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const csv = headers.join(',') + '\n' + body;
    downloadFile('crm_export.csv', 'text/csv;charset=utf-8', csv);
    log('CSV exported.');
  }

  // --- Button handlers ---
  function attachActions() {
    on($('#btnFilter'), () => window.FilterPanel && window.FilterPanel.toggle(ctx));
    on($('#btnDebug'),  () => window.DebugConsole && window.DebugConsole.toggle());
    on($('#btnNew'),    () => {
      const dlg = $('#dlg');
      if (dlg && dlg.showModal) {
        dlg.showModal();
      } else {
        // quick inline add
        const id = `OPP-${Date.now().toString().slice(-5)}`;
        ctx.opps.unshift({ id, company:'', contactFirst:'', contactLast:'', title:'(new)', value:0, stage:'Prospecting' });
        window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
        log('Quick new opportunity created:', id);
      }
      saveState();
    });
    on($('#btnReset'),  () => {
      ctx.filters = { q: '' };
      window.FilterPanel && window.FilterPanel.resetUI();
      window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
      saveState();
      log('Reset done.');
    });
    on($('#btnUpload'), () => {
      let fi = $('#hiddenFile');
      if (!fi) {
        fi = document.createElement('input');
        fi.type = 'file';
        fi.id = 'hiddenFile';
        fi.accept = '.csv, text/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
          alert('XLSX parsing not embedded here. Export your Excel to CSV and import the CSV.');
        }
      };
      fi.click();
    });
    on($('#btnExport'), exportCSV);
    on($('#btnSave'),   saveState);
  }

  // --- Live filtering ---
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

  // Expose for FilterPanel
  window.__CRM_applyFiltersAndRender = applyFiltersAndRender;

  // --- Init ---
  function init() {
    loadState();
    attachActions();
    // Boot helper modules
    window.FilterPanel && window.FilterPanel.init(ctx, (q)=>{
      ctx.filters.q = q;
      applyFiltersAndRender();
      saveState();
    });
    window.DebugConsole && window.DebugConsole.init();
    // First render
    window.RenderTable && window.RenderTable.render(ctx, ctx.opps, ALT_ROW_RGB);
    log('CRM initialized.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
