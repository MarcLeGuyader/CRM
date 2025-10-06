// modules/dialogs/company-dialog.js
import { el, link, rowKV } from './dom-helpers.js';

/**
 * - company: { id,name,isClient,hqCountry,website,type,mainSegment,description } | undefined
 * - contacts: [{id,displayName}] (peut être vide)
 */
export function renderCompanyDialog({ companyId, resolveCompanyName, listContactsByCompany, getCompanyById, openContact }) {
  const name = (companyId && resolveCompanyName(companyId)) || companyId || '(unknown)';
  const contacts = companyId ? (listContactsByCompany(companyId) || []) : [];
  const company = (typeof getCompanyById === 'function') ? getCompanyById(companyId) : undefined;

  const dlg = el('dialog', { class: 'crm-dialog', 'aria-label': `Company ${name}` });
  dlg.addEventListener('cancel', e => e.preventDefault());

  const hdr = el('header', {}, [
    el('h3', { text: `Company – ${name}` }),
    company
      ? (company.isClient ? el('span', { class:'badge badge-client', text:'Client' }) : el('span', { class:'badge badge-nonclient', text:'Prospect' }))
      : el('span', { class:'badge badge-nonclient', text:'Prospect' })
  ]);

  const meta = el('div', { class:'crm-meta' }, [
    rowKV('Company ID', company?.id || companyId || ''),
    rowKV('HQ Country', company?.hqCountry || ''),
    rowKV('Website', company?.website || ''),
    rowKV('Type', company?.type || ''),
    rowKV('Main segment', company?.mainSegment || ''),
    rowKV('Description', company?.description || '')
  ]);

  const list = el('div', {}, [
    el('p', { text: 'Contacts:' }),
    el('ul', {}, contacts.map(c => el('li', {}, [
      link(c.displayName || c.id, () => openContact(c.id))
    ])))
  ]);

  const actions = el('menu', {}, [
    el('button', { class: 'crm-btn', 'data-role': 'close' }, [document.createTextNode('Close')])
  ]);

  dlg.append(hdr, meta, list, actions);
  return dlg;
}
