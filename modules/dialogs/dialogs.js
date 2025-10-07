// modules/dialogs/dialogs.js
// Public entry point AND orchestrator for all dialogs
// Very verbose tracing to track iPad/Safari issues with <dialog>.showModal()

import { renderOpportunityDialog } from './opportunity-dialog.js';
import { renderCompanyDialog } from './company-dialog.js';
import { renderContactDialog } from './contact-dialog.js';

export function mountDialogs(deps) {
  const {
    bus,
    // les autres deps existent, mais ici on ne s'en sert pas directement
  } = deps || {};

  // --- tiny local logger that also emits to the bus
  const say = (topic, payload = {}) => {
    try { console.log('[dialogs]', topic, payload); } catch {}
    try { bus?.emit?.('dialogs.trace', { topic, ...payload }); } catch {}
  };
  const boom = (ctx, err) => {
    const pay = { context: ctx, message: err?.message || String(err), stack: err?.stack || '' };
    try { console.warn('[dialogs:ERR]', ctx, err); } catch {}
    try { bus?.emit?.('dialogs.error', pay); } catch {}
  };

  // --- guard bus
  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') {
    const e = new Error('[dialogs] Missing bus');
    boom('mountDialogs(bus)', e);
    throw e;
  }

  say('init.start', { deps: Object.keys(deps || {}) });

  // === Root backdrop and stack
  const host = document.createElement('div');
  host.className = 'crm-dialogs-backdrop';   // CSS: .open => display:flex
  document.body.appendChild(host);
  say('host.appended');

  /** @type {Array<{type:'opportunity'|'company'|'contact', dialog:HTMLDialogElement}>} */
  const stack = [];

  // Backdrop click closes the top dialog (safe on iPad)
  host.addEventListener('click', (ev) => {
    // ne ferme que si l'on clique dans le backdrop, pas à l'intérieur du <dialog>
    if (ev.target === host) {
      say('backdrop.click', { action: 'closeTop' });
      safeCloseTop();
    }
  });

  // Global Escape handler while a dialog is open
  const onKey = (ev) => {
    if (stack.length && ev.key === 'Escape') {
      ev.preventDefault();
      say('key.escape', { action: 'closeTop' });
      safeCloseTop();
    }
  };
  document.addEventListener('keydown', onKey);

  // === Register event listeners
  const u1 = bus.on('dialogs.open.opportunity', (p) => {
    say('evt.received', { evt: 'dialogs.open.opportunity', payload: p });
    safeOpen('opportunity', { id: p?.id });
  });
  const u2 = bus.on('dialogs.open.company', (p) => {
    say('evt.received', { evt: 'dialogs.open.company', payload: p });
    safeOpen('company', { companyId: p?.companyId });
  });
  const u3 = bus.on('dialogs.open.contact', (p) => {
    say('evt.received', { evt: 'dialogs.open.contact', payload: p });
    safeOpen('contact', { contactId: p?.contactId });
  });

  say('init.done');

  // === Safe wrappers
  function safeOpen(type, payload) {
    try { open(type, payload); }
    catch (e) { boom('open(' + type + ')', e); }
  }
  function safeCloseTop() {
    try { closeTop(); }
    catch (e) { boom('closeTop', e); }
  }

  // === Open dialog
  function open(type, payload) {
    say('open.start', { type, payload, stackLen: stack.length });

    let dlg;
    if (type === 'opportunity') dlg = renderOpportunityDialog(payload?.id, deps, safeCloseTop);
    else if (type === 'company') dlg = renderCompanyDialog(payload?.companyId, deps, safeCloseTop);
    else if (type === 'contact') dlg = renderContactDialog(payload?.contactId, deps, safeCloseTop);
    else throw new Error('Unknown dialog type: ' + type);

    if (!dlg) throw new Error('Dialog could not be created for type ' + type);

    // Assure un id utile dans le DOM pour debug visuel
    if (!dlg.id) {
      dlg.id = `dlg-${type}-${Date.now().toString(36)}`;
    }
    say('render.done', { type, dialogId: dlg.id });

    host.appendChild(dlg);
    host.classList.add('open'); // => visible via CSS
    say('host.class.open', { hostHasOpen: host.classList.contains('open') });

    // iPad/Safari: showModal peut throw "NotSupportedError" si pas prêt
    // on tente showModal d'abord, sinon fallback à attribute open
    let usedFallback = false;
    try {
      if (typeof dlg.showModal === 'function') {
        say('showModal.try', { dialogId: dlg.id });
        dlg.showModal();
        say('showModal.ok', { dialogId: dlg.id });
      } else {
        usedFallback = true;
        dlg.setAttribute('open', '');
        say('showModal.absent.fallbackOpenAttr', { dialogId: dlg.id });
      }
    } catch (err) {
      usedFallback = true;
      dlg.setAttribute('open', '');
      boom('showModal.failed -> setAttribute(open)', err);
      say('showModal.fallback.used', { dialogId: dlg.id });
    }

    // focus le 1er input si possible (évite certains gels Safari)
    try {
      const firstInput = dlg.querySelector('input,select,textarea,button');
      firstInput?.focus?.();
    } catch {}

    stack.push({ type, dialog: dlg });
    say('open.done', { type, dialogId: dlg.id, stackLen: stack.length, usedFallback });
  }

  // === Close top dialog
  function closeTop() {
    if (!stack.length) {
      say('closeTop.noop', { reason: 'emptyStack' });
      // en plus, on s'assure d'enlever la classe open si vide
      host.classList.remove('open');
      return;
    }
    const top = stack.pop();
    say('closeTop.start', { type: top.type, dialogId: top.dialog.id, stackLen: stack.length });

    try { top.dialog.close?.(); } catch (e) { boom('dialog.close', e); }
    try { top.dialog.remove(); } catch (e) { boom('dialog.remove', e); }

    // si plus rien, on masque le backdrop
    if (stack.length === 0) {
      host.classList.remove('open');
      say('host.class.removeOpen', { hostHasOpen: host.classList.contains('open') });
    }

    bus.emit('dialogs.close', { target: top.type, dialogId: top.dialog.id, stackLen: stack.length });
    say('closeTop.done', { target: top.type });
  }

  // === Public API (rarement utilisé car on passe par le bus)
  return {
    open: safeOpen,
    closeTop: safeCloseTop,
    destroy() {
      say('destroy.start');
      try { u1?.(); u2?.(); u3?.(); } catch {}
      document.removeEventListener('keydown', onKey);
      while (stack.length) { safeCloseTop(); }
      try { host.remove(); } catch {}
      say('destroy.done');
    }
  };
}
