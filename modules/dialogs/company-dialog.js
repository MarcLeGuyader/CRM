// modules/dialogs/company-dialog.js
// Renders the Company dialog — strict CRM field matching (100%) + clean layout.

export function renderCompanyDialog(companyIdRaw, deps, onClose) {
  const { bus, getCompanyById, listContactsByCompany, resolveContactName } = deps || {};
  const say = (topic, payload = {}) => { try { bus?.emit?.('dialogs.trace', { scope:'company', topic, ...payload }); } catch {} };

  const companyId = (companyIdRaw ?? '').trim();
  say('render.start', { companyId });

  // --- Fetch company and contacts
  const company = typeof getCompanyById === 'function' ? (getCompanyById(companyId) || null) : null;
  const contacts = typeof listContactsByCompany === 'function' ? (listContactsByCompany(companyId) || []) : [];

  // --- Extract strict CRM fields
  const id           = company?.id || companyId || '';
  const name         = company?.name || '(unknown)';
  const hqCountry    = company?.hqCountry || '';
  const website      = company?.website || '';
  const type         = company?.type || '';
  const mainSegment  = company?.mainSegment || '';
  const description  = company?.description || '';
  const isClient     = company?.isClient === true;

  say('company.data', { id, name, isClient, hqCountry, website, type, mainSegment, contactsCount: contacts.length });

  // --- Root dialog
  const dlg = document.createElement('dialog');
  dlg.className = 'crm-dialog';
  dlg.setAttribute('aria-label', `Company ${name}`);
  dlg.id = `dlg-company-${Math.random().toString(36).slice(2, 8)}`;

  // --- Header (title + ID)
  const header = h('header', {}, [
    h('div', { class: 'header-title-block' }, [
      h('h3', { class: isClient ? 'danger' : '', text: `Company – ${name}` }),
      h('div', { class: 'subtitle muted', text: `Company ID: ${id}` })
    ])
  ]);

  // --- Two-column grid
  const grid = h('div', { class: 'grid2' }, [
    rowKV('HQ Country', hqCountry),
    rowKV('Website', website),
    rowKV('Type', type),
    rowKV('Main segment', mainSegment)
  ]);

  // --- Description full width
  const descr = h('div', { class: 'block' }, [
    rowKV('Description', description)
  ]);

  // --- Contacts block
  const contactsBlock = h('div', { class: 'block' }, [
    h('p', { text: 'Contacts:' }),
    contacts.length
      ? h('ul', {}, contacts.map(c => {
          const li = document.createElement('li');
          const label =
            c.displayName ||
            [c.firstName || '', c.lastName || ''].join(' ').trim() ||
            resolveContactName?.(c.id) ||
            c.id;
          const linkEl = h('span', { class: 'crm-link', text: label });
          linkEl.addEventListener('click', () => {
            // empêcher ouverture si un autre dialog est ouvert
            say('nav.to.contact', { from: 'company', toContactId: c.id });
            try { onClose?.(); } catch {}
            setTimeout(() => {
              bus?.emit?.('dialogs.open.contact', { contactId: c.id });
            }, 100);
          });
          li.appendChild(linkEl);
          return li;
        }))
      : h('p', { class: 'muted', text: '(no contacts for this company)' })
  ]);

  // --- Actions
  const actions = h('menu', {}, [
    btn('Close', () => { try { onClose?.(); } catch {} })
  ]);

  dlg.append(header, grid, descr, contactsBlock, actions);

  say('render.done', { companyFound: !!company, contactsCount: contacts.length });

  return dlg;

  // === Helpers
  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    });
    (children || []).forEach(c => e.appendChild(c));
    return e;
  }
  function rowKV(k, v) {
    const wrap = h('div', { class: 'kv' }, [
      h('div', { class: 'kv-k', text: k }),
      h('div', { class: 'kv-v', text: (v || '').toString() })
    ]);
    return wrap;
  }
  function btn(label, onClick) {
    const b = document.createElement('button');
    b.className = 'crm-btn';
    b.textContent = label;
    b.addEventListener('click', e => { e.preventDefault(); onClick?.(); });
    return b;
  }
}
