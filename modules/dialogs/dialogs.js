// modules/dialogs/dialogs.js
// Public entry point AND orchestrator for all dialogs
// Handles Opportunity, Company, and Contact dialogs safely across platforms (iPad compatible)

import { renderOpportunityDialog } from './opportunity-dialog.js';
import { renderCompanyDialog } from './company-dialog.js';
import { renderContactDialog } from './contact-dialog.js';
import { el, link, wrap } from './dom-helpers.js';

export function mountDialogs(deps) {
  const { bus } = deps || {};
  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function')
    throw new Error('[dialogs] Missing bus');

  // === Root container and dialog stack
  const host = document.createElement('div');
  host.className = 'crm-dialogs-backdrop';
  document.body.appendChild(host);
  const stack = [];

  // === Register event listeners
  bus.on('dialogs.open.opportunity', ({ id }) => safeOpen('opportunity', { id }));
  bus.on('dialogs.open.company', ({ companyId }) => safeOpen('company', { companyId }));
  bus.on('dialogs.open.contact', ({ contactId }) => safeOpen('contact', { contactId }));

  // === Error logger — useful for iPad (no browser console)
  function logError(e, ctx) {
    try {
      console.warn('[dialogs]', ctx, e);
      bus.emit?.('dialogs.error', {
        context: ctx || '',
        message: e?.message || String(e),
        stack: e?.stack || ''
      });
    } catch {}
  }

  // === Safe wrapper around open()
  function safeOpen(type, payload) {
    try {
      open(type, payload);
    } catch (e) {
      logError(e, 'open(' + type + ')');
    }
  }

  // === Open dialog of given type
  function open(type, payload) {
    let dlg;
    if (type === 'opportunity') dlg = renderOpportunityDialog(payload?.id, deps, closeTop);
    else if (type === 'company') dlg = renderCompanyDialog(payload?.companyId, deps, closeTop);
    else if (type === 'contact') dlg = renderContactDialog(payload?.contactId, deps, closeTop);
    else throw new Error('Unknown dialog type: ' + type);

    if (!dlg) throw new Error('Dialog could not be created for type ' + type);

    host.appendChild(dlg);

    // Safari/iPad fallback for <dialog>.showModal()
    try {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    } catch (e) {
      dlg.setAttribute('open', '');
      logError(e, 'showModal fallback');
    }

    stack.push({ type, dialog: dlg });
  }

  // === Close topmost dialog
  function closeTop() {
    const top = stack.pop();
    if (!top) return;
    try { top.dialog.close(); } catch {}
    top.dialog.remove();
    bus.emit('dialogs.close', { target: top.type });
  }

  // === Return API
  return { open, closeTop };
}
