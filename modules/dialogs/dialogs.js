// modules/dialogs/dialogs.js
// 05 — Dialogs (Opportunity / Company / Contact)
// Stackable popups that emit/consume events via the provided bus.
// Requires: a `bus` object with { on, emit } API (see modules/event-bus/bus.js)
//
// Public API:
//   const dialogs = mountDialogs({
//     container: HTMLElement,
//     bus,
//     resolvers: {
//       resolveCompanyName(id): string|undefined,
//       resolveContactName(id): string|undefined,
//       getContactsByCompanyId(id): Array<{id:string, displayName:string}>,
//       getCompanyIdByContactId(contactId): string|undefined,
//     }
//   });
//   dialogs.open('opportunity' | 'company' | 'contact', payload);
//   dialogs.closeTop();
//
// Consumed events:
//   dialogs.open.opportunity { id?:string, draft?:OpportunityDraft }
//   dialogs.open.company { companyId:string }
//   dialogs.open.contact { contactId:string }
//   opps.validate.result { ok:boolean, errors?:FieldError[] }
//   opps.save.result { ok:boolean, id?:string, errors?:string[] }
//
// Emitted events:
//   opps.validate.request { draft: OpportunityDraft }
//   opps.save.request { draft: OpportunityDraft }
//   dialogs.close { target:'opportunity'|'company'|'contact' }
//
// Types (hint):
//   OpportunityDraft = { id?:string, name?:string, salesStep?:string, client?:string,
//                        owner?:string, companyId?:string, contactId?:string,
//                        notes?:string, nextAction?:string, nextActionDate?:string,
//                        closingDate?:string, closingValue?:number }

