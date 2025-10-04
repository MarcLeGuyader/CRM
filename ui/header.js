
(function(){
  function byId(id){ return document.getElementById(id); }
  function toggle(id){ const el = byId(id); if(!el) return; el.classList.toggle('hidden'); }

  function safeCall(path){
    // Call window.CRM[path] if exists; otherwise no-op + log
    const fn = path && window.CRM && typeof window.CRM[path] === 'function' ? window.CRM[path] : null;
    if (fn) { try { fn(); } catch(e){ console.error(e);} }
    else { console.log('[stub]', path, 'not found; showing minimal UI'); }
  }

  window.setupHeader = function(){
    byId('btn-filter').addEventListener('click', () => { toggle('panel-filter'); safeCall('onFilter'); });
    byId('btn-new').addEventListener('click', () => { safeCall('onNewOpportunity'); });
    byId('btn-debug').addEventListener('click', () => {
      toggle('panel-debug');
      const out = byId('debug-out');
      const snapshot = { time: new Date().toISOString(), state: (window.CRM && window.CRM.state) || null };
      out.textContent = JSON.stringify(snapshot, null, 2);
      safeCall('onDebug');
    });
    byId('btn-reset').addEventListener('click', () => { safeCall('onReset'); });
    byId('btn-upload').addEventListener('click', () => { safeCall('onUpload'); });
    byId('btn-export').addEventListener('click', () => { safeCall('onExport'); });
    byId('btn-save').addEventListener('click', () => { safeCall('onSave'); });
    // panel close buttons
    document.querySelectorAll('.panel-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-target');
        toggle(id);
      });
    });
    // basic apply/clear for demo
    const apply = document.getElementById('filter-apply');
    const clear = document.getElementById('filter-clear');
    if (apply) apply.addEventListener('click', () => {
      const q = (document.getElementById('filter-q').value || '').toLowerCase();
      if (!window.CRM || !window.CRM.state || !Array.isArray(window.CRM.state.opportunities)) return;
      const base = window.CRM.state.opportunities;
      const filtered = base.filter(o => {
        const name = (o.company || '') + ' ' + (o.contactFirst || '') + ' ' + (o.contactLast || '') + ' ' + (o.title || '');
        return name.toLowerCase().includes(q);
      });
      window.renderOpportunities(filtered);
    });
    if (clear) clear.addEventListener('click', () => {
      document.getElementById('filter-q').value = '';
      if (window.CRM && window.CRM.state) window.renderOpportunities(window.CRM.state.opportunities || []);
    });
  };
})();
