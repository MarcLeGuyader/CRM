// ./modules/data-orchestrator/data-orchestrator.js
// Data Orchestrator (Module 07) — v5 strict formats + vocab support (Point 1)
// - Source de vérité en mémoire
// - Persistance localStorage
// - Validation centralisée
// - Génération d'ID OPP-######
// - Résolution des noms (Company/Contact)
// - SalesStepList dynamique + Companies.IsClient → clientList
// - Vocabs: leadSources, companyTypes, companySegments, owners
// - IDs STRICTS:
//     Company.ID     : CMPY-######
//     Contact.ID     : CON-######
//     Opportunity.ID : OPP-######

import { setAllowedSalesSteps } from '../validation-rules/validation-rules.js';
(function(){
  const BUS = (typeof window !== 'undefined' && window.bus) ? window.bus : null;
  if (!BUS) { console.error('[data-orchestrator] Event bus not found on window.bus'); return; }

  // --- Storage (v5 pour ne pas mélanger avec anciens formats) ---
  const STORAGE = {
    rows:       'crm_rows_v5',
    companies:  'crm_companies_v5',
    contacts:   'crm_contacts_v5',
    salesSteps: 'crm_sales_steps_v5',
    clients:    'crm_clients_v5',
    vocab:      'crm_vocab_v1'
  };

  // --- Regex strictes pour les IDs ---
  const RX = {
    opp:   /^OPP-\d{6}$/,
    cmpy:  /^CMPY-\d{6}$/,
    cont:  /^CON-\d{6}$/
  };

  const DEFAULT_STEPS = ['Discovery','Qualified','Solution selling','Negotiation','Closing','Won','Lost'];

  // --- État ---
  const state = {
    rows: [],                 // Array<Opportunity>
    compIndex: {},            // CMPY-xxxxxx -> { id, name, isClient?, ... }
    contIndex: {},            // CON-xxxxxx  -> { id, displayName, firstName, lastName, companyId, email, phone }
    companiesByName: {},      // name -> CMPY-xxxxxx
    contactsByName: {},       // displayName -> CON-xxxxxx
    salesSteps: [],
    clientList: [],           // [CMPY-xxxxxx,...]
    vocab: {                  // Point 1
      leadSources: [],        // from opportunities
      companyTypes: [],       // from companies
      companySegments: [],    // from companies.mainSegment
      owners: []              // from opportunities.owner
    }
  };

  // ---------- Utils ----------
  function loadLS(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch{ return fallback; } }
  function saveLS(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ console.warn('[data-orchestrator] persist error', key, e); } }
  function isIsoDate(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function cmpDate(a,b){ if (!isIsoDate(a) || !isIsoDate(b)) return 0; return a<b?-1:a>b?1:0; }
  const toStr = v => (v==null ? '' : String(v));
  const trim = s => toStr(s).trim();
  const norm = s => trim(s);

  function nextOppId(rows){
    let max = 0;
    for (const r of rows){
      const id = r.id || r['Opportunity.ID'] || '';
      if (RX.opp.test(id)){
        const n = parseInt(id.slice(4), 10);
        if (n > max) max = n;
      }
    }
    return 'OPP-' + String(max+1).padStart(6,'0');
  }

  function rebuildDerivedLookups(){
    state.companiesByName = {};
    for (const c of Object.values(state.compIndex)){ if (c?.name) state.companiesByName[c.name] = c.id; }
    state.contactsByName = {};
    for (const c of Object.values(state.contIndex)){ const dn = c?.displayName; if (dn) state.contactsByName[dn] = c.id; }
    state.clientList = Object.values(state.compIndex).filter(c => !!c.isClient).map(c => c.id);
  }

  function resolveCompanyName(companyId){
    if (!companyId || !RX.cmpy.test(String(companyId))) return undefined;
    const info = state.compIndex[String(companyId)];
    return info ? info.name : undefined;
  }
  function resolveContactName(contactId){
    if (!contactId || !RX.cont.test(String(contactId))) return undefined;
    const info = state.contIndex[String(contactId)];
    if (!info) return undefined;
    return info.displayName || [info.firstName||'', info.lastName||''].join(' ').trim() || undefined;
  }

  // ---------- Validation ----------
  function currentAllowedSteps(){
    return (Array.isArray(state.salesSteps) && state.salesSteps.length) ? state.salesSteps : DEFAULT_STEPS;
  }

  function validateOpportunity(draft){
    const errors = [];

    // ID formats stricts s’ils sont fournis
    const id = (draft.id ?? draft['Opportunity.ID'] ?? '').toString().trim();
    if (id && !RX.opp.test(id)) errors.push({ field:'id', code:'bad_format', message:'Opportunity.ID must match OPP-000001 (6 digits).' });

    const companyId = (draft.companyId ?? draft['Opportunity.CompanyID'] ?? '').toString().trim();
    if (companyId && !RX.cmpy.test(companyId)) errors.push({ field:'companyId', code:'bad_format', message:'Company.ID must match CMPY-000001 (6 digits).' });

    const contactId = (draft.contactId ?? draft['Opportunity.ContactID'] ?? '').toString().trim();
    if (contactId && !RX.cont.test(contactId)) errors.push({ field:'contactId', code:'bad_format', message:'Contact.ID must match CON-000001 (6 digits).' });

    const name = (draft.name ?? draft['Opportunity.Name'] ?? '').toString().trim();
    if (!name) errors.push({ field: 'name', code: 'required', message: 'Name is required.' });

    const salesStep = (draft.salesStep ?? draft['Opportunity.SalesStep'] ?? '').toString().trim();
    const stepList = currentAllowedSteps();
    if (stepList.length && !stepList.includes(salesStep)){
      errors.push({ field: 'salesStep', code: 'invalid_step', message: `Sales step must be one of: ${stepList.join(', ')}` });
    }

    const closingValueRaw = draft.closingValue ?? draft['Opportunity.ClosingValue'];
    if (closingValueRaw != null && closingValueRaw !== ''){
      const n = Number(closingValueRaw);
      if (!Number.isFinite(n) || n < 0) errors.push({ field: 'closingValue', code: 'invalid_non_negative', message: 'Closing value must be a non-negative number.' });
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

    // Référentiels existants ?
    if (companyId && !state.compIndex[companyId]){
      errors.push({ field: 'companyId', code: 'unknown_company', message: 'Company ID does not exist.' });
    }
    if (contactId){
      const ci = state.contIndex[contactId];
      if (!ci){
        errors.push({ field: 'contactId', code: 'unknown_contact', message: 'Contact ID does not exist.' });
      } else if (companyId && ci.companyId && String(ci.companyId).trim() !== String(companyId).trim()){
        errors.push({ field: 'contactId', code: 'contact_company_mismatch', message: 'Contact belongs to a different company.' });
      }
    }

    return errors;
  }

  // ---------- Save (create/update) ----------
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
      closingValue: draft.closingValue != null ? Number(draft.closingValue)
                 : draft['Opportunity.ClosingValue'] != null ? Number(draft['Opportunity.ClosingValue'])
                 : 0
    };
  }

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

  // ---------- Vocabs helpers (Point 1) ----------
  function setVocabFromArrays(v){
    const safe = (arr) => Array.from(new Set((Array.isArray(arr)?arr:[]).map(norm).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    state.vocab = {
      leadSources:    safe(v.leadSources),
      companyTypes:   safe(v.companyTypes),
      companySegments:safe(v.companySegments),
      owners:         safe(v.owners)
    };
  }
  function buildVocabFromData(rows, companies){
    const sLead = new Set();
    const sOwn  = new Set();
    const sType = new Set();
    const sSeg  = new Set();

    (Array.isArray(rows)?rows:[]).forEach(r => {
      const lead = norm(r.leadSource ?? r['Opportunity.LeadSource'] ?? '');
      if (lead) sLead.add(lead);
      const owner = norm(r.owner ?? r['Opportunity.Owner'] ?? '');
      if (owner) sOwn.add(owner);
    });
    (Array.isArray(companies)?companies:[]).forEach(c => {
      const type = norm(c.type ?? c.Type ?? c['Companies.Type'] ?? '');
      if (type) sType.add(type);
      const seg  = norm(c.mainSegment ?? c.MainSegment ?? c['Companies.MainSegment'] ?? '');
      if (seg) sSeg.add(seg);
    });

    return {
      leadSources: Array.from(sLead).sort((a,b)=>a.localeCompare(b)),
      companyTypes: Array.from(sType).sort((a,b)=>a.localeCompare(b)),
      companySegments: Array.from(sSeg).sort((a,b)=>a.localeCompare(b)),
      owners: Array.from(sOwn).sort((a,b)=>a.localeCompare(b))
    };
  }
  function getVocab(){
    // retourner des copies
    const v = state.vocab || { leadSources:[], companyTypes:[], companySegments:[], owners:[] };
    return {
      leadSources: v.leadSources.slice(),
      companyTypes: v.companyTypes.slice(),
      companySegments: v.companySegments.slice(),
      owners: v.owners.slice()
    };
  }
  function addToVocab(kind, value){
    const allowed = ['leadSources','companyTypes','companySegments','owners'];
    if (!allowed.includes(kind)) return { ok:false, error:'bad_kind' };
    const v = norm(value);
    if (!v) return { ok:false, error:'empty' };
    const arr = state.vocab[kind] || (state.vocab[kind]=[]);
    if (!arr.includes(v)){
      arr.push(v);
      arr.sort((a,b)=>a.localeCompare(b));
      persist();
      emitVocabReady('addToVocab');
    }
    return { ok:true };
  }
  function emitVocabReady(reason){
    const v = state.vocab || {};
    BUS.emit('data.vocab.ready', {
      reason,
      counts: {
        leadSources: (v.leadSources||[]).length,
        companyTypes: (v.companyTypes||[]).length,
        companySegments: (v.companySegments||[]).length,
        owners: (v.owners||[]).length
      }
    });
  }

  // ---------- Persistence ----------
  function persist(){
    saveLS(STORAGE.rows, state.rows);
    saveLS(STORAGE.companies, Object.values(state.compIndex));
    saveLS(STORAGE.contacts, Object.values(state.contIndex));
    saveLS(STORAGE.salesSteps, state.salesSteps);
    saveLS(STORAGE.clients, state.clientList);
    saveLS(STORAGE.vocab, state.vocab);
  }
  function reset(){
    Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
    state.rows = [];
    state.compIndex = {};
    state.contIndex = {};
    state.salesSteps = [];
    state.clientList = [];
    state.companiesByName = {};
    state.contactsByName = {};
    state.vocab = { leadSources:[], companyTypes:[], companySegments:[], owners:[] };
  }

  function getState(){
    return {
      rows: state.rows.slice(),
      companies: Object.values(state.compIndex),
      contacts: Object.values(state.contIndex),
      salesSteps: state.salesSteps.slice(),
      clientList: state.clientList.slice()
    };
  }

  // ---------- Import merge ----------
  // payload attendu:
  // {
  //   ok: true,
  //   rows: Opportunity[],
  //   companies: Company[],   // { id:'CMPY-######', name, isClient?, ... }
  //   contacts: Contact[],    // { id:'CON-######', displayName, firstName, lastName, companyId:'CMPY-######', ... }
  //   salesSteps: string[],
  //   vocab?: { leadSources:[], companyTypes:[], companySegments:[], owners:[] } // optionnel
  // }
  function mergeImport(payload){
    if (!payload || payload.ok !== true){
      console.warn('[data-orchestrator] import report not ok → ignore');
      return;
    }
    const inRows = Array.isArray(payload.rows) ? payload.rows : [];
    const inCompanies = Array.isArray(payload.companies) ? payload.companies : [];
    const inContacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const inSalesSteps = Array.isArray(payload.salesSteps) ? payload.salesSteps.filter(Boolean) : [];

    // Companies
    for (const c of inCompanies){
      if (!c || !c.id || !RX.cmpy.test(c.id)) {
        console.warn('[orchestrator] drop company with bad id', c?.id);
        continue;
      }
      state.compIndex[c.id] = {
        id: c.id,
        name: c.name || c.displayName || String(c.id),
        isClient: !!(c.isClient || c.IsClient || c['Companies.IsClient']),
        // champs étendus
        hqCountry:   c.hqCountry   || c.HQCountry   || c.hqcountry   || c['Companies.HQCountry']   || '',
        website:     c.website     || c.Website     || c['Companies.Website']     || '',
        type:        c.type        || c.Type        || c['Companies.Type']        || '',
        mainSegment: c.mainSegment || c.MainSegment || c['Companies.MainSegment'] || '',
        description: c.description || c.Description || c['Companies.Description'] || ''
      };
    }
    // Contacts
    for (const c of inContacts){
      if (!c || !c.id || !RX.cont.test(c.id)) { console.warn('[orchestrator] drop contact with bad id', c?.id); continue; }
      const companyId = c.companyId || '';
      if (companyId && !RX.cmpy.test(companyId)) { console.warn('[orchestrator] drop contact with bad companyId', c?.id, companyId); continue; }
      state.contIndex[c.id] = {
        id: c.id,
        displayName: c.displayName || [c.firstName||'',c.lastName||''].join(' ').trim(),
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        companyId: companyId || '',
        email: c.email || '',
        phone: c.phone || ''
      };
    }

    // Sales steps (remplace la liste si fournie)
    if (inSalesSteps.length){
      state.salesSteps = inSalesSteps.slice();
      // IMPORTANT : pousse la liste dans le module de validation
      setAllowedSalesSteps(state.salesSteps);
    }
    // Lookups + client list
    rebuildDerivedLookups();

    // Rows (opportunities) — valider chaque entrée
    let added = 0, updated = 0, invalid = 0;
    for (const r of inRows){
      // hard pre-checks ID formats
      if (r.id && !RX.opp.test(r.id)) { invalid++; continue; }
      if (r.companyId && !RX.cmpy.test(r.companyId)) { invalid++; continue; }
      if (r.contactId && !RX.cont.test(r.contactId)) { invalid++; continue; }

      const before = state.rows.find(x => x.id === r.id);
      const res = saveOpportunity(r);
      if (res.ok){
        if (before) updated++; else added++;
      } else {
        invalid++;
      }
    }

    // --- Vocab ---
    if (payload.vocab && typeof payload.vocab === 'object'){
      setVocabFromArrays(payload.vocab);
    } else {
      const inferred = buildVocabFromData(inRows, Object.values(state.compIndex));
      setVocabFromArrays(inferred);
    }

    persist();
    BUS.emit('opps.updated', { id: null, import: true, added, updated, invalid });
    emitVocabReady('mergeImport');
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
    const rows       = loadLS(STORAGE.rows, []);
    const companies  = loadLS(STORAGE.companies, []); // [{id,name,isClient,...}]
    const contacts   = loadLS(STORAGE.contacts, []);  // [{id,displayName,...}]
    const steps      = loadLS(STORAGE.salesSteps, []); // [string]
    const clients    = loadLS(STORAGE.clients, []);   // [CMPY-xxxxxx]
    const vocabLS    = loadLS(STORAGE.vocab, null);

    state.rows = Array.isArray(rows) ? rows : [];

    state.compIndex = {};
    (Array.isArray(companies) ? companies : []).forEach(c => {
      if (c && c.id && RX.cmpy.test(c.id)) {
        state.compIndex[c.id] = {
          id: c.id,
          name: c.name || String(c.id),
          isClient: !!c.isClient,
          // champs étendus (si existants en storage, on les reprend tels quels)
          hqCountry:   c.hqCountry   || '',
          website:     c.website     || '',
          type:        c.type        || '',
          mainSegment: c.mainSegment || '',
          description: c.description || ''
        };
      }
    });
    state.contIndex = {};
    (Array.isArray(contacts) ? contacts : []).forEach(c => {
      if (c && c.id && RX.cont.test(c.id)){
        const companyId = c.companyId || '';
        state.contIndex[c.id] = {
          id: c.id,
          displayName: c.displayName || [c.firstName||'',c.lastName||''].join(' ').trim(),
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          companyId: companyId,
          email: c.email || '',
          phone: c.phone || ''
        };
      }
    });

    state.salesSteps = Array.isArray(steps) && steps.length ? steps.slice() : [];
    // Si des steps sont déjà persistées, on les publie au validateur dès le boot
    if (state.salesSteps.length){
      setAllowedSalesSteps(state.salesSteps);
    }
    state.clientList = Array.isArray(clients) && clients.length ? clients.slice()
                      : Object.values(state.compIndex).filter(c => !!c.isClient).map(c => c.id);

    rebuildDerivedLookups();

    // Vocab: charger LS sinon générer depuis les données existantes
    if (vocabLS && typeof vocabLS === 'object'){
      setVocabFromArrays(vocabLS);
    } else {
      const inferred = buildVocabFromData(state.rows, Object.values(state.compIndex));
      setVocabFromArrays(inferred);
      saveLS(STORAGE.vocab, state.vocab);
    }

    if ((state.rows.length === 0 || forceDemo) && Object.keys(state.compIndex).length === 0){
      // Demo seed alignée sur CMPY/CON/OPP
      state.compIndex = {
        'CMPY-000001': { id:'CMPY-000001', name:'Maello',  isClient:true },
        'CMPY-000002': { id:'CMPY-000002', name:'Globex',  isClient:true },
        'CMPY-000003': { id:'CMPY-000003', name:'Initech', isClient:false }
      };
      state.contIndex = {
        'CON-000001': { id:'CON-000001', displayName:'Marc Le Guyader', firstName:'Marc', lastName:'Le Guyader', companyId:'CMPY-000001' },
        'CON-000002': { id:'CON-000002', displayName:'John Doe',        firstName:'John', lastName:'Doe',        companyId:'CMPY-000002' }
      };
      state.salesSteps = DEFAULT_STEPS.slice();
      setAllowedSalesSteps(state.salesSteps);
      state.rows = [
        { id:'OPP-000001', name:'Migration CRM', salesStep:'Discovery', client:'Maello', owner:'Marc',  companyId:'CMPY-000001', contactId:'CON-000001', closingValue:12000, nextAction:'Call', nextActionDate:'2025-10-10', closingDate:'', leadSource:'Referral' },
        { id:'OPP-000002', name:'Integration',   salesStep:'Qualified', client:'Globex', owner:'Sven',  companyId:'CMPY-000002', contactId:'CON-000002', closingValue:22000, nextAction:'POC',  nextActionDate:'2025-10-15', closingDate:'', leadSource:'Inbound' }
      ];
      // vocabs seed depuis données démo
      const inferred = buildVocabFromData(state.rows, Object.values(state.compIndex));
      setVocabFromArrays(inferred);
      rebuildDerivedLookups();
      persist();
    }

    BUS.emit('data.loaded', getState());
    emitVocabReady('bootstrap');
  }

  // Expose minimal API
  window.DATA = window.DATA || {};
  window.DATA.orchestrator = {
    getState,
    resolveCompanyName,
    resolveContactName,
    validateOpportunity,
    saveOpportunity,
    reset,
    persist,
    bootstrap,
    // helpers directs
    getCompanyById: (id) => state.compIndex[id],
    getContactById: (id) => state.contIndex[id],
    // Point 1 API
    getVocab,
    addToVocab
  };
  // Auto-boot
  bootstrap();
})();
