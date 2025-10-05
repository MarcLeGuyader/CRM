// modules/import-export/import.js
// Import (CSV/XLSX) → parse → validate → emit data.import.report on the provided bus.
// Assumptions:
//  - `bus` is an object with .emit(topic, payload) method (your existing Event Bus).
//  - For .xlsx parsing, `window.XLSX` (SheetJS) must be present in the page.
//  - Validation: IDs, required fields, dates (ISO yyyy-mm-dd), numeric amounts.

export const ALLOWED_STEPS = [
  "Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"
];

// ---- Header normalization (maps many header variants to canonical property names)
function normalizeHeader(h) {
  if (!h) return "";
  let w = String(h).trim().toLowerCase();
  w = w.replace(/[._-]/g," ").replace(/\s+/g," ").trim();
  const map = {
    "opportunity id" : "id",
    "id"             : "id",
    "name"           : "name",
    "opportunity name": "name",
    "title"          : "name",
    "client"         : "client",
    "owner"          : "owner",
    "sales step"     : "salesStep",
    "stage"          : "salesStep",
    "company id"     : "companyId",
    "contact id"     : "contactId",
    "notes"          : "notes",
    "next action"    : "nextAction",
    "next action date": "nextActionDate",
    "closing date"   : "closingDate",
    "closing value"  : "closingValue",
    "amount"         : "closingValue"
  };
  return map[w] || "";
}

// ---- CSV parsing (supports quoted fields, double-quotes escaping)
function splitCsvLine(line){
  const out = [];
  const re = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out.push((m[1] || m[2] || "").replace(/""/g,'"'));
  }
  return out;
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const vals = splitCsvLine(lines[i]);
    const o = {};
    headers.forEach((h,idx) => { if (h) o[h] = vals[idx] ?? ""; });
    rows.push(o);
  }
  return { headers, rows };
}

function parseXLSX(arrayBuffer){
  if (!window.XLSX) throw new Error("XLSX library not found on window.XLSX");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (!aoa || !aoa.length) return { headers: [], rows: [] };
  const headers = (aoa[0] || []).map(normalizeHeader);
  const rows = [];
  for (let i=1;i<aoa.length;i++){
    const arr = aoa[i] || [];
    const o = {};
    headers.forEach((h,idx) => { if (h) o[h] = arr[idx] ?? ""; });
    rows.push(o);
  }
  return { headers, rows };
}

// ---- Validation helpers
const ID_RE = /^OPP-\d{6}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(s){
  if (!s || typeof s !== "string") return false;
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.valueOf()) && s === d.toISOString().slice(0,10);
}

function toNumberOrNaN(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validate a single row (object already canonicalized).
 * Returns an array of errors: { field, code, message }
 */
function validateRow(row, rowIndex){
  const errors = [];

  // Required fields
  if (!row.name || !String(row.name).trim()) {
    errors.push({ row: rowIndex, field: "name", code: "required", message: "Name is required." });
  }
  if (!row.salesStep || !ALLOWED_STEPS.includes(row.salesStep)) {
    errors.push({ row: rowIndex, field: "salesStep", code: "invalidStep", message: `Sales step must be one of: ${ALLOWED_STEPS.join(", ")}` });
  }
  if (!row.client || !String(row.client).trim()) {
    errors.push({ row: rowIndex, field: "client", code: "required", message: "Client is required." });
  }

  // Optional ID format
  if (row.id && !ID_RE.test(String(row.id))) {
    errors.push({ row: rowIndex, field: "id", code: "badId", message: "ID must match OPP-###### or be empty for creation." });
  }

  // Dates
  if (row.nextActionDate && !isIsoDate(String(row.nextActionDate))) {
    errors.push({ row: rowIndex, field: "nextActionDate", code: "badDate", message: "Next action date must be ISO yyyy-mm-dd." });
  }
  if (row.closingDate && !isIsoDate(String(row.closingDate))) {
    errors.push({ row: rowIndex, field: "closingDate", code: "badDate", message: "Closing date must be ISO yyyy-mm-dd." });
  }

  // Numbers
  if (row.closingValue != null && String(row.closingValue).trim() !== "") {
    const n = toNumberOrNaN(row.closingValue);
    if (!Number.isFinite(n) || n < 0) {
      errors.push({ row: rowIndex, field: "closingValue", code: "badNumber", message: "Closing value must be a number ≥ 0." });
    }
  }

  return errors;
}

// Canonicalize a raw row into the Opportunity shape (strings normalized)
function canonicalize(row){
  const out = {
    id:               row.id || "",
    name:             row.name || "",
    salesStep:        row.salesStep || "",
    client:           row.client || "",
    owner:            row.owner || "",
    companyId:        row.companyId || "",
    contactId:        row.contactId || "",
    notes:            row.notes || "",
    nextAction:       row.nextAction || "",
    nextActionDate:   row.nextActionDate || "",
    closingDate:      row.closingDate || "",
    closingValue:     row.closingValue
  };
  // numeric cast if provided
  if (out.closingValue !== undefined && out.closingValue !== "") {
    const n = Number(out.closingValue);
    out.closingValue = Number.isFinite(n) ? n : out.closingValue;
  }
  return out;
}

/**
 * Import a File object (CSV or XLSX).
 * @param {File} file
 * @param {{bus:any}} ctx
 * @returns {Promise<{ok:boolean, added:number, updated:number, errors:Array}>}
 */
export async function importFromFile(file, ctx){
  const bus = ctx?.bus;
  if (!bus || typeof bus.emit !== "function") throw new Error("A bus with emit(topic,payload) is required.");

  bus.emit("data.import.started", { filename: file?.name || "" });

  let parsed = { headers: [], rows: [] };
  try{
    if (!file) throw new Error("No file provided");
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")){
      const text = await file.text();
      parsed = parseCSV(text);
    } else if (lower.endsWith(".xlsx")){
      const buf = await file.arrayBuffer();
      parsed = parseXLSX(buf);
    } else {
      throw new Error("Unsupported file type. Use .csv or .xlsx");
    }
  }catch(err){
    const report = { ok:false, added:0, updated:0, errors:[{ code:"parse", message:String(err?.message || err) }] };
    bus.emit("data.import.report", report);
    return report;
  }

  // Canonicalize + validate
  const rows = parsed.rows.map(canonicalize);
  const errors = [];
  rows.forEach((r, idx) => {
    const rowErrors = validateRow(r, idx+2); // +2: CSV header line + 1-based row
    errors.push(...rowErrors);
  });

  // Prepare success report
  if (errors.length > 0){
    const report = { ok:false, added:0, updated:0, errors };
    bus.emit("data.import.report", report);
    return report;
  }

  // At this layer we don't know added vs updated (Data Orchestrator will decide).
  // We just forward the clean rows.
  const report = { ok:true, added:0, updated:0, rows };
  bus.emit("data.import.report", report);
  return report;
}