export function mountDialogs({ container, bus, resolvers = {} }){
  if (!container) throw new Error('mountDialogs: container is required');
  if (!bus) throw new Error('mountDialogs: bus is required');

  const stack = []; // { type, el, destroy, ctx }
  const $ = (sel, root = document) => root.querySelector(sel);

  // Helpers to create elements
  function el(tag, attrs = {}, children = []){
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    for (const c of children){
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function showDialog(root){
    if (root.showModal) root.showModal();
    else root.setAttribute('open', ''); // fallback
  }
  function closeDialog(root){
    if (root.close) root.close();
    else root.removeAttribute('open');
  }

  // ========= Opportunity Dialog =========
  function createOpportunityDialog(draft = {}){
    const dlg = el('dialog', { class: 'dlg dlg-opportunity', 'aria-label': 'Opportunity dialog' });
    const title = el('h3', {}, ['Opportunity']);
    const name = inputRow('Name', 'name', draft.name || '');
    const salesStep = selectRow('Sales step', 'salesStep', draft.salesStep || '', [
      '', 'Discovery','Qualified','Solution selling','Negotiation','Closing','Won','Lost'
    ]);
    const client = inputRow('Client', 'client', draft.client || '');
    const owner = inputRow('Owner', 'owner', draft.owner || '');
    const companyId = inputRow('Company ID', 'companyId', draft.companyId || '');
    const companyResolvedName = resolvers.resolveCompanyName?.(companyId.input.value) || '';
    const companyResolved = el('div', { class: 'resolved' }, [ companyResolvedName ? `Company: ${companyResolvedName}` : '' ]);
    companyResolved.classList.add('linkish');
    companyResolved.addEventListener('click', () => {
      const cid = companyId.input.value.trim();
      if (cid) bus.emit('dialogs.open.company', { companyId: cid });
    });

    const contactId = inputRow('Contact ID', 'contactId', draft.contactId || '');
    const contactResolvedName = resolvers.resolveContactName?.(contactId.input.value) || '';
    const contactResolved = el('div', { class: 'resolved' }, [ contactResolvedName ? `Contact: ${contactResolvedName}` : '' ]);
    contactResolved.classList.add('linkish');
    contactResolved.addEventListener('click', () => {
      const ct = contactId.input.value.trim();
      if (ct) bus.emit('dialogs.open.contact', { contactId: ct });
    });

    const notes = textRow('Notes', 'notes', draft.notes || '');
    const nextAction = inputRow('Next actions', 'nextAction', draft.nextAction || '');
    const nextActionDate = inputRow('Next action date (YYYY-MM-DD)', 'nextActionDate', draft.nextActionDate || '');
    const closingDate = inputRow('Closing date (YYYY-MM-DD)', 'closingDate', draft.closingDate || '');
    const closingValue = inputRow('Closing value (€)', 'closingValue', draft.closingValue != null ? String(draft.closingValue) : '');

    const errors = el('div', { class: 'errors', role: 'alert' }, []);

    const actions = el('menu', { class: 'actions' }, [
      el('button', { class: 'btn', onClick: () => { destroy(); } }, ['Cancel']),
      el('button', { class: 'btn primary', onClick: onSave }, ['Save']),
    ]);

    const wrapper = el('form', { method: 'dialog', class: 'form-grid' }, [
      title,
      name.row, salesStep.row,
      client.row, owner.row,
      companyId.row, companyResolved,
      contactId.row, contactResolved,
      notes.row,
      nextAction.row, nextActionDate.row,
      closingDate.row, closingValue.row,
      errors,
      actions
    ]);

    dlg.appendChild(wrapper);

    function readDraft(){
      return {
        id: draft.id, // keep if any
        name: name.input.value.trim(),
        salesStep: salesStep.select.value,
        client: client.input.value.trim(),
        owner: owner.input.value.trim(),
        companyId: companyId.input.value.trim() || undefined,
        contactId: contactId.input.value.trim() || undefined,
        notes: notes.textarea.value.trim() || undefined,
        nextAction: nextAction.input.value.trim() || undefined,
        nextActionDate: nextActionDate.input.value.trim() || undefined,
        closingDate: closingDate.input.value.trim() || undefined,
        closingValue: parseFloat(closingValue.input.value || '0') || 0
      };
    }

    function setFieldErrors(fieldErrors = []){
      errors.textContent = '';
      const map = new Map(fieldErrors.map(e => [e.field, e.message]));
      [name, salesStep, client, owner, companyId, contactId, notes, nextAction, nextActionDate, closingDate, closingValue]
        .forEach(ctrl => {
          ctrl.row.classList.remove('has-error');
          const msg = map.get(ctrl.name);
          if (msg){
            ctrl.row.classList.add('has-error');
            const small = el('small', { class: 'err-msg' }, [msg]);
            ctrl.row.appendChild(small);
          }
        });
      if (fieldErrors.length){
        const list = el('ul', {}, fieldErrors.map(e => el('li', {}, [`${e.field}: ${e.message}`])));
        errors.appendChild(list);
      }
    }

    function onSave(ev){
      ev?.preventDefault();
      const d = readDraft();
      // 1) ask for validation
      bus.emit('opps.validate.request', { draft: d });
      // The dialog listens for 'opps.validate.result' to proceed (or show errors)
      // If OK, it then emits 'opps.save.request'.
      // See global listeners at mount time below.
    }

    function destroy(){
      closeDialog(dlg);
      dlg.remove();
      bus.emit('dialogs.close', { target: 'opportunity' });
    }

    return { root: dlg, destroy, type: 'opportunity', ctx: { setFieldErrors, readDraft, onSave, updateResolvedNames } };

    function updateResolvedNames(){
      const compName = resolvers.resolveCompanyName?.(companyId.input.value.trim());
      companyResolved.textContent = compName ? `Company: ${compName}` : '';
      const ctName = resolvers.resolveContactName?.(contactId.input.value.trim());
      contactResolved.textContent = ctName ? `Contact: ${ctName}` : '';
    }
  }

  // ========= Company Dialog =========
  function createCompanyDialog(companyId){
    const dlg = el('dialog', { class: 'dlg dlg-company', 'aria-label': 'Company dialog' });
    const title = el('h3', {}, ['Company']);
    const resolved = resolvers.resolveCompanyName?.(companyId) || companyId;
    const header = el('div', { class: 'info' }, [`${resolved}`]);
    const listTitle = el('h4', {}, ['Contacts']);
    const contacts = resolvers.getContactsByCompanyId?.(companyId) || [];
    const ul = el('ul', { class: 'list' }, contacts.map(c => {
      const li = el('li', {}, [c.displayName || c.id]);
      li.classList.add('linkish');
      li.addEventListener('click', () => bus.emit('dialogs.open.contact', { contactId: c.id }));
      return li;
    }));

    const actions = el('menu', { class: 'actions' }, [
      el('button', { class: 'btn', onClick: () => destroy() }, ['Close']),
    ]);

    const wrapper = el('div', { class: 'company-wrapper' }, [title, header, listTitle, ul, actions]);
    dlg.appendChild(wrapper);

    function destroy(){
      closeDialog(dlg);
      dlg.remove();
      bus.emit('dialogs.close', { target: 'company' });
    }
    return { root: dlg, destroy, type: 'company', ctx: {} };
  }

  // ========= Contact Dialog =========
  function createContactDialog(contactId){
    const dlg = el('dialog', { class: 'dlg dlg-contact', 'aria-label': 'Contact dialog' });
    const title = el('h3', {}, ['Contact']);
    const resolved = resolvers.resolveContactName?.(contactId) || contactId;
    const header = el('div', { class: 'info' }, [`${resolved}`]);

    // Associated company
    const companyId = resolvers.getCompanyIdByContactId?.(contactId);
    const compName = companyId ? (resolvers.resolveCompanyName?.(companyId) || companyId) : '';
    const assoc = el('div', { class: 'assoc linkish' }, [ compName ? `Company: ${compName}` : '' ]);
    if (companyId){
      assoc.addEventListener('click', () => bus.emit('dialogs.open.company', { companyId }));
    }

    const actions = el('menu', { class: 'actions' }, [
      el('button', { class: 'btn', onClick: () => destroy() }, ['Close']),
    ]);

    const wrapper = el('div', { class: 'contact-wrapper' }, [title, header, assoc, actions]);
    dlg.appendChild(wrapper);

    function destroy(){
      closeDialog(dlg);
      dlg.remove();
      bus.emit('dialogs.close', { target: 'contact' });
    }
    return { root: dlg, destroy, type: 'contact', ctx: {} };
  }

  // ========= Small field builders =========
  function inputRow(label, name, value){
    const row = el('label', { class: 'row' }, [
      el('span', { class: 'lbl' }, [label]),
      (() => {
        const input = el('input', { type: 'text', name, value });
        return input;
      })()
    ]);
    const input = row.querySelector('input');
    return { row, input, name };
  }
  function textRow(label, name, value){
    const row = el('label', { class: 'row' }, [
      el('span', { class: 'lbl' }, [label]),
      (() => {
        const ta = el('textarea', { name }, [value || '']);
        return ta;
      })()
    ]);
    const textarea = row.querySelector('textarea');
    return { row, textarea, name };
  }
  function selectRow(label, name, selected, options){
    const row = el('label', { class: 'row' }, [
      el('span', { class: 'lbl' }, [label]),
      (() => {
        const sel = el('select', { name });
        options.forEach(v => {
          const opt = el('option', { value: v }, [v]);
          if (v === selected) opt.selected = true;
          sel.appendChild(opt);
        });
        return sel;
      })()
    ]);
    const select = row.querySelector('select');
    return { row, select, name };
  }

  // ========= Public API =========
  function open(type, payload){
    let inst;
    if (type === 'opportunity'){
      inst = createOpportunityDialog(payload?.draft || {});
    } else if (type === 'company'){
      inst = createCompanyDialog(payload.companyId);
    } else if (type === 'contact'){
      inst = createContactDialog(payload.contactId);
    } else {
      throw new Error('Unknown dialog type: ' + type);
    }
    container.appendChild(inst.root);
    stack.push(inst);
    showDialog(inst.root);
    return inst;
  }

  function closeTop(){
    const inst = stack.pop();
    if (inst){ inst.destroy(); }
  }

  // Listen to global events → open dialogs
  const off = [
    bus.on('dialogs.open.opportunity', ({ id, draft }={}) => {
      // In a full app, if id exists, we'd fetch and pass draft. Here, we use provided draft.
      open('opportunity', { draft: draft || { id } });
    }),
    bus.on('dialogs.open.company', ({ companyId }) => open('company', { companyId })),
    bus.on('dialogs.open.contact', ({ contactId }) => open('contact', { contactId })),

    // Validation result handling for the top-most opportunity dialog
    bus.on('opps.validate.result', ({ ok, errors }={}) => {
      const inst = stack[stack.length - 1];
      if (!inst || inst.type !== 'opportunity') return;
      if (!ok){
        inst.ctx.setFieldErrors(errors || []);
      } else {
        // proceed to save
        const draft = inst.ctx.readDraft();
        bus.emit('opps.save.request', { draft });
      }
    }),

    // Save result handling
    bus.on('opps.save.result', ({ ok, id, errors }={}) => {
      const inst = stack[stack.length - 1];
      if (!inst || inst.type !== 'opportunity') return;
      if (ok){
        inst.destroy();
      } else {
        inst.ctx.setFieldErrors((errors || []).map((m, i) => ({ field: 'name', code: 'save_error_' + i, message: m })));
      }
    }),
  ];

  // Basic styles (scoped suggestion – you can move to CSS file)
  const style = document.createElement('style');
  style.textContent = `
    .dlg { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; max-width: 720px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .form-grid h3 { grid-column: 1 / -1; margin: 0 0 6px 0; }
    .row { display:flex; flex-direction: column; gap: 4px; }
    .lbl { font-size: 12px; color: #617387; }
    .actions { display:flex; justify-content: flex-end; gap: 8px; grid-column: 1 / -1; }
    .btn { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; background: #fff; cursor: pointer; }
    .btn.primary { background: #1e6091; color: #fff; border-color: #1e6091; }
    .errors { grid-column: 1 / -1; color: #c92a2a; }
    .has-error { outline: 1px solid #c92a2a33; border-radius: 6px; padding: 4px; }
    .err-msg { color: #c92a2a; font-size: 12px; }
    .company-wrapper, .contact-wrapper { display:flex; flex-direction: column; gap: 8px; }
    .list { margin: 0; padding-left: 18px; }
    .linkish { cursor: pointer; text-decoration: underline; }
  `;
  container.appendChild(style);

  return { open, closeTop };
}
