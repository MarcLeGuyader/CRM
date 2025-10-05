// modules/dialogs/dialogs.js
// Stackable dialogs: Opportunity / Company / Contact
// Depends on an external Event Bus providing { on, emit }.
// Public API: mountDialogs({ bus, resolveCompanyName, resolveContactName, listContactsByCompany, getOpportunityById })

/**
 * @typedef {Object} Opportunity
 * @property {string} id
 * @property {string} name
 * @property {string} salesStep
 * @property {string} client
 * @property {string} owner
 * @property {string=} companyId
 * @property {string=} contactId
 * @property {string=} notes
 * @property {string=} nextAction
 * @property {string=} nextActionDate
 * @property {string=} closingDate
 * @property {number=} closingValue
 */

/** @typedef {Partial<Opportunity> & { id?: string }} OpportunityDraft */

export function mountDialogs(deps) {
  const {
    bus,
    resolveCompanyName,
    resolveContactName,
    listContactsByCompany,
    getOpportunityById
  } = deps || {};

  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') {
    throw new Error('[dialogs] Missing or invalid bus');
  }
  ['resolveCompanyName','resolveContactName','listContactsByCompany','getOpportunityById'].forEach(k=>{
    if (typeof deps[k] !== 'function') throw new Error(`[dialogs] Missing dependency function: ${k}`);
  });

  // container + stack
  const host = document.createElement('div');
  host.className = 'crm-dialogs-backdrop';
  document.body.appendChild(host);

  /** @type {{type:'opportunity'|'company'|'contact', dialog:HTMLDialogElement, requestId?:string }[]} */
  const stack = [];

  // --- event wiring
  const off = [];
  off.push(bus.on('dialogs.open.opportunity', ({ id } = {}) => open('opportunity', { id })));
  off.push(bus.on('dialogs.open.company', ({ companyId }) => open('company', { companyId })));
  off.push(bus.on('dialogs.open.contact', ({ contactId }) => open('contact', { contactId })));

  off.push(bus.on('opps.validate.result', (res) => {
    // Match only top dialog request
    const top = stack[stack.length - 1];
    if (!top || top.type !== 'opportunity') return;
    if (!res || res.requestId !== top.requestId) return;
    const dlg = top.dialog;
    const box = dlg.querySelector('.crm-errors');
    box.textContent = '';
    if (!res.ok) {
      // show errors
      if (Array.isArray(res.errors) && res.errors.length) {
        box.textContent = res.errors.map(e => `${e.field}: ${e.message}`).join('\n');
      } else {
        box.textContent = 'Validation failed (unknown error).';
      }
      setButtonsDisabled(dlg, false);
    } else {
      // proceed to save request
      const draft = collectDraftFromForm(dlg);
      const requestId = top.requestId || makeId();
      top.requestId = requestId;
      bus.emit('opps.save.request', { requestId, draft });
    }
  }));

  off.push(bus.on('opps.save.result', (res) => {
    const top = stack[stack.length - 1];
    if (!top || top.type !== 'opportunity') return;
    if (!res || res.requestId !== top.requestId) return;
    const dlg = top.dialog;
    const box = dlg.querySelector('.crm-errors');
    box.textContent = '';
    setButtonsDisabled(dlg, false);
    if (!res.ok) {
      box.textContent = (res.errors && res.errors.join('\n')) || 'Save failed.';
      return;
    }
    // success: close dialog
    closeTop();
  }));

  // --- API
  function open(type, payload) {
    if (type === 'opportunity') {
      const dlg = renderOpportunityDialog(payload && payload.id);
      pushDialog('opportunity', dlg);
    } else if (type === 'company') {
      const dlg = renderCompanyDialog(payload.companyId);
      pushDialog('company', dlg);
    } else if (type === 'contact') {
      const dlg = renderContactDialog(payload.contactId);
      pushDialog('contact', dlg);
    } else {
      throw new Error('Unknown dialog type: ' + type);
    }
  }

  function pushDialog(type, dlg) {
    host.appendChild(dlg);
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute('open', '');
    stack.push({ type, dialog: dlg });
  }

  function closeTop() {
    const top = stack.pop();
    if (!top) return;
    try { top.dialog.close(); } catch {}
    top.dialog.remove();
    bus.emit('dialogs.close', { target: top.type });
  }

  // --- helpers
  function makeId() { return 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  function setButtonsDisabled(dlg, disabled) {
    dlg.querySelectorAll('button').forEach(b => { if (b.dataset.role) b.disabled = disabled; });
  }

  function collectDraftFromForm(dlg) {
    /** @type {OpportunityDraft} */
    const d = {};
    const get = sel => (dlg.querySelector(sel)?.value || '').trim();
    d.id = get('input[name="id"]') || undefined;
    d.name = get('input[name="name"]');
    d.salesStep = get('select[name="salesStep"]');
    d.client = get('input[name="client"]');
    d.owner = get('input[name="owner"]');
    d.companyId = get('input[name="companyId"]') || undefined;
    d.contactId = get('input[name="contactId"]') || undefined;
    d.notes = get('textarea[name="notes"]') || undefined;
    d.nextAction = get('input[name="nextAction"]') || undefined;
    d.nextActionDate = get('input[name="nextActionDate"]') || undefined;
    d.closingDate = get('input[name="closingDate"]') || undefined;
    const cv = get('input[name="closingValue"]');
    d.closingValue = cv ? Number(cv) : undefined;
    return d;
  }

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    children.forEach(c => e.appendChild(c));
    return e;
  }

  function link(text, onclick) {
    return el('span', { class: 'crm-link', role: 'button', onClick: onclick, tabIndex: 0 }, [document.createTextNode(text)]);
  }

  function renderOpportunityDialog(id) {
    /** @type {Opportunity|null} */
    const row = id ? (getOpportunityById(id) || null) : null;
    const title = row ? `Edit Opportunity ${row.name || row.id}` : 'New Opportunity';

    const dlg = el('dialog', { class: 'crm-dialog', 'aria-label': title });
    const hdr = el('header', {}, [
      el('h3', { text: title }),
    ]);

    const companyName = row?.companyId ? (resolveCompanyName(row.companyId) || row.companyId) : '(none)';
    const contactName = row?.contactId ? (resolveContactName(row.contactId) || row.contactId) : '(none)';

    const grid = el('div', { class: 'grid2' }, [
      wrap('ID', el('input', { name: 'id', value: row?.id || '', readOnly: true })),
      wrap('Name', el('input', { name: 'name', value: row?.name || '' })),
      wrap('Sales step', selectStep(row?.salesStep || 'Discovery')),
      wrap('Client', el('input', { name: 'client', value: row?.client || '' })),
      wrap('Owner', el('input', { name: 'owner', value: row?.owner || '' })),
      wrap('Company ID', el('input', { name: 'companyId', value: row?.companyId || '' })),
      wrap('Company Name', el('div', {}, [ link(companyName, () => open('company', { companyId: (row?.companyId||'').trim() })) ])),
      wrap('Contact ID', el('input', { name: 'contactId', value: row?.contactId || '' })),
      wrap('Contact Name', el('div', {}, [ link(contactName, () => open('contact', { contactId: (row?.contactId||'').trim() })) ])),
      wrap('Notes', el('textarea', { name: 'notes' }, [])),
      wrap('Next actions', el('input', { name: 'nextAction', value: row?.nextAction || '' })),
      wrap('Next action date', el('input', { name: 'nextActionDate', type: 'date', value: row?.nextActionDate || '' })),
      wrap('Closing date', el('input', { name: 'closingDate', type: 'date', value: row?.closingDate || '' })),
      wrap('Closing value (€)', el('input', { name: 'closingValue', type: 'number', step: '0.01', value: (row?.closingValue ?? '').toString() })),
    ]);

    const errors = el('pre', { class: 'crm-errors' });
    const actions = el('menu', {}, [
      el('button', { class: 'crm-btn', 'data-role': 'cancel', onClick: (e)=>{ e.preventDefault(); closeTop(); } }, [document.createTextNode('Cancel')]),
      el('button', { class: 'crm-btn primary', 'data-role': 'save', onClick: (e)=>{
        e.preventDefault();
        setButtonsDisabled(dlg, true);
        const draft = collectDraftFromForm(dlg);
        const requestId = makeId();
        // keep on stack top for correlation
        const top = stack[stack.length-1];
        if (top) top.requestId = requestId;
        bus.emit('opps.validate.request', { requestId, draft });
      }}, [document.createTextNode('Save')])
    ]);

    dlg.append(hdr, grid, errors, actions);
    return dlg;
  }

  function wrap(labelText, inputEl) {
    const lab = el('label', {}, [
      document.createTextNode(labelText),
      inputEl
    ]);
    return lab;
  }

  function selectStep(current) {
    const steps = ['Discovery','Qualified','Solution selling','Negotiation','Closing','Won','Lost'];
    const sel = el('select', { name: 'salesStep' });
    steps.forEach(s => {
      const opt = el('option', { value: s, text: s });
      if (s === current) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function renderCompanyDialog(companyId) {
    const name = (companyId && resolveCompanyName(companyId)) || companyId || '(unknown)';
    const contacts = companyId ? (listContactsByCompany(companyId) || []) : [];

    const dlg = el('dialog', { class: 'crm-dialog', 'aria-label': `Company ${name}` });
    const hdr = el('header', {}, [ el('h3', { text: `Company – ${name}` }) ]);

    const list = el('div', {}, [
      el('p', { text: 'Contacts:' }),
      el('ul', {}, contacts.map(c => el('li', {}, [
        link(c.displayName || c.id, () => open('contact', { contactId: c.id }))
      ])))
    ]);

    const actions = el('menu', {}, [
      el('button', { class: 'crm-btn', 'data-role': 'close', onClick: (e)=>{ e.preventDefault(); closeTop(); } }, [document.createTextNode('Close')])
    ]);

    dlg.append(hdr, list, actions);
    return dlg;
  }

  function renderContactDialog(contactId) {
    const name = (contactId && resolveContactName(contactId)) || contactId || '(unknown)';

    const dlg = el('dialog', { class: 'crm-dialog', 'aria-label': `Contact ${name}` });
    const hdr = el('header', {}, [ el('h3', { text: `Contact – ${name}` }) ]);

    // We don't have a direct resolver for contact→company, keep it simple:
    const info = el('div', {}, [
      el('p', { text: `Contact ID: ${contactId || '(none)'}` }),
      el('p', {}, [document.createTextNode('Company: '), link('Open company (enter ID in Opportunity dialog)', ()=>{})])
    ]);

    const actions = el('menu', {}, [
      el('button', { class: 'crm-btn', 'data-role': 'close', onClick: (e)=>{ e.preventDefault(); closeTop(); } }, [document.createTextNode('Close')])
    ]);

    dlg.append(hdr, info, actions);
    return dlg;
  }

  return {
    open,
    closeTop,
    destroy() {
      off.forEach(fn => { try { fn(); } catch {} });
      while (stack.length) closeTop();
      host.remove();
    }
  };
}