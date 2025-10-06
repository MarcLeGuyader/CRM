// modules/dialogs/dialogs.js
// Orchestration: pile de dialogs, host, wiring bus, open/close, save/validate
import { el, makeReqId } from './dom-helpers.js';
import { renderOpportunityDialog, collectOpportunityDraftFromForm } from './opportunity-dialog.js';
import { renderCompanyDialog } from './company-dialog.js';
import { renderContactDialog } from './contact-dialog.js';

export function mountDialogs(deps) {
  const {
    bus,
    resolveCompanyName,
    resolveContactName,
    listContactsByCompany,
    getOpportunityById,
    getSalesSteps,      // optional
    getCompanyById,     // optional
    getContactById      // optional
  } = deps || {};

  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') {
    throw new Error('[dialogs] Missing or invalid bus');
  }
  ['resolveCompanyName','resolveContactName','listContactsByCompany','getOpportunityById'].forEach(k=>{
    if (typeof deps[k] !== 'function') throw new Error(`[dialogs] Missing dependency function: ${k}`);
  });

  // Backdrop host
  const host = document.createElement('div');
  host.className = 'crm-dialogs-backdrop';
  document.body.appendChild(host);

  /** @type {{type:'opportunity'|'company'|'contact', dialog:HTMLDialogElement, requestId?:string }[]} */
  const stack = [];

  // Close on backdrop click (only if click on exact backdrop, not inside dialog)
  host.addEventListener('click', (e)=>{
    if (e.target === host) closeTop();
  });

  // Esc closes top
  document.addEventListener('keydown', onKey);
  function onKey(e){
    if (e.key === 'Escape' && stack.length) closeTop();
  }

  // Wire bus
  const off = [];
  off.push(bus.on('dialogs.open.opportunity', ({ id } = {}) => open('opportunity', { id })));
  off.push(bus.on('dialogs.open.company', ({ companyId }) => open('company', { companyId })));
  off.push(bus.on('dialogs.open.contact', ({ contactId }) => open('contact', { contactId })));

  off.push(bus.on('opps.validate.result', (res) => {
    const top = stack[stack.length - 1];
    if (!top || top.type !== 'opportunity') return;
    if (!res || res.requestId !== top.requestId) return;

    const dlg = top.dialog;
    const box = dlg.querySelector('.crm-errors');
    if (box) box.textContent = '';

    if (!res.ok) {
      if (Array.isArray(res.errors) && res.errors.length) {
        box.textContent = res.errors.map(e => `${e.field}: ${e.message}`).join('\n');
      } else {
        box.textContent = 'Validation failed (unknown error).';
      }
      setButtonsDisabled(dlg, false);
    } else {
      // OK → save
      const draft = collectOpportunityDraftFromForm(dlg);
      const reqId = top.requestId || makeReqId();
      top.requestId = reqId;
      bus.emit('opps.save.request', { requestId: reqId, draft });
    }
  }));

  off.push(bus.on('opps.save.result', (res) => {
    const top = stack[stack.length - 1];
    if (!top || top.type !== 'opportunity') return;
    if (!res || res.requestId !== top.requestId) return;

    const dlg = top.dialog;
    const box = dlg.querySelector('.crm-errors');
    if (box) box.textContent = '';
    setButtonsDisabled(dlg, false);

    if (!res.ok) {
      box.textContent = (res.errors && res.errors.join('\n')) || 'Save failed.';
      return;
    }
    closeTop();
  }));

  // API
  function open(type, payload) {
    let dlg;
    if (type === 'opportunity') {
      dlg = renderOpportunityDialog({
        id: payload?.id,
        getOpportunityById,
        resolveCompanyName,
        resolveContactName,
        getSalesSteps,
        openCompany: (companyId)=> companyId && open('company', { companyId }),
        openContact: (contactId)=> contactId && open('contact', { contactId })
      });
      wireOppButtons(dlg);
      pushDialog('opportunity', dlg);
    } else if (type === 'company') {
      dlg = renderCompanyDialog({
        companyId: payload?.companyId,
        resolveCompanyName,
        listContactsByCompany,
        getCompanyById,
        openContact: (contactId)=> contactId && open('contact', { contactId })
      });
      wireCloseButton(dlg);
      pushDialog('company', dlg);
    } else if (type === 'contact') {
      dlg = renderContactDialog({
        contactId: payload?.contactId,
        resolveContactName,
        getContactById
      });
      wireCloseButton(dlg);
      pushDialog('contact', dlg);
    } else {
      throw new Error('Unknown dialog type: ' + type);
    }
  }

  function wireOppButtons(dlg){
    dlg.querySelector('[data-role="cancel"]')?.addEventListener('click', (e)=>{ e.preventDefault(); closeTop(); });
    dlg.querySelector('[data-role="save"]')?.addEventListener('click', (e)=>{
      e.preventDefault();
      setButtonsDisabled(dlg, true);
      const draft = collectOpportunityDraftFromForm(dlg);
      const reqId = makeReqId();
      const top = stack[stack.length-1];
      if (top) top.requestId = reqId;
      bus.emit('opps.validate.request', { requestId: reqId, draft });
    });
  }

  function wireCloseButton(dlg){
    dlg.querySelector('[data-role="close"]')?.addEventListener('click', (e)=>{ e.preventDefault(); closeTop(); });
  }

  function pushDialog(type, dlg) {
    host.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    stack.push({ type, dialog: dlg });
  }

  function closeTop() {
    const top = stack.pop();
    if (!top) return;
    try { top.dialog.close(); } catch {}
    top.dialog.remove();
    bus.emit('dialogs.close', { target: top.type });
    if (!stack.length) host.classList.remove('active');
  }

  function setButtonsDisabled(dlg, disabled) {
    dlg.querySelectorAll('button').forEach(b => { if (b.dataset.role) b.disabled = disabled; });
  }

  // expose minimal API
  return {
    open,
    closeTop,
    destroy(){
      off.forEach(off => { try{ off(); }catch{} });
      document.removeEventListener('keydown', onKey);
      while (stack.length) closeTop();
      host.remove();
    }
  };
}
