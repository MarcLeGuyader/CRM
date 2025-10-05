// ./modules/data-orchestrator/data-orchestrator.js
// Data Orchestrator (Module 07)
// - Single source of truth in memory
// - localStorage persistence (POC)
// - Centralized validation
// - ID generation OPP-######
// - Name resolution helpers
// Depends on a global Event Bus available at window.bus (your existing one).

(function(){
  const BUS = (typeof window !== 'undefined' && window.bus) ? window.bus : null;
  if (!BUS) {
    console.error('[data-orchestrator] Event bus not found on window.bus');
    return;
  }

  const STORAGE = {
    rows: 'crm_rows_v1',
    companies: 'crm_companies_v1',
    contacts: 'crm_contacts_v1'
  };

  const ALLOWED_STEPS = ['Discovery','Qualified','Solution selling','Negotiation','Closing','Won','Lost'];

  /** @type {{ rows: any[], companies: Record<string,string>, contacts: Record<string, any> }} */
  const state = {
    rows: [],             // Array<Opportunity>
    companies: {},        // Map name -> id (simple directory); display names resolved via compIndex
    contacts: {},         // Map displayName -> id (optional helper)
    compIndex: {},        // Map id -> { id, name }
    contIndex: {}         // Map id -> { id, displayName, firstName, lastName, companyId, email, phone }
  };

  // ---------- Utils ----------
  function loadLS(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch{ return fallback; }
  }
  function saveLS(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ console.warn('[data-orchestrator] persist error', key, e); }
  }
  function isIsoDate(s){
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }
  function cmpDate(a,b){
    // return -1/0/1 for ISO yyyy-mm-dd
    if (!isIsoDate(a) || !isIsoDate(b)) return 0;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  function nextOppId(rows){
    let max = 0;
    for (const r of rows){
      const m = /^OPP-(\d{6})$/.exec(r.id || r['Opportunity.ID'] || '');
      if (m){ const n = parseInt(m[1],10); if (n > max) max = n; }
    }
    return 'OPP-' + String(max+1).padStart(6,'0');
  }

  function resolveCompanyName(companyId){
    if (!companyId) return undefined;
    const info = state.compIndex[String(companyId).trim()];
    return info ? info.name : undefined;
  }
  function resolveContactName(contactId){
    if (!contactId) return undefined;
    const info = state.contIndex[String(contactId).trim()];
    if (!info) return undefined;
    return info.displayName || [info.firstName||'', info.lastName||''].join(' ').trim() || undefined;
  }

  // ---------- Validation ----------
  function validateOpportunity(draft){
    /** @type {{ field: string, code: string, message: string }[]} */
    const errors = [];

    const name = (draft.name ?? draft['Opportunity.Name'] ?? '').toString().trim();
    if (!name) errors.push({ field: 'name', code: 'required', message: 'Name is required.' });

    const salesStep = (draft.salesStep ?? draft['Opportunity.SalesStep'] ?? '').toString().trim();
    if (!ALLOWED_STEPS.includes(salesStep)){
      errors.push({ field: 'salesStep', code: 'invalid_step', message: `Sales step must be one of: ${ALLOWED_STEPS.join(', ')}` });
    }

    const closingValueRaw = draft.closingValue ?? draft['Opportunity.ClosingValue'];
    if (closingValueRaw != null && closingValueRaw !== ''){
      const n = Number(closingValueRaw);
      if (!Number.isFinite(n) || n < 0) errors.push({ field: 'closingValue', code: 'invalid_non_negative', message: 'Closing value must be a non‑negative number.' });
    }

    const nextActionDate = draft.nextActionDate ?? draft['Opportunity.NextActionDate'];
    if (nextActionDate && !isIsoDate(nextActionDate)){
      errors.push({ field: 'nextActionDate', code: 'invalid_date', message: 'Next action date must be ISO yyyy-mm-dd.' });
    }
    const closingDate = draft.closingDate ?? draft['Opportunity.ClosingDate'];
    if (closingDate && !isIsoDate(closingDate)){
      errors.push({ field: 'closingDate', code: 'invalid_date', message: 'Closing date must be ISO yyyy-mm-dd.' });
    }

    if (salesStep === 'Won' && !closingDate){
      errors.push({ field: 'closingDate', code: 'required_for_won', message: 'Closing date is required when step is Won.' });
    }

    if (nextActionDate && closingDate && cmpDate(nextActionDate, closingDate) === 1){
      errors.push({ field: 'nextActionDate', code: 'after_closing', message: 'Next action date must be on/before closing date.' });
    }

    const companyId = draft.companyId ?? draft['Opportunity.CompanyID'];
    if (companyId){
      if (!state.compIndex[String(companyId).trim()]){
        errors.push({ field: 'companyId', code: 'unknown_company', message: 'Company ID does not exist.' });
      }
    }
    const contactId = draft.contactId ?? draft['Opportunity.ContactID'];
    if (contactId){
      const ci = state.contIndex[String(contactId).trim()];
      if (!ci){
        errors.push({ field: 'contactId', code: 'unknown_contact', message: 'Contact ID does not exist.' });
      } else if (companyId && ci.companyId && String(ci.companyId).trim() !== String(companyId).trim()){
        errors.push({ field: 'contactId', code: 'contact_company_mismatch', message: 'Contact belongs to a different company.' });
      }
    }

    return errors;
  }

  // ---------- Save (create/update) ----------
  function saveOpportunity(draft){
    const errs = validateOpportunity(draft);
    if (errs.length){
      return { ok:false, errors: errs.map(e => `${e.field}:${e.code}`) };
    }
    const id = (draft.id ?? draft['Opportunity.ID'] ?? '').toString().trim();
    let row;
    if (id){
      const idx = state.rows.findIndex(r => (r.id || r['Opportunity.ID']) === id);
      if (idx >= 0){
        row = Object.assign({}, state.rows[idx], normalizeOpp(draft, id));
        state.rows[idx] = row;
      } else {
        row = normalizeOpp(draft, id);
        state.rows.push(row);
      }
    } else {
      const newId = nextOppId(state.rows);
      row = normalizeOpp(draft, newId);
      state.rows.push(row);
    }
    persist();
    return { ok:true, id: row.id };
  }

  function normalizeOpp(draft, id){
    return {
      id,
      name: (draft.name ?? draft['Opportunity.Name'] ?? '').toString(),
      salesStep: (draft.salesStep ?? draft['Opportunity.SalesStep'] ?? '').toString(),
      client: (draft.client ?? draft['Opportunity.Client'] ?? '').toString(),
      owner: (draft.owner ?? draft['Opportunity.Owner'] ?? '').toString(),
      companyId: (draft.companyId ?? draft['Opportunity.CompanyID'] ?? '') || undefined,
      contactId: (draft.contactId ?? draft['Opportunity.ContactID'] ?? '') || undefined,
      notes: (draft.notes ?? draft['Opportunity.Notes'] ?? '') || '',
      nextAction: (draft.nextAction ?? draft['Opportunity.NextAction'] ?? '') || '',
      nextActionDate: (draft.nextActionDate ?? draft['Opportunity.NextActionDate'] ?? '') || '',
      closingDate: (draft.closingDate ?? draft['Opportunity.ClosingDate'] ?? '') || '',
      closingValue: draft.closingValue != null ? Number(draft.closingValue) :
                    draft['Opportunity.ClosingValue'] != null ? Number(draft['Opportunity.ClosingValue']) : 0
    };
  }

  // ---------- Persistence ----------
  function persist(){
    saveLS(STORAGE.rows, state.rows);
    // Persist indices as arrays
    const companiesPersist = Object.values(state.compIndex);
    const contactsPersist = Object.values(state.contIndex);
    saveLS(STORAGE.companies, companiesPersist);
    saveLS(STORAGE.contacts, contactsPersist);
  }
  function reset(){
    localStorage.removeItem(STORAGE.rows);
    localStorage.removeItem(STORAGE.companies);
    localStorage.removeItem(STORAGE.contacts);
    state.rows = [];
    state.companies = {};
    state.contacts = {};
    state.compIndex = {};
    state.contIndex = {};
  }

  function getState(){
    return {
      rows: state.rows.slice(),
      companies: Object.values(state.compIndex),
      contacts: Object.values(state.contIndex)
    };
  }

  // ---------- Import merge ----------
  function mergeImport(payload){
    // Expect payload like { ok:boolean, rows?:Opportunity[], companies?:Company[], contacts?:Contact[] }
    if (!payload || payload.ok !== true){
      console.warn('[data-orchestrator] import report not ok → ignore');
      return;
    }
    const inRows = Array.isArray(payload.rows) ? payload.rows : [];
    const inCompanies = Array.isArray(payload.companies) ? payload.companies : [];
    const inContacts = Array.isArray(payload.contacts) ? payload.contacts : [];

    // Merge companies
    for (const c of inCompanies){
      if (!c || !c.id) continue;
      state.compIndex[c.id] = { id: c.id, name: c.name || c.displayName || String(c.id) };
    }
    // Merge contacts
    for (const c of inContacts){
      if (!c || !c.id) continue;
      state.contIndex[c.id] = {
        id: c.id,
        displayName: c.displayName || [c.firstName||'',c.lastName||''].join(' ').trim(),
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        companyId: c.companyId || '',
        email: c.email || '',
        phone: c.phone || ''
      };
    }
    // Merge rows (validate each)
    let added = 0, updated = 0, invalid = 0;
    for (const r of inRows){
      const res = saveOpportunity(r);
      if (res.ok){
        const existed = state.rows.some(x => x.id === res.id);
        if (existed) updated++; else added++;
      } else {
        invalid++;
      }
    }
    persist();
    BUS.emit('opps.updated', { id: null, import: true, added, updated, invalid });
  }

  // ---------- Event wiring ----------
  BUS.on('ui.banner.reset', () => { reset(); bootstrap(true); });
  BUS.on('ui.banner.save',  () => { persist(); });
  BUS.on('ui.banner.export', () => {
    const snap = getState();
    BUS.emit('data.snapshot', snap);
  });

  BUS.on('opps.save.request', ({ draft }) => {
    const errors = validateOpportunity(draft || {});
    BUS.emit('opps.validate.result', { ok: errors.length === 0, errors });
    if (errors.length) { BUS.emit('opps.save.result', { ok:false, errors: errors.map(e => e.message) }); return; }
    const res = saveOpportunity(draft);
    BUS.emit('opps.save.result', res);
    if (res.ok){ BUS.emit('opps.updated', { id: res.id }); }
  });

  BUS.on('data.import.report', (payload) => mergeImport(payload || {}));

  // ---------- Bootstrap ----------
  function bootstrap(forceDemo=false){
    // Load persisted
    const rows = loadLS(STORAGE.rows, []);
    const companies = loadLS(STORAGE.companies, []); // array [{id,name}]
    const contacts = loadLS(STORAGE.contacts, []);   // array [{id,displayName,...}]

    state.rows = Array.isArray(rows) ? rows : [];

    state.compIndex = {};
    (Array.isArray(companies) ? companies : []).forEach(c => {
      if (c && c.id) state.compIndex[c.id] = { id: c.id, name: c.name || String(c.id) };
    });

    state.contIndex = {};
    (Array.isArray(contacts) ? contacts : []).forEach(c => {
      if (c && c.id)
        state.contIndex[c.id] = {
          id: c.id,
          displayName: c.displayName || [c.firstName||'',c.lastName||''].join(' ').trim(),
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          companyId: c.companyId || '',
          email: c.email || '',
          phone: c.phone || ''
        };
    });

    if ((state.rows.length === 0 || forceDemo) && Object.keys(state.compIndex).length === 0){
      // Demo seed
      state.compIndex = {
        C001: { id:'C001', name:'Maello' },
        C002: { id:'C002', name:'Globex' }
      };
      state.contIndex = {
        CT001: { id:'CT001', displayName:'Marc Le Guyader', firstName:'Marc', lastName:'Le Guyader', companyId:'C001' },
        CT002: { id:'CT002', displayName:'John Doe', firstName:'John', lastName:'Doe', companyId:'C002' }
      };
      state.rows = [
        { id:'OPP-000001', name:'Migration CRM', salesStep:'Discovery', client:'Maello', owner:'Marc', companyId:'C001', contactId:'CT001', closingValue:12000, nextAction:'Call', nextActionDate:'2025-10-10', closingDate:'' },
        { id:'OPP-000002', name:'Integration', salesStep:'Qualified', client:'Globex', owner:'Sven', companyId:'C002', contactId:'CT002', closingValue:22000, nextAction:'POC', nextActionDate:'2025-10-15', closingDate:'' }
      ];
      persist();
    }

    BUS.emit('data.loaded', getState());
  }

  // Expose minimal API (optional, for tests)
  window.DATA = window.DATA || {};
  window.DATA.orchestrator = {
    getState,
    resolveCompanyName,
    resolveContactName,
    validateOpportunity,
    saveOpportunity,
    reset,
    persist,
    bootstrap
  };

  // Auto-boot
  bootstrap();
})();
