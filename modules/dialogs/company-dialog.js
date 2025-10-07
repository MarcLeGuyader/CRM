// modules/dialogs/company-dialog.js
// Renders the Company dialog. Pure DOM, no globals.

export function renderCompanyDialog(companyId, deps, onClose) {
  const { bus, getCompanyById, listContactsByCompany } = deps || {};
  const say = (topic, payload = {}) => { try { bus?.emit?.('dialogs.trace', { scope:'company', topic, ...payload }); } catch {} };

  say('render.start', { companyId });

  const company = typeof getCompanyById === 'function' ? (getCompanyById(companyId) || null) : null;
  const contacts = typeof listContactsByCompany === 'function' ? (listContactsByCompany(companyId) || []) : [];

  const titleName = company?.name || companyId || '(unknown)';

  const dlg = document.createElement('dialog');
  dlg.className = 'crm-dialog';
  dlg.setAttribute('aria-label', `Company ${titleName}`);

  const header = h('header', {}, [
    h('h3', { text: `Company – ${titleName}` }),
    (company ? (company.isClient
      ? h('span', { class:'badge-client', text:'Client' })
      : h('span', { class:'badge-nonclient', text:'Prospect' })
    ) : document.createTextNode(''))
  ]);

  const meta = h('div', { class:'crm-meta' }, [
    rowKV('Company ID', company?.id || companyId || ''),
    rowKV('HQ Country', company?.hqCountry || ''),
    rowKV('Website', company?.website || ''),
    rowKV('Type', company?.type || ''),
    rowKV('Main segment', company?.mainSegment || ''),
    rowKV('Description', company?.description || '')
  ]);

  const list = h('div', {}, [
    h('p', { text: 'Contacts:' }),
    h('ul', {}, contacts.map(c => {
      const li = document.createElement('li');
      li.textContent = (c.displayName || [c.firstName||'', c.lastName||''].join(' ').trim() || c.id);
      return li;
    }))
  ]);

  const actions = h('menu', {}, [
    btn('Close', () => { try { onClose?.(); } catch {} })
  ]);

  dlg.append(header, meta, list, actions);

  say('render.done', { companyFound: !!company, contactsCount: contacts.length });

  return dlg;

  // helpers
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
  function rowKV(k, v){
    const valNode = (typeof v === 'string') ? document.createTextNode(v) : (v instanceof Node ? v : document.createTextNode(String(v||'')));
    const wrap = h('div', { class:'kv' }, [
      h('div', { class:'kv-k', text:k }),
      h('div', { class:'kv-v' }, [ valNode ])
    ]);
    return wrap;
  }
  function btn(label, onClick){
    const b = document.createElement('button');
    b.className = 'crm-btn';
    b.textContent = label;
    b.addEventListener('click', (e)=>{ e.preventDefault(); onClick?.(); });
    return b;
  }
}
