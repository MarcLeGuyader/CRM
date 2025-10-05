
/*! Opportunities Table Module
 *  API: OpportunityTable.mount(container, bus, options?)
 *  - container: HTMLElement
 *  - bus: { on(topic, handler): ()=>void, emit(topic, payload):void }
 *  - options?: {
 *      zebraRGB?: string,
 *      currency?: string,
 *      resolveCompanyName?: (id:string)=>string|undefined,
 *      resolveContactName?: (id:string)=>string|undefined
 *    }
 */
(function(global){
  function fmtMoney(v, currency){
    if (v == null || v === '' || isNaN(Number(v))) return '';
    try{ return Number(v).toLocaleString(undefined, { style:'currency', currency: currency || 'EUR' }); }
    catch{ return String(v); }
  }
  function iso(d){ return d || ''; }

  function defaultResolver(){ return undefined; }

  function mount(container, bus, options){
    const opts = options || {};
    const state = {
      rows: [],
      filters: null,
      resolveCompanyName: opts.resolveCompanyName || defaultResolver,
      resolveContactName: opts.resolveContactName || defaultResolver,
      currency: opts.currency || 'EUR'
    };

    // root
    const wrap = document.createElement('div');
    wrap.className = 'opps-wrap';
    wrap.innerHTML = `
      <table class="opps-table" id="opps-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Sales step</th>
            <th>Client</th>
            <th>Owner</th>
            <th>Company</th>
            <th>Contact name</th>
            <th>Notes</th>
            <th>Next actions</th>
            <th>Next action date</th>
            <th>Closing date</th>
            <th>Closing value</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    container.innerHTML = '';
    container.appendChild(wrap);

    const tbody = wrap.querySelector('tbody');

    function passFilters(row){
      const f = state.filters || {};
      // text query across common fields
      if (f.q){
        const hay = `${row.name||''} ${row.client||''} ${row.owner||''} ${row.notes||''} ${row.nextAction||''}`.toLowerCase();
        if (!hay.includes(String(f.q).toLowerCase())) return false;
      }
      if (f.salesStep && row.salesStep !== f.salesStep) return false;
      if (f.client && String(row.client||'').toLowerCase().indexOf(String(f.client).toLowerCase()) === -1) return false;
      if (f.closeDate){
        const d = row.closingDate ? new Date(row.closingDate) : null;
        if (f.closeDate.from){
          const from = new Date(f.closeDate.from);
          if (!d || d < from) return false;
        }
        if (f.closeDate.to){
          const to = new Date(f.closeDate.to);
          if (!d || d > to) return false;
        }
      }
      return true;
    }

    function render(){
      const rows = (state.rows || []).filter(passFilters);
      if (!rows.length){
        tbody.innerHTML = `<tr><td class="opps-empty" colspan="12">No opportunities match your filter.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => {
        const companyName = state.resolveCompanyName(r.companyId) || '';
        const contactName = state.resolveContactName(r.contactId) || '';
        return `<tr data-id="${r.id||''}">
          <td class="action" title="Edit">✏️</td>
          <td>${escapeHtml(r.name||'')}</td>
          <td>${escapeHtml(r.salesStep||'')}</td>
          <td>${escapeHtml(r.client||'')}</td>
          <td>${escapeHtml(r.owner||'')}</td>
          <td><span class="link" data-act="company">${escapeHtml(companyName)}</span></td>
          <td><span class="link" data-act="contact">${escapeHtml(contactName)}</span></td>
          <td>${escapeHtml(r.notes||'')}</td>
          <td>${escapeHtml(r.nextAction||'')}</td>
          <td>${escapeHtml(iso(r.nextActionDate))}</td>
          <td>${escapeHtml(iso(r.closingDate))}</td>
          <td>${escapeHtml(fmtMoney(r.closingValue, state.currency))}</td>
        </tr>`;
      }).join('');
    }

    // simple html escape
    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    // wire row actions
    tbody.addEventListener('click', (e)=>{
      const td = e.target.closest('td');
      const tr = e.target.closest('tr');
      if (!td || !tr) return;
      const id = tr.getAttribute('data-id') || undefined;
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (td.classList.contains('action')){
        bus.emit('dialogs.open.opportunity', { id });
        return;
      }
      if (act === 'company'){
        const row = (state.rows || []).find(x => x.id === id);
        if (row && row.companyId) bus.emit('dialogs.open.company', { companyId: row.companyId });
        return;
      }
      if (act === 'contact'){
        const row = (state.rows || []).find(x => x.id === id);
        if (row && row.contactId) bus.emit('dialogs.open.contact', { contactId: row.contactId });
        return;
      }
    });

    // listeners
    const off = [];
    off.push(bus.on('filters.changed', payload => { state.filters = payload || null; render(); }));
    off.push(bus.on('filters.cleared', () => { state.filters = null; render(); }));
    off.push(bus.on('opps.updated', () => render()));
    off.push(bus.on('data.loaded', payload => { 
      // expect payload.rows
      state.rows = (payload && Array.isArray(payload.rows)) ? payload.rows : [];
      render();
    }));

    // public
    return {
      render: (rows, filters) => { state.rows = rows || []; state.filters = filters || null; render(); },
      destroy: () => off.forEach(fn => { try{ fn(); }catch{} })
    };
  }

  // UMD-lite
  const api = { mount };
  global.OpportunityTable = api;
})(window);
