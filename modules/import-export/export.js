// modules/import-export/export.js
// Export data to CSV or XLSX and emit data.export.done with a blob URL.
// The caller must provide the rows (array of Opportunities) OR a getter.

function toCsvValue(v){
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

function toCSV(rows){
  const headers = ["ID","Name","Sales step","Client","Owner","Company ID","Contact ID","Notes","Next action","Next action date","Closing date","Closing value"];
  const keys    = ["id","name","salesStep","client","owner","companyId","contactId","notes","nextAction","nextActionDate","closingDate","closingValue"];
  const body = (rows || []).map(r => keys.map(k => toCsvValue(r?.[k] ?? "")).join(",")).join("\n");
  return headers.join(",") + "\n" + body;
}

function toXLSX(rows){
  if (!window.XLSX) throw new Error("XLSX library not found on window.XLSX");
  const headers = ["ID","Name","Sales step","Client","Owner","Company ID","Contact ID","Notes","Next action","Next action date","Closing date","Closing value"];
  const keys    = ["id","name","salesStep","client","owner","companyId","contactId","notes","nextAction","nextActionDate","closingDate","closingValue"];
  const aoa = [headers, ...(rows||[]).map(r => keys.map(k => r?.[k] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Opportunities");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

/**
 * Export helper
 * @param {'csv'|'xlsx'} format
 * @param {{rows?:Array, getRows?:()=>Array, bus:any}} ctx
 * @returns {{url:string, format:string}}
 */
export function exportData(format, ctx){
  const bus = ctx?.bus;
  if (!bus || typeof bus.emit !== "function") throw new Error("A bus with emit(topic,payload) is required.");

  const rows = Array.isArray(ctx?.rows) ? ctx.rows : (typeof ctx?.getRows === "function" ? ctx.getRows() : []);
  if (!Array.isArray(rows)) throw new Error("rows/getRows must provide an array.");

  if (format === "csv"){
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    bus.emit("data.export.done", { format:"csv", url });
    return { url, format:"csv" };
  }
  if (format === "xlsx"){
    const buf = toXLSX(rows);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    bus.emit("data.export.done", { format:"xlsx", url });
    return { url, format:"xlsx" };
  }
  throw new Error("Unsupported format. Use 'csv' or 'xlsx'.");
}
