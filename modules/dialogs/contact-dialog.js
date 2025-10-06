// modules/dialogs/contact-dialog.js
import { el, rowKV } from './dom-helpers.js';

/**
 * - contact: { id, companyId, firstName, lastName, email, phone, jobTitle, address* } | undefined
 * - name: string (fallback display)
 */
export function renderContactDialog({ contactId, resolveContactName, getContactById }) {
  const name = (contactId && resolveContactName(contactId)) || contactId || '(unknown)';
  const contact = (typeof getContactById === 'function') ? getContactById(contactId) : undefined;

  const dlg = el('dialog', { class: 'crm-dialog', 'aria-label': `Contact ${name}` });
  dlg.addEventListener('cancel', e => e.preventDefault());

  const hdr = el('header', {}, [ el('h3', { text: `Contact – ${name}` }) ]);

  const address = [
    (contact?.addressStreet||''), 
    (contact?.addressCity||''), 
    (contact?.addressPostalCode||''), 
    (contact?.addressCountry||'')
  ].filter(Boolean).join(', ');

  const info = el('div', { class:'crm-meta' }, [
    rowKV('Contact ID', contact?.id || contactId || ''),
    rowKV('Company ID', contact?.companyId || ''),
    rowKV('First name', contact?.firstName || ''),
    rowKV('Last name', contact?.lastName || ''),
    rowKV('Email', contact?.email || ''),
    rowKV('Phone', contact?.phone || ''),
    rowKV('Job title', contact?.jobTitle || ''),
    rowKV('Address', address)
  ]);

  const actions = el('menu', {}, [
    el('button', { class: 'crm-btn', 'data-role': 'close' }, [document.createTextNode('Close')])
  ]);

  dlg.append(hdr, info, actions);
  return dlg;
}
