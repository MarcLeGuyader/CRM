// modules/validation-rules/validation-rules.js
// CRM Validation Rules (ES module, sans valeurs par défaut pour les sales steps)

let _allowedSalesSteps = []; // rempli par setAllowedSalesSteps() après import Excel

export function setAllowedSalesSteps(steps){
  _allowedSalesSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
}
export function getAllowedSalesSteps(){
  // Pas de défaut : retourne exactement ce qui a été injecté (éventuellement [])
  return _allowedSalesSteps.slice();
}

// IDs canoniques
const OPP_ID_RE  = /^OPP-\d{6}$/;
const CMPY_ID_RE = /^CMPY-\d{6}$/;
const CON_ID_RE  = /^CON-\d{6}$/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s){
  if (typeof s !== "string" || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().startsWith(s);
}
export function asNumber(n){
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : NaN;
}

// ---- Opportunity ------------------------------------------------------------
export function validateOpportunity(draft){
  /** @type {{field:string,code:string,message:string}[]} */
  const errors = [];
  const add = (f,c,m)=>errors.push({field:f,code:c,message:m});

  // id (optionnel à la création)
  if (draft.id != null && String(draft.id).trim() !== "" && !OPP_ID_RE.test(String(draft.id))){
    add("id","format","ID must match OPP-######");
  }

  // champs obligatoires
  if (!draft.name || !String(draft.name).trim())   add("name","required","Name is required");
  if (!draft.client || !String(draft.client).trim()) add("client","required","Client is required");
  if (!draft.owner || !String(draft.owner).trim()) add("owner","required","Owner is required");

  // salesStep — AUCUN défaut : doit provenir de SalesStepList
  const allowed = getAllowedSalesSteps();
  if (!allowed.length){
    add("salesStep","steps_not_loaded","Sales steps list not loaded (import SalesStepList first)");
  } else if (!draft.salesStep || !allowed.includes(String(draft.salesStep))){
    add("salesStep","invalid","Sales step must be one of: " + allowed.join(", "));
  }

  // leadSource : optionnel → pas de contrainte
  // closingValue ≥ 0 si fourni
  if (draft.closingValue !== undefined && draft.closingValue !== ""){
    const v = asNumber(draft.closingValue);
    if (Number.isNaN(v)) add("closingValue","nan","Closing value must be a number");
    else if (v < 0)      add("closingValue","range","Closing value must be ≥ 0");
  }

  // dates
  if (draft.nextActionDate && !isIsoDate(String(draft.nextActionDate))){
    add("nextActionDate","date","Next action date must be ISO yyyy-mm-dd");
  }
  if (draft.closingDate && !isIsoDate(String(draft.closingDate))){
    add("closingDate","date","Closing date must be ISO yyyy-mm-dd");
  }

  // cohérence étape/date
  if (draft.salesStep === "Won"){
    if (!draft.closingDate || !isIsoDate(String(draft.closingDate))){
      add("closingDate","required_when_won","Closing date is required when stage is Won");
    }
  }

  // ordre temporel
  if (draft.nextActionDate && draft.closingDate && isIsoDate(String(draft.nextActionDate)) && isIsoDate(String(draft.closingDate))){
    const na = new Date(draft.nextActionDate+"T00:00:00Z").getTime();
    const cd = new Date(draft.closingDate+"T00:00:00Z").getTime();
    if (na > cd) add("nextActionDate","afterClosing","Next action date must not be after closing date");
  }

  // formats d’ID (l’existence est vérifiée côté Orchestrator)
  if (draft.companyId){
    if (!CMPY_ID_RE.test(String(draft.companyId))) add("companyId","format","CompanyID must match CMPY-######");
  }
  if (draft.contactId){
    if (!CON_ID_RE.test(String(draft.contactId))) add("contactId","format","ContactID must match CON-######");
  }

  return errors;
}

// ---- Company ----------------------------------------------------------------
export function validateCompany(c){
  const errors = [];
  const add = (f,cod,m)=>errors.push({field:f,code:cod,message:m});

  if (!c || !c.name || !String(c.name).trim()){
    add("name","required","Company name is required");
  }
  if (c?.id && !CMPY_ID_RE.test(String(c.id))){
    add("id","format","CompanyID must match CMPY-######");
  }
  return errors;
}

// ---- Contact ----------------------------------------------------------------
export function validateContact(ct){
  const errors = [];
  const add = (f,cod,m)=>errors.push({field:f,code:cod,message:m});

  const hasNames = !!(ct && (ct.displayName || ct.firstName || ct.lastName));
  if (!hasNames) add("displayName","required","Contact needs at least displayName or first/last name");

  if (ct?.email){
    const email = String(ct.email).trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      add("email","format","Invalid email format");
    }
  }
  if (ct?.id && !CON_ID_RE.test(String(ct.id))){
    add("id","format","ContactID must match CON-######");
  }
  if (ct?.companyId && !CMPY_ID_RE.test(String(ct.companyId))){
    add("companyId","format","CompanyID must match CMPY-######");
  }
  return errors;
}

// ---- Bus wiring -------------------------------------------------------------
export function registerWithBus(optionalBus){
  const b = optionalBus || (typeof window !== "undefined" ? window.bus : null);
  if (!b || typeof b.on !== "function" || typeof b.emit !== "function"){
    console.warn("[validation-rules] No compatible bus found. Skipping registration.");
    return () => {};
  }
  const off = b.on("opps.validate.request", ({ draft }) => {
    try{
      const errors = validateOpportunity(draft || {});
      b.emit("opps.validate.result", { ok: errors.length === 0, errors });
    }catch(e){
      console.error("[validation-rules] validate error", e);
      b.emit("opps.validate.result", { ok:false, errors:[{ field:"*", code:"exception", message:String(e?.message||e) }] });
    }
  });
  return off;
}

// Auto-register si souhaité (désactivé par défaut)
// if (typeof window !== "undefined" && window.autoRegisterValidationRules) {
//   try { registerWithBus(); } catch {}
// }
