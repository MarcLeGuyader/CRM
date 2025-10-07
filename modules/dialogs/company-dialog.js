// modules/dialogs/company-dialog.js
// Renders the Company dialog with new layout and navigation rules.

export function renderCompanyDialog(companyId, deps, onClose, navigateReplace) {
  const { bus, getCompanyById, listContactsByCompany, resolveContactName } = deps || {};
  const say = (topic, payload = {}) => { try { bus?.emit?.('dialogs.trace', { scope:'company', topic, ...payload }); } catch {} };

  say('render.start', { companyId });

  // === Data
  const company = typeof getCompanyById === 'function' ? (getCompanyById(companyId) || null) : null;
  const contacts = typeof listContactsByCompany === 'function' ? (listContactsByCompany(companyId) || []) : [];
  const titleName = company?.name || companyId || '(unknown)';
  const isClient = !!company?.isClient;

  // === Root dialog
  const dlg = document.createElement('dialog');
  dlg.className = 'crm-dialog';
  dlg.setAttribute('aria-label', `Company ${titleName}`);
  dlg.id = `dlg-company-${Math.random().toString(36).slice(2, 8)}`;

  // === Header
  const header = h('header', {}, [
    h('div', { class: 'header-title-block' }, [
      h('h3', { 
        text: `Company – ${titleName}`, 
        class: isClient ? 'danger' : '' 
      }),
      h('div', { class: 'subtitle muted' }, [
        document.createTextNode(`Company ID: ${company?.id || companyId || ''}`)
      ])
    ])
  ]);

  // === Meta Grid (2 colonnes)
  const grid = h('div', { class: 'grid2' }, [
    rowKV('HQ Country', company?.hqCountry || ''),
    rowKV('Website', company?.website || ''),
    rowKV('Type', company?.type || ''),
    rowKV('Main segment', company?.mainSegment || '')
  ]);

  // === Description pleine largeur
  const descr = h('div', { class: 'block' }, [
    rowKV('Description', company?.description || '')
  ]);

  // === Contacts (pleine largeur)
  const list = h('div', { class: 'block' }, [
    h('p', { text: 'Contacts:' }),
    h('ul', {}, contacts.map(c => {
      const li = document.createElement('li');
      const label =
        c.displayName ||
        [c.firstName || '', c.lastName || ''].join(' ').trim() ||
        resolveContactName?.(c.id) ||
        c.id;
      const linkEl = h('span', { class: 'crm-link', text: label });
      linkEl.addEventListener('click', () => {
        try {
          navigateReplace?.('contact', { contactId: c.id });
        } catch (err) {
          console.error('[company-dialog] navigateReplace failed', err);
        }
      });
      li.appendChild(linkEl);
      return li;
    }))
  ]);

  // === Actions
  const actions = h('menu', {}, [
    btn('Close', () => { try { onClose?.(); } catch {} })
  ]);

  dlg.append(header, grid, descr, list, actions);

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
    const valNode = (typeof v === 'string')
      ? document.createTextNode(v)
      : (v instanceof Node ? v : document.createTextNode(String(v || '')));
    const wrap = h('div', { class: 'kv' }, [
      h('div', { class: 'kv-k', text: k }),
      h('div', { class: 'kv-v' }, [valNode])
    ]);
    return wrap;
  }

  function btn(label, onClick) {
    const b = document.createElement('button');
    b.className = 'crm-btn';
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onClick?.();
    });
    return b;
  }
}
