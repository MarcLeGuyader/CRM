// modules/import-export/import.js
// Excel-only import (SheetJS required on window.XLSX)
// Reads 4 sheets: Opportunities, Companies, Contacts, SalesStepList
// Emits: data.import.started  -> { filename }
//        data.import.report   -> { ok, rows, companies, contacts, meta:{ salesSteps, clientCompanies }, errors? }

//////////////////////////
// Helpers & constants  //
//////////////////////////

const ID_RE = /^OPP-\d{6}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize truthy string like "yes", "true", "1", "y" to boolean */
function toBool(v){
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}
function isIsoDate(s){
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === s;
}
function toNumberOrNull(v){
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function aoaFromSheet(ws){
  // header:1 gives 2D array (array of rows)
  return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
}

/////////////////////////////
// Header normalization    //
/////////////////////////////

/**
 * Normalize column headers to canonical keys per sheet.
 * We accept DB-like dotted headers (e.g., Opportunities.Name) and friendlier variants.
 */
function normHeader(sheet, h){
  if (!h) return '';
  const w = String(h).trim().toLowerCase();

  if (sheet === 'opportunities'){
    // Canonical keys for Opportunity rows
    const map = {
      // IDs
      'opportunities.opportunityid':'id',
      'opportunityid':'id',
      'opportunity id':'id',
      'id':'id',

      // Main fields
      'opportunities.name':'name', 'name':'name',
      'opportunities.owner':'owner','owner':'owner',
      'opportunities.client':'client','client':'client',
      'opportunities.salesstep':'salesStep','sales step':'salesStep','stage':'salesStep',

      // Relationships
      'opportunities.companyid':'companyId','company id':'companyId',
      'opportunities.contactid':'contactId','contact id':'contactId',

      // Details
      'opportunities.notes':'notes','notes':'notes',
      'opportunities.nextaction':'nextAction','next action':'nextAction',
      'opportunities.nextactiondate':'nextActionDate','next action date':'nextActionDate',
      'opportunities.closingdate':'closingDate','closing date':'closingDate',
      'opportunities.closingvalue':'closingValue','closing value':'closingValue','amount':'closingValue',
      'opportunities.leadsource':'leadSource','lead source':'leadSource',

      // Optional
      'opportunities.salescyclelastchangedate':'salesCycleLastChangeDate',
      'sales cycle last change date':'salesCycleLastChangeDate'
    };
    return map[w] || '';
  }

  if (sheet === 'companies'){
    const map = {
      'companies.companyid':'id', 'companyid':'id', 'company id':'id', 'id':'id',
      'companies.name':'name', 'name':'name',
      'companies.hqcountry':'hqCountry', 'hqcountry':'hqCountry', 'hq country':'hqCountry',
      'companies.website':'website', 'website':'website',
      'companies.type':'type', 'type':'type',
      'companies.mainsegment':'mainSegment', 'main segment':'mainSegment',
      'companies.description':'description', 'description':'description',
      'companies.isclient':'isClient', 'isclient':'isClient', 'is client':'isClient'
    };
    return map[w] || '';
  }

  if (sheet === 'contacts'){
    const map = {
      'contacts.contactid':'id', 'contactid':'id', 'contact id':'id', 'id':'id',
      'contacts.companyid':'companyId', 'companyid':'companyId', 'company id':'companyId',
      'contacts.lastname':'lastName', 'last name':'lastName', 'lastname':'lastName',
      'contacts.firstname':'firstName', 'first name':'firstName', 'firstname':'firstName',
      'contacts.email':'email', 'email':'email',
      'contacts.phone':'phone', 'phone':'phone',
      'contacts.jobtitle':'jobTitle', 'job title':'jobTitle', 'jobtitle':'jobTitle',
      'contacts.addressstreet':'addressStreet', 'address street':'addressStreet',
      'contacts.addresscity':'addressCity', 'address city':'addressCity',
      'contacts.addresspostalcode':'addressPostalCode', 'address postal code':'addressPostalCode', 'postal code':'addressPostalCode',
      'contacts.addresscountry':'addressCountry', 'address country':'addressCountry', 'country':'addressCountry'
    };
    return map[w] || '';
  }

  if (sheet === 'salessteplist'){
    // Expect a single column named "SalesStepList" (flexible)
    if (w === 'salessteplist' || w === 'sales step list' || w === 'step' || w === 'sales step') return 'salesStep';
    return '';
  }

  return '';
}

function parseSheet(ws, sheetName){
  const aoa = aoaFromSheet(ws);
  if (!aoa.length) return { headers: [], rows: [] };
  const headersRaw = aoa[0] || [];
  const headers = headersRaw.map(h => normHeader(sheetName, h));
  const rows = [];

  for (let i=1; i<aoa.length; i++){
    const arr = aoa[i] || [];
    const o = {};
    headers.forEach((h, idx) => { if (h) o[h] = arr[idx] ?? ''; });
    rows.push(o);
  }
  return { headers, rows };
}

////////////////////////////////////
// Canonicalize & validation      //
////////////////////////////////////

function canonOpportunity(r){
  const out = {
    id:               r.id || '',
    name:             r.name || '',
    owner:            r.owner || '',
    client:           r.client || '',
    companyId:        r.companyId || '',
    contactId:        r.contactId || '',
    salesStep:        r.salesStep || '',
    leadSource:       r.leadSource || '',
    notes:            r.notes || '',
    nextAction:       r.nextAction || '',
    nextActionDate:   r.nextActionDate || '',
    closingDate:      r.closingDate || '',
    closingValue:     r.closingValue,
    salesCycleLastChangeDate: r.salesCycleLastChangeDate || ''
  };
  // numeric cast
  if (out.closingValue !== undefined && out.closingValue !== '') {
    const n = Number(out.closingValue);
    out.closingValue = Number.isFinite(n) ? n : out.closingValue;
  }
  return out;
}

function canonCompany(r){
  return {
    id:           r.id || '',
    name:         r.name || '',
    hqCountry:    r.hqCountry || '',
    website:      r.website || '',
    type:         r.type || '',
    mainSegment:  r.mainSegment || '',
    description:  r.description || '',
    isClient:     toBool(r.isClient)
  };
}

function canonContact(r){
  return {
    id:                r.id || '',
    companyId:         r.companyId || '',
    lastName:          r.lastName || '',
    firstName:         r.firstName || '',
    email:             r.email || '',
    phone:             r.phone || '',
    jobTitle:          r.jobTitle || '',
    addressStreet:     r.addressStreet || '',
    addressCity:       r.addressCity || '',
    addressPostalCode: r.addressPostalCode || '',
    addressCountry:    r.addressCountry || ''
  };
}

function validateOpportunities(rows, rowOffset, salesSteps){
  const errors = [];
  const allowedSteps = Array.isArray(salesSteps) && salesSteps.length ? salesSteps : null;

  rows.forEach((r, i) => {
    const n = i + rowOffset; // human line number
    if (r.id && !ID_RE.test(String(r.id))) {
      errors.push({ row:n, field:'id', code:'badId', message:'ID must match OPP-###### or be empty' });
    }
    if (!r.name || !String(r.name).trim()){
      errors.push({ row:n, field:'name', code:'required', message:'Name is required' });
    }
    if (!r.client || !String(r.client).trim()){
      errors.push({ row:n, field:'client', code:'required', message:'Client is required' });
    }
    if (!r.owner || !String(r.owner).trim()){
      errors.push({ row:n, field:'owner', code:'required', message:'Owner is required' });
    }
    if (r.salesStep){
      if (allowedSteps && !allowedSteps.includes(String(r.salesStep))){
        errors.push({ row:n, field:'salesStep', code:'invalidStep', message:`Sales step must be one of: ${allowedSteps.join(', ')}` });
      }
    } else {
      errors.push({ row:n, field:'salesStep', code:'required', message:'Sales step is required' });
    }
    if (r.nextActionDate && !isIsoDate(String(r.nextActionDate))){
      errors.push({ row:n, field:'nextActionDate', code:'badDate', message:'Next action date must be ISO yyyy-mm-dd' });
    }
    if (r.closingDate && !isIsoDate(String(r.closingDate))){
      errors.push({ row:n, field:'closingDate', code:'badDate', message:'Closing date must be ISO yyyy-mm-dd' });
    }
    if (r.closingValue !== null && r.closingValue !== undefined && String(r.closingValue).trim() !== ''){
      const nval = toNumberOrNull(r.closingValue);
      if (Number.isNaN(nval) || nval < 0){
        errors.push({ row:n, field:'closingValue', code:'badNumber', message:'Closing value must be a number ≥ 0' });
      }
    }
    // Won requires closingDate (coherence)
    if (String(r.salesStep).toLowerCase() === 'won' && (!r.closingDate || !isIsoDate(String(r.closingDate)))){
      errors.push({ row:n, field:'closingDate', code:'required_when_won', message:'Closing date required when step is Won' });
    }
    // timeline
    if (r.nextActionDate && r.closingDate && isIsoDate(String(r.nextActionDate)) && isIsoDate(String(r.closingDate))){
      const na = new Date(r.nextActionDate + 'T00:00:00Z').getTime();
      const cd = new Date(r.closingDate + 'T00:00:00Z').getTime();
      if (na > cd) errors.push({ row:n, field:'nextActionDate', code:'afterClosing', message:'Next action date must not be after closing date' });
    }
  });

  return errors;
}

/////////////////////////////////////
// Public entry: importFromFile    //
/////////////////////////////////////

/**
 * @param {File} file - .xlsx file
 * @param {{bus:any}} ctx
 * @returns {Promise<{ok:boolean, rows?:Array, companies?:Array, contacts?:Array, meta?:{salesSteps:string[], clientCompanies:string[]}, errors?:Array}>}
 */
export async function importFromFile(file, ctx){
  const bus = ctx?.bus;
  if (!bus || typeof bus.emit !== 'function'){
    throw new Error('A bus with emit(topic,payload) is required.');
  }
  bus.emit('data.import.started', { filename: file?.name || '' });

  try{
    if (!file) throw new Error('No file provided');
    if (String(file.name).toLowerCase().endsWith('.csv')){
      throw new Error('CSV is no longer supported. Please provide an .xlsx file.');
    }
    if (!window.XLSX) throw new Error('XLSX library not found on window.XLSX');

    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type:'array' });

    // Grab sheets (be tolerant on naming)
    const findSheet = (names) => {
      const lower = wb.SheetNames.map(n => ({ n, key: n.toLowerCase().trim() }));
      for (const target of names){
        const hit = lower.find(x => x.key === target);
        if (hit) return wb.Sheets[hit.n];
      }
      return null;
    };

    const wsOpp  = findSheet(['opportunities']);
    const wsComp = findSheet(['companies']);
    const wsCont = findSheet(['contacts']);
    const wsStep = findSheet(['salessteplist','sales step list','steps']);

    if (!wsOpp)  throw new Error('Sheet "Opportunities" not found');
    if (!wsComp) throw new Error('Sheet "Companies" not found');
    if (!wsCont) throw new Error('Sheet "Contacts" not found');

    // Parse
    const oppParsed  = parseSheet(wsOpp,  'opportunities');
    const compParsed = parseSheet(wsComp, 'companies');
    const contParsed = parseSheet(wsCont, 'contacts');

    // Sales steps
    let salesSteps = [];
    if (wsStep){
      const aoa = aoaFromSheet(wsStep);
      if (aoa.length){
        // Normalize header
        const hdrs = (aoa[0] || []).map(h => normHeader('salessteplist', h));
        const idx = hdrs.findIndex(h => h === 'salesStep');
        if (idx >= 0){
          for (let i=1;i<aoa.length;i++){
            const cell = (aoa[i] || [])[idx];
            const v = String(cell ?? '').trim();
            if (v) salesSteps.push(v);
          }
        }
      }
    }

    // Canonicalize
    const opportunities = oppParsed.rows.map(canonOpportunity);
    const companies     = compParsed.rows.map(canonCompany);
    const contacts      = contParsed.rows.map(canonContact);

    // Compute client company IDs from companies sheet
    const clientCompanies = companies.filter(c => c.isClient && c.id).map(c => c.id);

    // Validate
    const errors = validateOpportunities(opportunities, /*rowOffset*/2, salesSteps);

    if (errors.length){
      const report = { ok:false, added:0, updated:0, errors };
      bus.emit('data.import.report', report);
      return report;
    }

    const report = {
      ok: true,
      // We don't decide added/updated here; Orchestrator will merge.
      added: 0,
      updated: 0,
      rows: opportunities,
      companies,
      contacts,
      meta: { salesSteps, clientCompanies }
    };
    bus.emit('data.import.report', report);
    return report;

  } catch (err){
    const report = { ok:false, added:0, updated:0, errors:[{ code:'parse', message: String(err?.message || err) }] };
    ctx?.bus?.emit('data.import.report', report);
    return report;
  }
}
