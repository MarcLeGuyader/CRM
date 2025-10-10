// modules/dialogs/opportunity-dialog.js
import { el, link, wrap } from './dom-helpers.js';

export function resolveSteps(getSalesSteps) {
  if (typeof getSalesSteps === 'function') {
    const arr = getSalesSteps() || [];
    return Array.isArray(arr) ? arr : [];
  }
  const steps = (window.DATA?.orchestrator?.getState?.().salesSteps) || [];
  return Array.isArray(steps) ? steps : [];
}

function selectStep(current, getSalesSteps) {
  const steps = resolveSteps(getSalesSteps);
  const sel = el('select', { name: 'salesStep' });
  const placeholder = el('option', { value: '', text: steps.length ? '(choose...)' : '(no steps loaded)' });
  if (!current) placeholder.selected = true;
  sel.appendChild(placeholder);
  steps.forEach(s => {
    const opt = el('option', { value: s, text: s });
    if (s === current) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

export function collectOpportunityDraftFromForm(dlg){
  const get = sel => (dlg.querySelector(sel)?.value || '').trim();
  const cv = get('input[name="closingValue"]');
  return {
    id: get('input[name="id"]') || undefined,
    name: get('input[name="name"]'),
    salesStep: get('select[name="salesStep"]'),
    leadSource: get('input[name="leadSource"]') || undefined,
    client: get('input[name="client"]'),
    owner: get('input[name="owner"]'),
    companyId: get('input[name="companyId"]') || undefined,
    contactId: get('input[name="contactId"]') || undefined,
    notes: get('textarea[name="notes"]') || undefined,
    nextAction: get('input[name="nextAction"]') || undefined,
    nextActionDate: get('input[name="nextActionDate"]') || undefined,
    closingDate: get('input[name="closingDate"]') || undefined,
    closingValue: cv ? Number(cv) : undefined
  };
}

/**
 * Rendu dialog opportunité (nouvelle ou édition).
 * - getOpportunityById: (id)=>row|undefined
 * - resolveCompanyName, resolveContactName: (id)=>string|undefined
 * - getSalesSteps: ()=>string[]
 */
export function renderOpportunityDialog({
  id,
  getOpportunityById,
  resolveCompanyName,
  resolveContactName,
  getSalesSteps,
  openCompany,
  openContact, onCancel
}) {
  const row = id ? (getOpportunityById(id) || null) : null;
  const title = row ? `Edit Opportunity ${row.name || row.id}` : 'New Opportunity';

  const dlg = el('dialog', { class: 'crm-dialog', 'aria-label': title });
  dlg.addEventListener('cancel', e => e.preventDefault()); // on gère via boutons

  const hdr = el('header', {}, [ el('h3', { text: title }) ]);

  const companyName = row?.companyId ? (resolveCompanyName(row.companyId) || row.companyId) : '(none)';
  const contactName = row?.contactId ? (resolveContactName(row.contactId) || row.contactId) : '(none)';

  const grid = el('div', { class: 'grid2' }, [
    wrap('ID', el('input', { name: 'id', value: row?.id || '', readOnly: true })),
    wrap('Name', el('input', { name: 'name', value: row?.name || '' })),
    wrap('Sales step', selectStep(row?.salesStep || '', getSalesSteps)),
    wrap('Lead source', el('input', { name: 'leadSource', value: row?.leadSource || '' })),
    wrap('Client', el('input', { name: 'client', value: row?.client || '' })),
    wrap('Owner', el('input', { name: 'owner', value: row?.owner || '' })),
    wrap('Company ID', el('input', { name: 'companyId', value: row?.companyId || '' })),
    wrap('Company Name', el('div', {}, [ link(companyName, () => openCompany((row?.companyId||'').trim())) ])),
    wrap('Contact ID', el('input', { name: 'contactId', value: row?.contactId || '' })),
    wrap('Contact Name', el('div', {}, [ link(contactName, () => openContact((row?.contactId||'').trim())) ])),
    wrap('Notes', el('textarea', { name: 'notes' }, [document.createTextNode(row?.notes || '')])),
    wrap('Next actions', el('input', { name: 'nextAction', value: row?.nextAction || '' })),
    wrap('Next action date', el('input', { name: 'nextActionDate', type: 'date', value: row?.nextActionDate || '' })),
    wrap('Closing date', el('input', { name: 'closingDate', type: 'date', value: row?.closingDate || '' })),
    wrap('Closing value (€)', el('input', { name: 'closingValue', type: 'number', step: '0.01', value: (row?.closingValue ?? '').toString() })),
  ]);

  const errors = el('pre', { class: 'crm-errors' });
  const actions = el('menu', {}, [
// wire Cancel → close via parent onCancel (fallback to local close)
const btnCancel = actions.querySelector('[data-role="cancel"]');
btnCancel?.addEventListener('click', (ev) => {
  ev.preventDefault();
  try { if (typeof onCancel === 'function') return onCancel(); } catch {}
  try { dlg.close?.(); } catch {}
  try { dlg.remove?.(); } catch {}
});
    el('button', { class: 'crm-btn', 'data-role': 'cancel' }, [document.createTextNode('Cancel')]),
    el('button', { class: 'crm-btn primary', 'data-role': 'save' }, [document.createTextNode('Save')])
  ]);

  dlg.append(hdr, grid, errors, actions);
  return dlg;
}
