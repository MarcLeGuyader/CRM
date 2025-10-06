// modules/dialogs/dialogs.js
// Public entry point AND orchestrator for all dialogs

import { renderOpportunityDialog } from './opportunity-dialog.js';
import { renderCompanyDialog } from './company-dialog.js';
import { renderContactDialog } from './contact-dialog.js';
import { el, link, wrap } from './dom-helpers.js';

export function mountDialogs(deps) {
  const { bus } = deps || {};
  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function')
    throw new Error('[dialogs] Missing bus');

  const host = document.createElement('div');
  host.className = 'crm-dialogs-backdrop';
  document.body.appendChild(host);
  const stack = [];

  bus.on('dialogs.open.opportunity', ({ id }) => open('opportunity', { id }));
  bus.on('dialogs.open.company', ({ companyId }) => open('company', { companyId }));
  bus.on('dialogs.open.contact', ({ contactId }) => open('contact', { contactId }));

  function open(type, payload) {
    let dlg;
    if (type === 'opportunity') dlg = renderOpportunityDialog(payload?.id, deps, closeTop);
    else if (type === 'company') dlg = renderCompanyDialog(payload?.companyId, deps, closeTop);
    else if (type === 'contact') dlg = renderContactDialog(payload?.contactId, deps, closeTop);
    else throw new Error('Unknown dialog type: ' + type);

    host.appendChild(dlg);
    dlg.showModal?.() ?? dlg.setAttribute('open', '');
    stack.push({ type, dialog: dlg });
  }

  function closeTop() {
    const top = stack.pop();
    if (!top) return;
    try { top.dialog.close(); } catch {}
    top.dialog.remove();
    bus.emit('dialogs.close', { target: top.type });
  }

  return { open, closeTop };
}
