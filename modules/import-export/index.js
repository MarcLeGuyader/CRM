// modules/import-export/index.js
// Entry point: wire ui.banner.upload / ui.banner.export to import/export functions.

import { importFromFile } from './import.js';
import { exportData } from './export.js';

/**
 * Register listeners on the provided bus.
 * @param {{bus:any, getRows?:()=>Array}} options
 */
export function registerImportExport(options){
  const bus = options?.bus;
  if (!bus || typeof bus.emit !== "function" || typeof bus.on !== "function"){
    throw new Error("registerImportExport requires a bus with on/emit");
  }

  // Hidden input for file picking
  let fileInput = document.getElementById('import-file-input');
  if (!fileInput){
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx';
    fileInput.id = 'import-file-input';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }

  fileInput.onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try{
      await importFromFile(f, { bus });
    }catch(err){
      bus.emit("data.import.report", { ok:false, added:0, updated:0, errors:[{ code:"unexpected", message: String(err?.message || err) }] });
    }finally{
      fileInput.value = ''; // reset so same file can be chosen again
    }
  };

  // Listen to UI intents
  bus.on("ui.banner.upload", () => {
    fileInput.click();
  });

  bus.on("ui.banner.export", (payload) => {
    // Allow passing rows via payload OR via options.getRows OR window.CRM
    const rows = payload?.rows
      || (typeof options.getRows === "function" ? options.getRows() : null)
      || (window.CRM && window.CRM.state && window.CRM.state.rows) || [];
    const format = (payload?.format || "csv").toLowerCase() === "xlsx" ? "xlsx" : "csv";
    try{
      const { url } = exportData(format, { rows, bus });
      // For convenience, trigger a download in the browser automatically
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'csv' ? 'CRM_Opportunities.csv' : 'CRM_Opportunities.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }catch(err){
      bus.emit("data.export.error", { message: String(err?.message || err) });
    }
  });
}
