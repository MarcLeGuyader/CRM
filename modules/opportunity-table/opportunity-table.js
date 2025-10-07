/*! Opportunities Table Module (CRM canonical, inline-edit + verbose trace)
 *  - Inline editing is controlled ONLY by: ui.opptable.inline.toggle  (payload: { on: boolean })
 *  - Read-only: Opportunity name opens dialog; Company/Contact open their dialogs
 *  - Inline ON: no navigation, links neutralized, fields editable (company/contact readonly here)
 *  - Strict IDs: OPP-######, CMPY-######, CON-######
 *  - Pencil icon column: removed
 *  - Verbose tracing via bus event: opptable.trace
 *  - CSS dump: prints computed styles + matching CSS rules for links each render
 */

(function(global){
  function fmtMoney(v, currency){
    if (v == null || v === '' || isNaN(Number(v))) return '';
    try{ return Number(v).toLocaleString(undefined, { style:'currency', currency: currency || 'EUR' }); }
    catch{ return String(v); }
  }
  function iso(d){ return d || ''; }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  const RX = {
    opp:  /^OPP-\d{6}$/,
    cmpy: /^CMPY-\d{6}$/,
    cont: /^CON-\d{6}$/
  };
  const noopResolver = () => undefined;

  function mount(container, bus, options){
    const opts = options || {};
    const state = {
      rows: [],
      filters: null,
      resolveCompanyName: opts.resolveCompanyName || noopResolver,
      resolveContactName: opts.resolveContactName || noopResolver,
      currency: opts.currency || 'EUR',
      clientList: [],
      isInlineEdit: false
    };

    // ---- trace helper (single channel) ----
    const trace = (topic, payload) => {
      try { bus.emit('opptable.trace', { topic, ...payload }); } catch {}
    };

    // ---- skeleton (no pencil column)
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
    trace('mount.done', { inline: state.isInlineEdit });

    // -------- Filters --------
    function passFilters(row){
      const f = state.filters || {};
      const name  = row['Opportunity.Name'] || row.name || '';
      const client= row['Opportunity.Client'] || row.client || '';
      const owner = row['Opportunity.Owner'] || row.owner || '';
      const notes = row['Opportunity.Notes'] || row.notes || '';
      const nextA = row['Opportunity.NextAction'] || row.nextAction || '';

      if (f.q){
        const hay = `${name} ${client} ${owner} ${notes} ${nextA}`.toLowerCase();
        if (!hay.includes(String(f.q).toLowerCase())) return false;
      }
      if (f.salesStep && (row['Opportunity.SalesStep']||row.salesStep) !== f.salesStep) return false;
      if (f.client){
        const cl = (client||'').toLowerCase();
        if (!cl.includes(f.client.toLowerCase())) return false;
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

    // -------- CSS dump helpers --------
    function getComputedLinkInfo() {
      const sample = tbody.querySelector('.link');
      if (!sample) return { present:false };
      const cs = getComputedStyle(sample);
      return {
        present: true,
        textDecoration: cs.textDecoration,
        borderBottomStyle: cs.borderBottomStyle,
        borderBottomColor: cs.borderBottomColor,
        color: cs.color,
        cursor: cs.cursor,
        pointerEvents: cs.pointerEvents
      };
    }
    function collectMatchingRules() {
      const targets = ['.opps-table .link', '.opps-wrap.inline .link'];
      const res = [];
      for (const sheet of Array.from(document.styleSheets || [])) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; } // CORS-protected
        if (!rules) continue;
        for (const r of Array.from(rules)) {
          if (!r || !r.selectorText) continue;
          if (targets.some(sel => String(r.selectorText).includes(sel))) {
            res.push({ selector: r.selectorText, cssText: r.cssText });
          }
        }
      }
      return res;
    }
    function dumpCSS(reason){
      const computed = getComputedLinkInfo();
      const rules = collectMatchingRules();
      trace('css.dump', {
        reason,
        inlineClass: wrap.classList.contains('inline'),
        computed,
        matchedRulesCount: rules.length,
        matchedRules: rules
      });
    }

    // -------- Render --------
    function render(){
      const rows = (state.rows || []).filter(passFilters);
      trace('render.start', { inline: state.isInlineEdit, total: (state.rows||[]).length, filtered: rows.length });

      if (!rows.length){
        tbody.innerHTML = `<tr><td class="opps-empty" colspan="11">No opportunities match your filter.</td></tr>`;
        wrap.classList.toggle('inline', !!state.isInlineEdit);
        dumpCSS('after-empty');
        trace('render.done', { inlineClass: wrap.classList.contains('inline') });
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
          // Inline: no navigation, editable inputs (company/contact kept disabled here)
          return `
            <tr data-id="${esc(id)}" class="inline">
              <td><input type="text" value="${esc(name)}" data-field="name" /></td>
              <td><input type="text" value="${esc(step)}" data-field="salesStep" /></td>
              <td><input type="text" value="${esc(client)}" data-field="client" /></td>
              <td><input type="text" value="${esc(owner)}" data-field="owner" /></td>
              <td><input type="text" value="${esc(companyName)}" data-field="companyName" disabled /></td>
              <td><input type="text" value="${esc(contactName)}" data-field="contactName" disabled /></td>
<td>
  <textarea data-field="notes" rows="3" style="width:100%;max-width:50ch;">${esc(notes)}</textarea>
</td>
<td>
  <textarea data-field="nextAction" rows="3" style="width:100%;max-width:40ch;">${esc(nextAct)}</textarea>
</td>
<td><input type="date" value="${esc(iso(nextActDt))}" data-field="nextActionDate" /></td>
              <td><input type="date" value="${esc(iso(closingDt))}" data-field="closingDate" /></td>
              <td><input type="number" step="0.01" value="${esc(closingVal||'')}" data-field="closingValue" /></td>
            </tr>
          `;
        }

        // Read-only: name/company/contact are links
        return `
          <tr data-id="${esc(id)}">
            <td><span class="link" data-act="opportunity" title="Open opportunity">${esc(name)}</span></td>
            <td>${esc(step)}</td>
            <td>${esc(client)}</td>
            <td>${esc(owner)}</td>
            <td>
              <span class="link" data-act="company" title="Open company">${esc(companyName)}</span>
              ${isClient ? '<span class="mini" style="color:#16a34a;font-weight:600;margin-left:6px;">Client</span>' : ''}
            </td>
            <td><span class="link" data-act="contact" title="Open contact">${esc(contactName)}</span></td>
            <td>${esc(notes)}</td>
            <td>${esc(nextAct)}</td>
            <td>${esc(iso(nextActDt))}</td>
            <td>${esc(iso(closingDt))}</td>
            <td>${esc(fmtMoney(closingVal, state.currency))}</td>
          </tr>
        `;
      }).join('');

      // CSS hook for disabling links in inline mode
      wrap.classList.toggle('inline', !!state.isInlineEdit);

      dumpCSS('after-render');
      trace('render.done', { inlineClass: wrap.classList.contains('inline') });
    }

    // -------- Row click behavior --------
    tbody.addEventListener('click', (e)=>{
      const tr = e.target.closest('tr');
      if (!tr) return;
      if (state.isInlineEdit) { trace('click.blocked_inline'); return; } // navigation disabled in inline

      const id  = tr.getAttribute('data-id');
      const act = e.target.getAttribute && e.target.getAttribute('data-act');

      if (act === 'opportunity'){
        trace('open.dialog.opportunity', { id });
        bus.emit('dialogs.open.opportunity', { id });
        return;
      }
      if (act === 'company'){
        const row = (state.rows || []).find(x => (x.id||x['Opportunity.ID']) === id);
        const companyId = row && (row.companyId || row['Opportunity.CompanyID']);
        if (companyId && RX.cmpy.test(companyId)) {
          trace('open.dialog.company', { companyId });
          bus.emit('dialogs.open.company', { companyId });
        }
        return;
      }
      if (act === 'contact'){
