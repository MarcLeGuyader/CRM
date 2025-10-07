// modules/dialogs/contact-dialog.js
// Renders the Contact dialog. Pure DOM, no globals.

export function renderContactDialog(contactId, deps, onClose) {
  const { bus, getContactById, resolveContactName, resolveCompanyName } = deps || {};
  const say = (topic, payload = {}) => { try { bus?.emit?.('dialogs.trace', { scope:'contact', topic, ...payload }); } catch {} };

  say('render.start', { contactId });

  // Récupération des données
  const ct = typeof getContactById === 'function' ? (getContactById(contactId) || null) : null;

  // Nom affiché (fallbacks)
  let displayName = '';
  if (ct) {
    displayName = ct.displayName || [ct.firstName || '', ct.lastName || ''].join(' ').trim();
  }
  if (!displayName) {
    displayName = (typeof resolveContactName === 'function' ? resolveContactName(contactId) : '') || '(unknown)';
  }

  // Nom société (fallback au resolver)
  const companyName = (ct && ct.companyId)
    ? ((typeof resolveCompanyName === 'function' ? resolveCompanyName(ct.companyId) : '') || ct.companyId)
    : '';

  // --- DOM
  const dlg = document.createElement('dialog');
  dlg.className = 'crm-dialog';
  dlg.setAttribute('aria-label', `Contact ${displayName}`);

  const header = h('header', {}, [
    h('h3', { text: `Contact – ${displayName}` })
  ]);

  const meta = h('div', { class: 'crm-meta' }, [
    rowKV('Contact ID', (ct?.id || contactId || '')),
    rowKV('Company ID', (ct?.companyId || '')),
    rowKV('Company', companyName || ''),
    rowKV('First name', (ct?.firstName || '')),
    rowKV('Last name', (ct?.lastName || '')),
    rowKV('Email', (ct?.email || '')),
    rowKV('Phone', (ct?.phone || '')),
    rowKV('Job title', (ct?.jobTitle || '')),
    rowKV('Address', [
      (ct?.addressStreet||''),
      (ct?.addressCity||''),
      (ct?.addressPostalCode||''),
      (ct?.addressCountry||'')
    ].filter(Boolean).join(', '))
  ]);

  const actions = h('menu', {}, [
    btn('Close', () => { try { onClose?.(); } catch {} })
  ]);

  dlg.append(header, meta, actions);

  say('render.done', {
    contactFound: !!ct,
    displayName,
    hasCompany: !!ct?.companyId
  });

  return dlg;

  // --- helpers
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
    const valNode = (typeof v === 'string') ? document.createTextNode(v) : (v instanceof Node ? v : document.createTextNode(String(v||'')));
    const wrap = h('div', { class: 'kv' }, [
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
