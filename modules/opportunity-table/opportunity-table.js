/*! Opportunities Table Module (CRM canonical version, inline-edit ready)
 *  - Fully aligned with CRM field conventions
 *  - Inline editing toggled by: ui.banner.inlineEdit.on / .off / .toggle
 *  - Strict ID formats (CMPY-######, CON-######, OPP-######)
 *  - Dynamic client list badges
 *  - OPEN OPPORTUNITY DIALOG BY CLICKING NAME (read-only mode only)
 *  - Pencil icon column removed (always)
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
    opp:  /^OPP-\d{6}$/,
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
      clientList: [],
      isInlineEdit: false
    };

    // Root/table skeleton (NO pencil column)
    const wrap = document.createElement('div');
    wrap.className = 'opps-wrap';
    wrap.innerHTML = `
      <table class="opps-table" id="opps-table">
        <thead>
          <tr>
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

    // -------- Filters --------
    function passFilters(row){
      const f = state.filters || {};

      if (f.q){
        const hay = `${row['Opportunity.Name']||row.name||''} ${row['Opportunity.Client']||row.client||''} ${row['Opportunity.Owner']||row.owner||''} ${row['Opportunity.Notes']||row.notes||''} ${row['Opportunity.NextAction']||row.nextAction||''}`.toLowerCase();
        if (!hay.includes(String(f.q).toLowerCase())) return false;
      }
      if (f.salesStep && (row['Opportunity.SalesStep']||row.salesStep) !== f.salesStep) return false;

      if (f.client){
        const client = (row['Opportunity.Client']||row.client||'').toLowerCase();
        if (!client.includes(f.client.toLowerCase())) return false;
      }

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

    // -------- Render --------
    function render(){
      const rows = (state.rows || []).filter(passFilters);

      if (!rows.length){
        tbody.innerHTML = `<tr><td class="opps-empty" colspan="11">No opportunities match your filter.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const id         = r['Opportunity.ID'] || r.id || '';
        const name       = r['Opportunity.Name'] || r.name || '';
        const step       = r['Opportunity.SalesStep'] || r.salesStep || '';
        const client     = r['Opportunity.Client'] || r.client || '';
        const owner      = r['Opportunity.Owner'] || r.owner || '';
        const notes      = r['Opportunity.Notes'] || r.notes || '';
        const nextAct    = r['Opportunity.NextAction'] || r.nextAction || '';
        const nextActDt  = r['Opportunity.NextActionDate'] || r.nextActionDate || '';
        const closingDt  = r['Opportunity.ClosingDate'] || r.closingDate || '';
        const closingVal = r['Opportunity.ClosingValue'] || r.closingValue;

        const companyId   = r['Opportunity.CompanyID'] || r.companyId || '';
        const contactId   = r['Opportunity.ContactID'] || r.contactId || '';
        const companyName = state.resolveCompanyName(companyId) || '';
        const contactName = state.resolveContactName(contactId) || '';
        const isClient    = state.clientList.includes(companyId);

        if (state.isInlineEdit){
          // Inline editable row: NO LINKS, inputs for most fields
          return `
            <tr data-id="${escapeHtml(id)}" class="inline">
              <td><input type="text" value="${escapeHtml(name)}" data-field="name"/></td>
              <td><input type="text" value="${escapeHtml(step)}" data-field="salesStep"/></td>
              <td><input type="text" value="${escapeHtml(client)}" data-field="client"/></td>
              <td><input type="text" value="${escapeHtml(owner)}" data-field="owner"/></td>
              <td><input type="text" value="${escapeHtml(companyName)}" data-field="companyName" disabled/></td>
              <td><input type="text" value="${escapeHtml(contactName)}" data-field="contactName" disabled/></td>
              <td><input type="text" value="${escapeHtml(notes)}" data-field="notes"/></td>
              <td><input type="text" value="${escapeHtml(nextAct)}" data-field="nextAction"/></td>
              <td><input type="date" value="${escapeHtml(iso(nextActDt))}" data-field="nextActionDate"/></td>
              <td><input type="date" value="${escapeHtml(iso(closingDt))}" data-field="closingDate"/></td>
              <td><input type="number" step="0.01" value="${escapeHtml(closingVal||'')}" data-field="closingValue"/></td>
            </tr>
          `;
        }

        // Read-only row: name is clickable to open Opportunity dialog; company/contact are clickable
        return `
          <tr data-id="${escapeHtml(id)}">
            <td><span class="link" data-act="opportunity" title="Open opportunity">${escapeHtml(name)}</span></td>
            <td>${escapeHtml(step)}</td>
            <td>${escapeHtml(client)}</td>
            <td>${escapeHtml(owner)}</td>
            <td>
              <span class="link" data-act="company" title="Open company">${escapeHtml(companyName)}</span>
              ${isClient ? '<span class="mini" style="color:#16a34a;font-weight:600;margin-left:6px;">Client</span>' : ''}
            </td>
            <td><span class="link" data-act="contact" title="Open contact">${escapeHtml(contactName)}</span></td>
            <td>${escapeHtml(notes)}</td>
            <td>${escapeHtml(nextAct)}</td>
            <td>${escapeHtml(iso(nextActDt))}</td>
            <td>${escapeHtml(iso(closingDt))}</td>
            <td>${escapeHtml(fmtMoney(closingVal, state.currency))}</td>
          </tr>
        `;
      }).join('');

			// toggle inline CSS class on wrapper to adjust link styling
wrap.classList.toggle('inline', !!state.isInlineEdit);
    }

    // -------- Row click behavior --------
    tbody.addEventListener('click', (e)=>{
      const tr = e.target.closest('tr');
      if (!tr) return;
      const id  = tr.getAttribute('data-id');
      const act = e.target.getAttribute && e.target.getAttribute('data-act');

      // In inline mode, all navigation is disabled
      if (state.isInlineEdit) return;

      if (act === 'opportunity'){
        bus.emit('dialogs.open.opportunity', { id });
        return;
      }
      if (act === 'company'){
        const row = (state.rows || []).find(x => (x.id||x['Opportunity.ID']) === id);
        const companyId = row && (row.companyId || row['Opportunity.CompanyID']);
        if (companyId && RX.cmpy.test(companyId)) bus.emit('dialogs.open.company', { companyId });
        return;
      }
      if (act === 'contact'){
        const row = (state.rows || []).find(x => (x.id||x['Opportunity.ID']) === id);
        const contactId = row && (row.contactId || row['Opportunity.ContactID']);
        if (contactId && RX.cont.test(contactId)) bus.emit('dialogs.open.contact', { contactId });
        return;
      }
    });

    // -------- Listeners --------
    const off = [];
    off.push(bus.on('filters.changed', payload => { state.filters = payload || null; render(); }));
    off.push(bus.on('filters.cleared', () => { state.filters = null; render(); }));

    off.push(bus.on('opps.updated', () => {
      const s = window.DATA?.orchestrator?.getState?.();
      if (s?.rows && Array.isArray(s.rows)) state.rows = s.rows;
      if (Array.isArray(s?.clientList)) state.clientList = s.clientList;
      render();
    }));

    off.push(bus.on('data.loaded', payload => { 
      if (!payload) return;
      state.rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (Array.isArray(payload.clientList)) state.clientList = payload.clientList;
      render();
    }));

    // Inline Edit mode controls — LISTEN FOR EXACT EVENT NAMES
    off.push(bus.on('ui.banner.inlineEdit.on',     () => { state.isInlineEdit = true;  render(); }));
    off.push(bus.on('ui.banner.inlineEdit.off',    () => { state.isInlineEdit = false; render(); }));
    off.push(bus.on('ui.banner.inlineEdit.toggle', () => { state.isInlineEdit = !state.isInlineEdit; render(); }));

    // -------- Public API --------
    return {
      render: (rows, filters) => { state.rows = rows || []; state.filters = filters || null; render(); },
      destroy: () => off.forEach(fn => { try{ fn(); }catch{} })
    };
  }

  global.OpportunityTable = { mount };
})(window);
