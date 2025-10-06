// modules/validation-rules/validation-rules.js
// CRM Validation Rules module (framework-agnostic, ES module)
/*
  Exports:
    - allowedSalesSteps: string[]
    - validateOpportunity(draft): FieldError[]
    - validateCompany(company): FieldError[]
    - validateContact(contact): FieldError[]
    - registerWithBus(bus?): void   // listens to 'opps.validate.request' and emits 'opps.validate.result'
  Types:
    FieldError = { field: string, code: string, message: string }
*/

export const allowedSalesSteps = [
  "Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"
];

const ID_RE = /^OPP-\d{6}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s) {
  if (typeof s !== "string" || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function asNumber(n) {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : NaN;
}

export function validateOpportunity(draft) {
  /** @type {Array<{field:string, code:string, message:string}>} */
  const errors = [];
  const add = (field, code, message) => errors.push({ field, code, message });

  // id (optional on create, but if provided must be valid)
  if (draft.id != null && String(draft.id).trim() !== "") {
    if (!ID_RE.test(String(draft.id))) add("id","format","ID must match OPP-######");
  }

  // name
  if (!draft.name || !String(draft.name).trim()) add("name","required","Name is required");

  // client
  if (!draft.client || !String(draft.client).trim()) add("client","required","Client is required");

  // owner
  if (!draft.owner || !String(draft.owner).trim()) add("owner","required","Owner is required");

  // salesStep
  if (!draft.salesStep || !allowedSalesSteps.includes(String(draft.salesStep))) {
    add("salesStep","invalid","Sales step must be one of: " + allowedSalesSteps.join(", "));
  }

  // numeric: closingValue >= 0
  if (draft.closingValue !== undefined) {
    const v = asNumber(draft.closingValue);
    if (Number.isNaN(v)) add("closingValue","nan","Closing value must be a number");
    else if (v < 0) add("closingValue","range","Closing value must be >= 0");
  }

  // dates
  if (draft.nextActionDate != null && String(draft.nextActionDate).trim() !== "" && !isIsoDate(String(draft.nextActionDate))) {
    add("nextActionDate","date","Next action date must be ISO yyyy-mm-dd");
  }
  if (draft.closingDate != null && String(draft.closingDate).trim() !== "" && !isIsoDate(String(draft.closingDate))) {
    add("closingDate","date","Closing date must be ISO yyyy-mm-dd");
  }

  // step/date coherence
  if (draft.salesStep === "Won") {
    if (!draft.closingDate || !isIsoDate(String(draft.closingDate))) {
      add("closingDate","required_when_won","Closing date is required when stage is Won");
    }
  }

  // timeline coherence
  if (draft.nextActionDate && draft.closingDate && isIsoDate(String(draft.nextActionDate)) && isIsoDate(String(draft.closingDate))) {
    const na = new Date(draft.nextActionDate + "T00:00:00Z").getTime();
    const cd = new Date(draft.closingDate + "T00:00:00Z").getTime();
    if (na > cd) add("nextActionDate","afterClosing","Next action date must not be after closing date");
  }

  // references presence (existence of IDs checked elsewhere by Orchestrator)
  if (draft.companyId != null && String(draft.companyId).trim() === "") {
    add("companyId","empty","If provided, companyId cannot be empty");
  }
  if (draft.contactId != null && String(draft.contactId).trim() === "") {
    add("contactId","empty","If provided, contactId cannot be empty");
  }

  return errors;
}

export function validateCompany(c) {
  const errors = [];
  if (!c || !c.name || !String(c.name).trim()) {
    errors.push({ field:"name", code:"required", message:"Company name is required" });
  }
  if (c.id != null && String(c.id).trim() === "") {
    errors.push({ field:"id", code:"empty","message":"If provided, id cannot be empty"});
  }
  return errors;
}

export function validateContact(ct) {
  const errors = [];
  const hasNames = (ct && (ct.displayName || ct.firstName || ct.lastName)) ? true : false;
  if (!hasNames) {
    errors.push({ field:"displayName", code:"required", message:"Contact needs at least displayName or first/last name" });
  }
  if (ct && ct.email) {
    const email = String(ct.email).trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push({ field:"email", code:"format", message:"Invalid email format" });
    }
  }
  if (ct && ct.companyId != null && String(ct.companyId).trim() === "") {
    errors.push({ field:"companyId", code:"empty", message:"If provided, companyId cannot be empty" });
  }
  return errors;
}

/**
 * registerWithBus(bus?): wire 'opps.validate.request' → 'opps.validate.result'
 * - By default it tries window.bus
 */
export function registerWithBus(optionalBus) {
  // Prefer explicit bus, else window.bus
  const b = optionalBus || (typeof window !== "undefined" ? window.bus : null);
  if (!b || typeof b.on !== "function" || typeof b.emit !== "function") {
    console.warn("[validation-rules] No compatible bus found. Skipping registration.");
    return () => {};
  }
  const off = b.on("opps.validate.request", ({ draft }) => {
    try {
      const errors = validateOpportunity(draft || {});
      b.emit("opps.validate.result", { ok: errors.length === 0, errors });
    } catch (e) {
      console.error("[validation-rules] validate error", e);
      b.emit("opps.validate.result", { ok:false, errors:[{ field:"*", code:"exception", message:String(e&&e.message||e)}] });
    }
  });
  console.log("[validation-rules] Registered on bus for 'opps.validate.request'");
  return off;
}

// Auto-register if window.autoRegisterValidationRules is true
if (typeof window !== "undefined" && window.autoRegisterValidationRules) {
  try { registerWithBus(); } catch {}
}
