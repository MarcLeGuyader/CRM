/* Opportunities Manager
   Version V3.2 - 03/10/2025 19:10 (French time)
   V3.2: Debug panel toggle, clearer export button text, full English UI.
   Includes robust import, filters, auto IDs, company dropdown, local storage, dialog polyfill.
*/
(() => {
  const DEBUG = true;
  const KEY_ROWS = "opportunities-db-v3";
  const KEY_COMP = "companies-db-v1";

  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  let rows = loadRows();
  let Companies = loadCompanies();
  let editingIndex = -1;

  // Debug panel
  function dbg(...args){
    if (!DEBUG) return;
    console.log("[OppMgr]", ...args);
    const p = document.getElementById('debug-panel');
    const log = document.getElementById('debug-log');
    if (p && log) {
      const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      log.textContent += (log.textContent ? "\n" : "") + line;
      log.scrollTop = log.scrollHeight;
    }
  }

  // Dialog polyfill
  const hasNativeDialog = typeof HTMLDialogElement !== "undefined"
    && HTMLDialogElement.prototype
    && typeof HTMLDialogElement.prototype.showModal === "function"
    && typeof HTMLDialogElement.prototype.close === "function";
  const dlgShow = (d)=> hasNativeDialog ? d.showModal() : d.setAttribute("open","");
  const dlgClose = (d,v)=> hasNativeDialog ? d.close(v||"") : d.removeAttribute("open");

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const tbody = qs('#tbody');
    const filters = {
      q: qs('#q'), client: qs('#f-client'), owner: qs('#f-owner'), step: qs('#f-step'), nextdate: qs('#f-nextdate'),
    };

    // Fill filters
    fillSelect(filters.client, ["", ...ClientList]);
    fillSelect(filters.owner, ["", ...OwnerList]);
    fillSelect(filters.step, ["", ...SalesStepList]);
    Object.values(filters).forEach(el => el && el.addEventListener('input', render));

    // Top bar actions
    on('#btn-new','click', () => openDialog());
    on('#btn-save','click', saveLocal);
    on('#btn-reset','click', resetLocal);
    on('#btn-export-xlsx','click', exportXLSX);
    on('#btn-export-csv','click', exportCSV);
    on('#file-input','change', handleImport);

    // Debug toggle
    const btnDbg = qs('#btn-debug');
    const dbgPanel = qs('#debug-panel');
    const dbgClear = qs('#debug-clear');
    if (btnDbg && dbgPanel) {
      btnDbg.addEventListener('click', () => {
        const hidden = dbgPanel.classList.toggle('hidden');
        btnDbg.setAttribute('aria-expanded', String(!hidden));
        dbgPanel.setAttribute('aria-hidden', String(hidden));
      });
    }
    if (dbgClear) dbgClear.addEventListener('click', () => {
      const log = qs('#debug-log'); if (log) log.textContent = "";
    });

    // Dialog refs
    const dlg = qs('#dlg'); const frm = qs('#frm');
    const btnOk = qs('#dlg-ok'); const btnDel = qs('#dlg-delete'); const btnCancel = qs('#dlg-cancel');
    const fId = qs('#f-id'); const fCoName = qs('#f-company-name'); const fCoId = qs('#f-company-id');

    btnCancel.addEventListener('click', (e)=>{ e.preventDefault(); dlgClose(dlg,'cancel'); });
    btnOk.addEventListener('click', (e)=>{ e.preventDefault();
      const data = formToObj(frm);
      if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"]||"")) { alert("Opportunity.ID must follow OPP-000123"); return; }
      if (editingIndex>=0) rows[editingIndex]=data; else {
        if (rows.some(x=>x["Opportunity.ID"]===data["Opportunity.ID"])) { alert("This ID already exists."); return; }
        rows.push(data);
      }
      dlgClose(dlg,'ok'); render(); saveLocal();
    });
    btnDel.addEventListener('click', (e)=>{ e.preventDefault();
      if (editingIndex<0) return;
      if (!confirm("Delete this opportunity?")) return;
      rows.splice(editingIndex,1);
      dlgClose(dlg,'delete'); render(); saveLocal();
    });

    refreshCompanySelect();
    if (fCoName) fCoName.addEventListener('change', ()=>{ const n=fCoName.value; if (Companies[n]) fCoId.value=Companies[n]; });

    render();
    status("Ready. Use Import to load your Excel file.");
    dbg("App started", {rows: rows.length, companies: Object.keys(Companies).length});
  }

  // Rendering
  function render() {
    const tbody = qs('#tbody'); if (!tbody) return;
    tbody.innerHTML = "";
    const q = (qs('#q')?.value||"").trim().toLowerCase();
    const fClient = qs('#f-client')?.value || "";
    const fOwner  = qs('#f-owner')?.value  || "";
    const fStep   = qs('#f-step')?.value   || "";
    const fNext   = qs('#f-nextdate')?.value ? new Date(qs('#f-nextdate').value) : null;

    const filtered = rows.filter(r=>{
      if (fClient && r["Opportunity.Client"]!==fClient) return false;
      if (fOwner  && r["Opportunity.Owner"]!==fOwner ) return false;
      if (fStep   && r["Opportunity.SalesStep"]!==fStep) return false;
      if (fNext)  { const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null; if(!d||d<fNext) return false; }
      if (q) {
        if (q==="overdue") {
          const t=new Date(); t.setHours(0,0,0,0);
          const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null;
          if (!(d && d<t)) return false;
        } else {
          const hay=(Object.values(r).join(" ")+"").toLowerCase();
          if (!hay.includes(q)) return false;
        }
      }
      return true;
    });

    for (const r of filtered) {
      const tr=document.createElement('tr');
      const keys=[
        "Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client",
        "Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate",
        "Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"
      ];
      for (const k of keys) { const td=document.createElement('td'); td.textContent=r[k]||""; tr.appendChild(td); }
      const tdA=document.createElement('td'); tdA.className="row-actions";
      const bE=document.createElement('button'); bE.textContent="✏️"; bE.title="Edit"; bE.addEventListener('click',()=>openDialog(r));
      const bD=document.createElement('button'); bD.textContent="🗑"; bD.title="Delete"; bD.addEventListener('click',()=>delRow(r));
      tdA.append(bE,bD); tr.appendChild(tdA); tbody.appendChild(tr);
    }
    status(`${filtered.length} opportunity(ies) shown / ${rows.length}`);
  }

  // CRUD
  function openDialog(row) {
    const frm = qs('#frm'); const dlg = qs('#dlg'); const fId = qs('#f-id');
    const btnDel = qs('#dlg-delete'); const fCoName = qs('#f-company-name'); const fCoId = qs('#f-company-id');

    frm.reset(); editingIndex=-1;
    fillSelect(qs('#c-client'), ClientList);
    fillSelect(qs('#c-owner'), OwnerList);
    fillSelect(qs('#c-step'), SalesStepList);
    refreshCompanySelect();

    if (!row) {
      fId.value = nextId();
      btnDel.style.display="none";
      setText('#dlg-title',"New opportunity");
      if (fCoName) fCoName.value=""; if (fCoId) fCoId.value="";
    } else {
      editingIndex = rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
      for (const el of frm.elements) { if (el.name && row[el.name]!=null) el.value=row[el.name]; }
      const name = Object.keys(Companies).find(n=>Companies[n]===row["Opportunity.CompanyID"]);
      if (fCoName) fCoName.value = name || "";
      btnDel.style.display="inline-block";
      setText('#dlg-title',"Edit opportunity");
    }
    dlgShow(dlg);
  }

  function delRow(row) {
    const idx=rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
    if (idx>=0 && confirm("Delete this opportunity?")) { rows.splice(idx,1); render(); saveLocal(); }
  }

  // Import / Export
  async function handleImport(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (!window.XLSX) { alert("Excel library not loaded."); return; }

    dbg("Import start:", file.name);
    try {
      const buf = await file.arrayBuffer();
      let rowsIn = [], companiesIn = {};

      if (file.name.toLowerCase().endsWith(".csv")) {
        const txt = new TextDecoder("utf-8").decode(new Uint8Array(buf));
        const lines = txt.split(/\r?\n/).filter(Boolean);
        if (!lines.length) { status("No lines detected in CSV."); ev.target.value=""; return; }
        const rawHeaders = lines[0].split(",").map(h => h.trim());
        const headers = rawHeaders.map(normalizeHeader);
        dbg("CSV headers(raw):", rawHeaders, "mapped:", headers);
        for (let i = 1; i < lines.length; i++) {
          const vals = parseCSVLine(lines[i]);
          const obj = {};
          headers.forEach((h, idx) => { if (h) obj[h] = vals[idx] ?? ""; });
          rowsIn.push(obj);
        }
      } else {
        const wb = XLSX.read(buf, { type: "array" });
        dbg("Sheets:", wb.SheetNames);
        const oppWS = wb.Sheets["Opportunities"] || wb.Sheets[wb.SheetNames[0]];
        if (!oppWS) { alert("No worksheet found in Excel."); ev.target.value=""; return; }
        const aoa = XLSX.utils.sheet_to_json(oppWS, { header: 1 });
        if (!aoa || !aoa.length) { status("'Opportunities' sheet is empty."); ev.target.value=""; return; }
        const rawHeaders = (aoa[0] || []).map(h => (h ?? "").toString().trim());
        const headers = rawHeaders.map(normalizeHeader);
        dbg("XLSX headers(raw):", rawHeaders, "mapped:", headers);
        for (let i = 1; i < aoa.length; i++) {
          const row = aoa[i]; if (!row || !row.length) continue;
          const obj = {};
          headers.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? ""; });
          rowsIn.push(obj);
        }
        const compWS = wb.Sheets["Companies"];
        if (compWS) {
          const ca = XLSX.utils.sheet_to_json(compWS, { header: 1 });
          for (let i = 1; i < ca.length; i++) {
            const r = ca[i];
            const name = (r[0] ?? "").toString().trim();
            const id = (r[1] ?? "").toString().trim();
            if (name && id) companiesIn[name] = id;
          }
        }
      }

      // Filter empty lines
      rowsIn = rowsIn.filter(r => Object.values(r).some(v => (v ?? "") !== ""));
      dbg("Parsed rows:", rowsIn.length, "Companies:", Object.keys(companiesIn).length);

      if (!rowsIn.length) {
        alert("No readable data: check sheet name and headers.");
        ev.target.value = "";
        return;
      }

      let added = 0, updated = 0;
      for (const r of rowsIn) {
        if (!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"] || "")) {
          r["Opportunity.ID"] = nextId();
        }
        const idx = rows.findIndex(x => x["Opportunity.ID"] === r["Opportunity.ID"]);
        if (idx >= 0) { rows[idx] = r; updated++; } else { rows.push(r); added++; }
      }
      for (const [n,id] of Object.entries(companiesIn)) Companies[n] = id;

      saveLocal();
      render();
      status(`Import OK: ${added} added, ${updated} updated. Companies: ${Object.keys(companiesIn).length}.`);
      dbg("Import done.", {added, updated, companies: Object.keys(companiesIn).length});
    } catch (err) {
      console.error(err);
      alert("Import error. Make sure the file is not protected and the first row contains headers.");
      dbg("Import error", err && err.message ? err.message : err);
    } finally {
      ev.target.value = "";
    }
  }

  // Header normalization
  function normalizeHeader(h) {
    if (!h) return "";
    const s = h.toString().trim().toLowerCase().replace(/\s+/g," ");
    const map = {
      "opportunity.id": "Opportunity.ID",
      "id": "Opportunity.ID",
      "opportunity id": "Opportunity.ID",

      "opportunity.name": "Opportunity.Name",
      "name": "Opportunity.Name",

      "opportunity.client": "Opportunity.Client",
      "client": "Opportunity.Client",

      "opportunity.salesstep": "Opportunity.SalesStep",
      "salesstep": "Opportunity.SalesStep",
      "step": "Opportunity.SalesStep",

      "opportunity.nextactiondate": "Opportunity.NextActionDate",
      "nextactiondate": "Opportunity.NextActionDate",
      "next action date": "Opportunity.NextActionDate",

      "opportunity.nextaction": "Opportunity.NextAction",
      "nextaction": "Opportunity.NextAction",
      "next action": "Opportunity.NextAction",

      "opportunity.companyid": "Opportunity.CompanyID",
      "companyid": "Opportunity.CompanyID",

      "opportunity.contactid": "Opportunity.ContactID",
      "contactid": "Opportunity.ContactID",

      "opportunity.owner": "Opportunity.Owner",
      "owner": "Opportunity.Owner",

      "opportunity.closingdate": "Opportunity.ClosingDate",
      "closingdate": "Opportunity.ClosingDate",

      "opportunity.closingvalue": "Opportunity.ClosingValue",
      "closingvalue": "Opportunity.ClosingValue",

      "opportunity.notes": "Opportunity.Notes",
      "notes": "Opportunity.Notes"
    };
    return map[s] || "";
  }

  // Export
  async function exportXLSX() {
    if (!window.XLSX) { alert("Excel library not loaded."); return; }
    const wb=XLSX.utils.book_new();
    const headers=["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const data=[headers, ...rows.map(r=>headers.map(h=>r[h]??""))];
    const ws=XLSX.utils.aoa_to_sheet(data); XLSX.utils.book_append_sheet(wb, ws, "Opportunities");

    const comp=Object.entries(Companies);
    if (comp.length) { const ch=["Company.Name","Company.ID"]; const cd=[ch, ...comp.map(([n,id])=>[n,id])]; const cws=XLSX.utils.aoa_to_sheet(cd); XLSX.utils.book_append_sheet(wb, cws, "Companies"); }

    const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    saveAs(new Blob([out],{type:"application/octet-stream"}),"Opportunities.xlsx");
  }

  async function exportCSV() {
    const headers=["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const lines=[headers.join(","), ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    saveAs(blob,"Opportunities.csv");
  }

  // Utils
  function nextId(){ const p="OPP-"; let max=0; for(const r of rows){ const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||""); if(m){ const n=parseInt(m[1],10); if(n>max) max=n; } } return p + String(max+1).padStart(6,"0"); }
  function csvEscape(v){ if(v==null) return ""; const s=String(v); return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; }
  function parseCSVLine(line){ const out=[], re=/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g; let m; while((m=re.exec(line))!==null) out.push((m[1]||m[2]||"").replace(/""/g,'"')); return out; }

  function qs(s){return document.querySelector(s);}
  function on(s,ev,cb){const el=qs(s); if(el) el.addEventListener(ev,cb);}
  function setText(s,txt){const el=qs(s); if(el) el.textContent=txt;}
  function status(msg){const el=qs('#status'); if(el) el.textContent=msg;}

  function fillSelect(sel, arr){ if(!sel) return; sel.innerHTML=""; for(const v of arr){ const o=document.createElement('option'); o.value=v; o.textContent=v||"(all)"; sel.appendChild(o); } }
  function loadRows(){ try{return JSON.parse(localStorage.getItem(KEY_ROWS))||[];}catch{return[];} }
  function loadCompanies(){ try{return JSON.parse(localStorage.getItem(KEY_COMP))||{};}catch{return{};} }
  function saveLocal(){ localStorage.setItem(KEY_ROWS, JSON.stringify(rows)); localStorage.setItem(KEY_COMP, JSON.stringify(Companies)); status("Data saved locally."); }
  function resetLocal(){ if(!confirm("Reset local data?")) return; localStorage.removeItem(KEY_ROWS); localStorage.removeItem(KEY_COMP); rows=[]; Companies={}; status("Local storage reset."); }
})();
