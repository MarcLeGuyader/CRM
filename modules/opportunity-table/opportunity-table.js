/*! Opportunities Table Module (CRM canonical version)
 *  - Fully aligned with CRM field conventions
 *  - Uses strict ID formats:
 *      Company.ID  → CMPY-######
 *      Contact.ID  → CON-######
 *      Opportunity.ID → OPP-######
 *  - Uses dynamic client list (from orchestrator.clientList)
 *  - Displays Company + Contact with interactive links
 *  - Emits dialog open events via bus
 *
 *  API:
 *    OpportunityTable.mount(container, bus, options?)
 *      - options:
 *          currency?: string ('EUR' default)
 *          resolveCompanyName?: (id:string)=>string|undefined
 *          resolveContactName?: (id:string)=>string|undefined
 */
(function(global){
  function fmtMoney(v, currency){
    if (v == null || v === '' || isNaN(Number(v))) return '';
    try{ return Number(v).toLocaleString(undefined, { style:'currency', currency: currency || 'EUR' }); }
    catch{ return String(v); }
  }
  function iso(d){ return d || ''; }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  const RX = {
    opp: /^OPP-\d{6}$/,
    cmpy: /^CMPY-\d{6}$/,
    cont: /^CON-\d{6}$/
  };

  function defaultResolver(){ return undefined; }

  function mount(container, bus, options){
    const opts = options || {};
    const state = {
      rows: [],
      filters: null,
      resolveCompanyName: opts.resolveCompanyName || defaultResolver,
      resolveContactName: opts.resolveContactName || defaultResolver,
      currency: opts.currency || 'EUR',
      clientList: []
    };

    // root
    const wrap = document.createElement('div');
    wrap.className = 'opps-wrap';
    wrap.innerHTML = `
      <table class="opps-table" id="opps-table">
        <thead>
          <tr>
            <th></th>
            <th>Opportunity name</th>
            <th>Sales step</th>
            <th>Client</th>
            <th>Owner</th>
            <th>Company</th>
            <th>Contact</th>
            <th>Notes</th>
            <th>Next action</th>
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

    // --------------- Filtering ----------------
    function passFilters(row){
      const f = state.filters || {};

      // text query
      if (f.q){
        const hay = `${row['Opportunity.Name']||row.name||''} ${row['Opportunity.Client']||row.client||''} ${row['Opportunity.Owner']||row.owner||''} ${row['Opportunity.Notes']||row.notes||''} ${row['Opportunity.NextAction']||row.nextAction||''}`.toLowerCase();
        if (!hay.includes(String(f.q).toLowerCase())) return false;
      }

      // sales step
      if (f.salesStep && (row['Opportunity.SalesStep']||row.salesStep) !== f.salesStep) return false;

      // client name (string)
      if (f.client){
        const client = (row['Opportunity.Client']||row.client||'').toLowerCase();
        if (!client.includes(f.client.toLowerCase())) return false;
      }

      // close date filter
      if (f.closeDate){
        const d = row['Opportunity.ClosingDate'] || row.closingDate;
        if (d){
          const date = new Date(d);
          if (f.closeDate.from && new Date(f.closeDate.from) > date) return false;
          if (f.closeDate.to && new Date(f.closeDate.to) < date) return false;
        }
      }

      return true;
    }

    // --------------- Rendering ----------------
    function render(){
      const rows = (state.rows || []).filter(passFilters);
      if (!rows.length){
        tbody.innerHTML = `<tr><td class="opps-empty" colspan="12">No opportunities match your filter.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const id = r['Opportunity.ID'] || r.id || '';
        const companyId = r['Opportunity.CompanyID'] || r.companyId || '';
        const contactId = r['Opportunity.ContactID'] || r.contactId || '';
        const companyName = state.resolveCompanyName(companyId) || '';
        const contactName = state.resolveContactName(contactId) || '';
        const client = r['Opportunity.Client'] || r.client || '';
        const isClient = state.clientList.includes(companyId);

        return `
          <tr data-id="${escapeHtml(id)}">
            <td class="action" title="Edit">✏️</td>
            <td>${escapeHtml(r['Opportunity.Name']||r.name||'')}</td>
            <td>${escapeHtml(r['Opportunity.SalesStep']||r.salesStep||'')}</td>
            <td>${escapeHtml(client)}</td>
            <td>${escapeHtml(r['Opportunity.Owner']||r.owner||'')}</td>
            <td>
              <span class="link" data-act="company" title="Open company">${escapeHtml(companyName)}</span>
              ${isClient ? '<span class="mini" style="color:#16a34a;font-weight:600;">Client</span>' : ''}
            </td>
            <td>
              <span class="link" data-act="contact" title="Open contact">${escapeHtml(contactName)}</span>
            </td>
            <td>${escapeHtml(r['Opportunity.Notes']||r.notes||'')}</td>
            <td>${escapeHtml(r['Opportunity.NextAction']||r.nextAction||'')}</td>
            <td>${escapeHtml(iso(r['Opportunity.NextActionDate']||r.nextActionDate))}</td>
            <td>${escapeHtml(iso(r['Opportunity.ClosingDate']||r.closingDate))}</td>
            <td>${escapeHtml(fmtMoney(r['Opportunity.ClosingValue']||r.closingValue, state.currency))}</td>
          </tr>`;
      }).join('');
    }

    // --------------- Row actions ----------------
    tbody.addEventListener('click', (e)=>{
      const td = e.target.closest('td');
      const tr = e.target.closest('tr');
      if (!td || !tr) return;
      const id = tr.getAttribute('data-id');
      const act = e.target.getAttribute && e.target.getAttribute('data-act');

      if (td.classList.contains('action')){
        bus.emit('dialogs.open.opportunity', { id });
        return;
      }
      if (act === 'company'){
        const row = (state.rows || []).find(x => (x.id||x['Opportunity.ID']) === id);
        const companyId = row && (row.companyId || row['Opportunity.CompanyID']);
        if (companyId && RX.cmpy.test(companyId))
          bus.emit('dialogs.open.company', { companyId });
        return;
      }
      if (act === 'contact'){
        const row = (state.rows || []).find(x => (x.id||x['Opportunity.ID']) === id);
        const contactId = row && (row.contactId || row['Opportunity.ContactID']);
        if (contactId && RX.cont.test(contactId))
          bus.emit('dialogs.open.contact', { contactId });
        return;
      }
    });

    // --------------- Listeners ----------------
    const off = [];
    off.push(bus.on('filters.changed', payload => { state.filters = payload || null; render(); }));
    off.push(bus.on('filters.cleared', () => { state.filters = null; render(); }));
    
off.push(bus.on('opps.updated', () => {
  const s = window.DATA?.orchestrator?.getState?.();
  if (s?.rows && Array.isArray(s.rows)) {
    state.rows = s.rows;   // on récupère les lignes depuis l’orchestrateur
  }
  render();
}));
    
    off.push(bus.on('data.loaded', payload => { 
      if (!payload) return;
      // rows
      state.rows = Array.isArray(payload.rows) ? payload.rows : [];
      // client list (from orchestrator)
      if (Array.isArray(payload.clientList)) state.clientList = payload.clientList;
      render();
    }));

    // --------------- Public API ----------------
    return {
      render: (rows, filters) => { state.rows = rows || []; state.filters = filters || null; render(); },
      destroy: () => off.forEach(fn => { try{ fn(); }catch{} })
    };
  }

  global.OpportunityTable = { mount };
})(window);
