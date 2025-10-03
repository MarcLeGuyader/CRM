/* CRM
   Version V3.3.2 - 03/10/2025 20:58 (French time)
   Changes vs V3.3.1:
   - Hide empty rows (require Opportunity.Name)
   - Show Company & Contact display names; Contact = First « Last » if available
   - SalesCycleLastChangeDate removed from grid (leave it in dialog only)
   - Top-left toggle to show/hide Filters (⟷ Filters)
   - More tolerant Contacts import (DisplayName / FullName OR First/Last + ID)
   - Debug panel: Copy & Clear
*/
(() => {
  const DEBUG = true;

  // LocalStorage keys
  const KEY_ROWS = "opportunities-db-v3";
  const KEY_COMP = "companies-db-v1";        // Company.Name -> Company.ID
  const KEY_CONT = "contacts-db-v1";         // Contact.Name  -> Contact.ID
  const KEY_COMP_INFO = "companies-info-v1"; // Company.ID   -> {name}
  const KEY_CONT_INFO = "contacts-info-v1";  // Contact.ID   -> {name,first,last}

  // Static lists (can be overridden by Excel later if desired)
  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  // In-memory state
  let rows      = load(KEY_ROWS, []);
  let Companies = load(KEY_COMP, {});      // name -> id
  let Contacts  = load(KEY_CONT, {});      // name -> id
  let CompInfo  = load(KEY_COMP_INFO, {}); // id -> {name}
  let ContInfo  = load(KEY_CONT_INFO, {}); // id -> {name,first,last}
  let editingIndex = -1;

  // Dialog polyfill (for iPad/Safari)
  const hasNativeDialog = typeof HTMLDialogElement!=="undefined"
    && HTMLDialogElement.prototype.showModal
    && HTMLDialogElement.prototype.close;
  const dlgShow  = d => hasNativeDialog ? d.showModal() : d.setAttribute("open", "");
  const dlgClose = (d,v) => hasNativeDialog ? d.close(v||"") : d.removeAttribute("open");

  document.addEventListener("DOMContentLoaded", init);

  function init(){
    // Filters
    fillSelect(q('#f-client'), ["", ...ClientList]);
    fillSelect(q('#f-owner'),  ["", ...OwnerList]);
    fillSelect(q('#f-step'),   ["", ...SalesStepList]);
    ['#q','#f-client','#f-owner','#f-step','#f-nextdate'].forEach(sel => {
      const el = q(sel); if (el) el.addEventListener('input', render);
    });

    // Top bar actions
    on('#btn-toggle-filters','click', toggleFilters);
    on('#btn-new','click', () => openDialog());
    on('#btn-save','click', saveLocal);
    on('#btn-reset','click', resetLocal);
    on('#btn-export-xlsx','click', exportXLSX);
    on('#btn-export-csv','click', exportCSV);
    on('#file-input','change', handleImport);

    // Debug panel
    const btnDbg = q('#btn-debug');
    const dbgPanel = q('#debug-panel');
    on('#btn-debug','click', () => {
      const hidden = dbgPanel.classList.toggle('hidden');
      btnDbg.setAttribute('aria-expanded', String(!hidden));
      dbgPanel.setAttribute('aria-hidden', String(hidden));
    });
    on('#debug-clear','click', () => { const log=q('#debug-log'); if (log) log.textContent=""; });
    on('#debug-copy','click', async () => {
      const log=q('#debug-log'); if (!log) return;
      try {
        await navigator.clipboard.writeText(log.textContent||"");
        alert("Debug log copied to clipboard.");
      } catch {
        const r=document.createRange(); r.selectNodeContents(log);
        const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        document.execCommand("copy"); sel.removeAllRanges();
        alert("Debug log selected. If copying failed, long-press and Copy.");
      }
    });

    // Dialog events
    const dlg = q('#dlg'), frm = q('#frm');
    const fCoName=q('#f-company-name'), fCoId=q('#f-company-id');
    const fCtName=q('#f-contact-name'), fCtId=q('#f-contact-id');

    on('#dlg-cancel','click', ev => { ev.preventDefault(); dlgClose(dlg,'cancel'); });
    on('#dlg-ok','click', ev => {
      ev.preventDefault();
      const data=formToObj(frm);
      if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"]||"")) data["Opportunity.ID"]=nextId();
      if (editingIndex>=0) {
        rows[editingIndex]=data;
      } else {
        if (rows.some(x=>x["Opportunity.ID"]===data["Opportunity.ID"])) {
          alert("This ID already exists."); return;
        }
        rows.push(data);
      }
      dlgClose(dlg,'ok'); render(); saveLocal();
    });

    // Link select name -> ID in dialog
    if (fCoName) fCoName.addEventListener('change', () => { const n=fCoName.value; if (Companies[n]) fCoId.value=Companies[n]; });
    if (fCtName) fCtName.addEventListener('change', () => { const n=fCtName.value; if (Contacts[n])  fCtId.value=Contacts[n];  });

    // First render
    refreshCompanySelect(); refreshContactSelect();
    render();
    status("Ready. Use 'Upload Excel' to load your file.");
    dbg("App started", {rows: rows.length, companies: Object.keys(Companies).length, contacts: Object.keys(Contacts).length});
  }

  // Toggle filters sidebar
  function toggleFilters(){
    const container = q('main.container');
    const panel = q('#filters-panel');
    const off = container.classList.toggle('no-filters');
    if (panel) panel.style.display = off ? 'none' : '';
  }

  // ======== RENDER TABLE ========
  function render(){
    const tb=q('#tbody'); if (!tb) return; tb.innerHTML="";

    const qv=(q('#q')?.value||"").trim().toLowerCase();
    const fClient=q('#f-client')?.value||"";
    const fOwner=q('#f-owner')?.value||"";
    const fStep=q('#f-step')?.value||"";
    const fNext=q('#f-nextdate')?.value ? new Date(q('#f-nextdate').value) : null;

    const filtered = rows.filter(r=>{
      const name=((r["Opportunity.Name"]||"")+"").trim();
      if (!name) return false; // hide empty rows
      if (fClient && r["Opportunity.Client"]!==fClient) return false;
      if (fOwner && r["Opportunity.Owner"]!==fOwner) return false;
      if (fStep && r["Opportunity.SalesStep"]!==fStep) return false;
      if (fNext) { const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null; if(!d||d<fNext) return false; }
      if (qv) {
        if (qv==="overdue") {
          const t=new Date(); t.setHours(0,0,0,0);
          const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null;
          if (!(d && d<t)) return false;
        } else {
          const hay=(Object.values(r).join(" ")+"").toLowerCase();
          if (!hay.includes(qv)) return false;
        }
      }
      return true;
    });

    for (const r of filtered) {
      const tr=document.createElement('tr');

      // Edit icon at row start
      const tdIcon=document.createElement('td');
      const bE=document.createElement('button');
      bE.textContent="✏️"; bE.title="Edit";
      bE.addEventListener('click',()=>openDialog(r));
      tdIcon.appendChild(bE); tr.appendChild(tdIcon);

      // Resolve names
      const compId=((r["Opportunity.CompanyID"]||"")+"").trim();
      const contId=((r["Opportunity.ContactID"]||"")+"").trim();

      const compName = companyNameFromId(compId);
      const contName = contactDisplay(contId);

      // Columns: (SalesCycleLastChangeDate intentionally removed)
      const cells = [
        r["Opportunity.Name"]||"",
        compName,
        contName,
        r["Opportunity.Client"]||"",
        r["Opportunity.Owner"]||"",
        r["Opportunity.SalesStep"]||"",
        r["Opportunity.NextActionDate"]||"",
        r["Opportunity.NextAction"]||"",
        r["Opportunity.ClosingDate"]||"",
        r["Opportunity.ClosingValue"]||"",
        r["Opportunity.Notes"]||""
      ];

      for (const val of cells) {
        const td=document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }

    status(`${filtered.length} opportunity(ies) shown / ${rows.length}`);
  }

  // ======== NAME RESOLUTION ========
  function companyNameFromId(id){
    const idt=(id||"").toString().trim();
    if (!idt) return "";
    if (CompInfo[idt]?.name) return CompInfo[idt].name;
    for (const [name, cid] of Object.entries(Companies)) {
      if (String(cid).trim()===idt) {
        CompInfo[idt] = {name};
        saveLocal();
        return name;
      }
    }
    return "";
  }

  // Contact display as First « Last » when available; fallback to Name
  function contactDisplay(id){
    const idt=(id||"").toString().trim();
    if (!idt) return "";
    const info = ContInfo[idt];
    if (info) {
      const first=(info.first||"").trim();
      const last =(info.last ||"").trim();
      const name =(info.name ||"").trim();
      if (first || last) return `${first} « ${last} »`.trim();
      return name;
    }
    // fallback using Contacts (Name -> ID)
    for (const [name, cid] of Object.entries(Contacts)) {
      if (String(cid).trim()===idt) return name;
    }
    return "";
  }

  // ======== DIALOG ========
  function openDialog(row){
    const dlg=q('#dlg'), frm=q('#frm');
    const fId=q('#f-id');
    const fCoName=q('#f-company-name'), fCoId=q('#f-company-id');
    const fCtName=q('#f-contact-name'), fCtId=q('#f-contact-id');

    frm.reset(); editingIndex=-1;

    // Refill dropdowns
    fillSelect(q('#c-client'), ClientList);
    fillSelect(q('#c-owner'),  OwnerList);
    fillSelect(q('#c-step'),   SalesStepList);
    refreshCompanySelect();
    refreshContactSelect();

    if (!row) {
      fId.value = nextId();
      setText('#dlg-title',"New");
      if (fCoName) fCoName.value=""; if (fCoId) fCoId.value="";
      if (fCtName) fCtName.value=""; if (fCtId) fCtId.value="";
    } else {
      editingIndex = rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
      for (const el of frm.elements) {
        if (el.name && row[el.name]!=null) el.value=row[el.name];
      }
      const compNm = companyNameFromId((row["Opportunity.CompanyID"]||"").toString().trim());
      const contNm = contactDisplay((row["Opportunity.ContactID"]||"").toString().trim());
      if (fCoName) fCoName.value = compNm || "";
      if (fCtName) fCtName.value = contNm || "";
      setText('#dlg-title',"Edit");
    }
    dlgShow(dlg);
  }

  // ======== IMPORT / EXPORT ========
  async function handleImport(ev){
    const file=ev.target.files[0]; if(!file) return;
    if (!window.XLSX) { alert("Excel library not loaded."); return; }
    dbg("Import start:", file.name);
    try {
      const buf=await file.arrayBuffer();
      let rowsIn=[], companiesIn={}, contactsIn={}, compInfoIn={}, contInfoIn={};

      if (file.name.toLowerCase().endsWith(".csv")) {
        // CSV
        const txt=new TextDecoder("utf-8").decode(new Uint8Array(buf));
        const lines=txt.split(/\r?\n/).filter(Boolean);
        if (!lines.length) { status("No lines detected in CSV."); ev.target.value=""; return; }
        const rawHeaders=lines[0].split(",").map(h=>h.trim());
        const headers=rawHeaders.map(normalizeHeader);
        dbg("CSV headers(raw):", rawHeaders, "mapped:", headers);
        for (let i=1;i<lines.length;i++){
          const vals=parseCSVLine(lines[i]);
          const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=vals[idx]??""; });
          rowsIn.push(obj);
        }
      } else {
        // XLSX
        const wb=XLSX.read(buf,{type:"array"});
        dbg("Sheets:", wb.SheetNames);

        // Opportunities
        const oppWS=wb.Sheets["Opportunities"]||wb.Sheets[wb.SheetNames[0]];
        if (oppWS) {
          const aoa=XLSX.utils.sheet_to_json(oppWS,{header:1});
          if (aoa && aoa.length) {
            const rawHeaders=(aoa[0]||[]).map(h=>(h??"").toString().trim());
            const headers=rawHeaders.map(normalizeHeader);
            dbg("Opportunities headers(raw):", rawHeaders, "mapped:", headers);
            for(let i=1;i<aoa.length;i++){
              const r=aoa[i]; if(!r||!r.length) continue;
              const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=r[idx]??""; });
              rowsIn.push(obj);
            }
          }
        }

        // Companies -> name->id and id->name
        const compWS=wb.Sheets["Companies"];
        if (compWS) {
          const ca=XLSX.utils.sheet_to_json(compWS,{header:1});
          for(let i=1;i<ca.length;i++){
            const r=ca[i];
            const name=(r[0]??"").toString().trim();
            const id  =(r[1]??"").toString().trim();
            if (name && id) { companiesIn[name]=id; compInfoIn[id]={name}; }
          }
        }

        // Contacts tolerant: detect name/id OR first/last/id
        const contWS=wb.Sheets["Contacts"];
        if (contWS) {
          const ca=XLSX.utils.sheet_to_json(contWS,{header:1});
          if (ca && ca.length) {
            const headers=(ca[0]||[]).map(h=>(h??"").toString().trim());
            const hdrL=headers.map(h=>h.toLowerCase());
            let nameIdx = hdrL.findIndex(h => /(^|\b)(displayname|fullname|name)(\b|$)/.test(h));
            let firstIdx= hdrL.findIndex(h => /(^|\b)first(name)?(\b|$)/.test(h));
            let lastIdx = hdrL.findIndex(h => /(^|\b)last(name)?(\b|$)/.test(h));
            let idIdx   = hdrL.findIndex(h => /(^|\b)id(\b|$)/.test(h));
            if (idIdx<0) idIdx=1; // fallback
            const buildFromFirstLast = (nameIdx<0 && firstIdx>=0 && lastIdx>=0);
            dbg("Contacts headers:", headers, { nameIdx, firstIdx, lastIdx, idIdx, buildFromFirstLast });

            for (let i=1;i<ca.length;i++){
              const r=ca[i]||[];
              const id=(r[idIdx]??"").toString().trim();
              let name=""; let first=""; let last="";
              if (buildFromFirstLast) {
                first=(r[firstIdx]??"").toString().trim();
                last =(r[lastIdx] ??"").toString().trim();
                name=[first,last].filter(Boolean).join(" ").trim();
              } else if (nameIdx>=0) {
                name=(r[nameIdx]??"").toString().trim();
              }
              if (id && (name || first || last)) {
                contactsIn[name || ([first,last].filter(Boolean).join(" ").trim())] = id;
                contInfoIn[id] = { name, first, last };
              }
            }
          }
        }
      }

      // Clean empty opps
      rowsIn = rowsIn.filter(r => (r["Opportunity.Name"]||"").toString().trim().length>0);

      dbg("Parsed rows:", rowsIn.length, "Companies:", Object.keys(companiesIn).length, "Contacts:", Object.keys(contInfoIn).length);

      if (!rowsIn.length && !Object.keys(companiesIn).length && !Object.keys(contInfoIn).length) {
        alert("No readable data: check sheet names and headers."); ev.target.value=""; return;
      }

      // Merge into memory
      let added=0, updated=0;
      for (const r of rowsIn){
        if (!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"]||"")) r["Opportunity.ID"]=nextId();
        const idx=rows.findIndex(x=>x["Opportunity.ID"]===r["Opportunity.ID"]);
        if (idx>=0) { rows[idx]=r; updated++; } else { rows.push(r); added++; }
      }
      Object.assign(Companies, companiesIn);
      Object.assign(Contacts,  contactsIn);
      Object.assign(CompInfo,  compInfoIn);
      Object.assign(ContInfo,  contInfoIn);

      saveLocal(); render();
      status(`Import OK: ${added} added, ${updated} updated. Companies: ${Object.keys(companiesIn).length}. Contacts: ${Object.keys(contInfoIn).length}.`);
      dbg("Import done.", {added, updated, companies:Object.keys(companiesIn).length, contacts:Object.keys(contInfoIn).length});
    } catch(err) {
      console.error(err);
      alert("Import error. Make sure the file is not protected and the first row contains headers.");
      dbg("Import error", err && err.message ? err.message : err);
    } finally {
      ev.target.value="";
    }
  }

  // Header normalization for Opportunities
  function normalizeHeader(h){
    if (h == null) return "";
    let w=String(h).trim().toLowerCase();
    const parts=w.split(".");
    const known=new Set(["opportunities","opportunity","companies","contacts","validationlists"]);
    if (parts.length>1 && known.has(parts[0])) w=parts.slice(1).join(".");
    w=w.replace(/[.\-_]/g," ").replace(/\s+/g," ").trim();

    const map={
      "opportunity id":"Opportunity.ID","opportunityid":"Opportunity.ID","id":"Opportunity.ID",
      "name":"Opportunity.Name","owner":"Opportunity.Owner",
      "next action date":"Opportunity.NextActionDate","nextactiondate":"Opportunity.NextActionDate",
      "next action":"Opportunity.NextAction","nextaction":"Opportunity.NextAction",
      "notes":"Opportunity.Notes",
      "company id":"Opportunity.CompanyID","companyid":"Opportunity.CompanyID",
      "lead source":"Opportunity.LeadSource","leadsource":"Opportunity.LeadSource",
      "client":"Opportunity.Client",
      "contact id":"Opportunity.ContactID","contactid":"Opportunity.ContactID",
      "sales step":"Opportunity.SalesStep","salesstep":"Opportunity.SalesStep",
      "closing date":"Opportunity.ClosingDate","closingdate":"Opportunity.ClosingDate",
      "closing value":"Opportunity.ClosingValue","closingvalue":"Opportunity.ClosingValue",
      "sales cycle last change date":"Opportunity.SalesCycleLastChangeDate","salescyclelastchangedate":"Opportunity.SalesCycleLastChangeDate"
    };

    if (map[w]) return map[w];
    if (/^opportunity[a-z]/.test(w)){
      const tail=w.replace(/^opportunity/,"").trim();
      return map[tail] || map[tail.replace(/\s+/g,"")] || (tail==="id" ? "Opportunity.ID" : "");
    }
    return "";
  }

  // ======== EXPORT ========
  async function exportXLSX(){
    if (!window.XLSX) { alert("Excel library not loaded."); return; }
    const wb=XLSX.utils.book_new();
    const headers=[
      "Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID",
      "Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep",
      "Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"
    ];
    const data=[headers, ...rows.map(r=>headers.map(h=>r[h]??""))];
    const ws=XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Opportunities");

    const comp=Object.entries(Companies);
    if (comp.length) {
      const ch=["Company.Name","Company.ID"];
      const cd=[ch, ...comp.map(([n,id])=>[n,id])];
      const cws=XLSX.utils.aoa_to_sheet(cd);
      XLSX.utils.book_append_sheet(wb, cws, "Companies");
    }
    const cont=Object.entries(ContInfo).map(([id,info])=>{
      const nm = info.name || ([info.first||"",info.last||""].join(" ").trim());
      return [nm, id];
    });
    if (cont.length) {
      const ch=["Contact.Name","Contact.ID"];
      const cd=[ch, ...cont];
      const cws=XLSX.utils.aoa_to_sheet(cd);
      XLSX.utils.book_append_sheet(wb, cws, "Contacts");
    }

    const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    saveAs(new Blob([out],{type:"application/octet-stream"}),"CRM_Opportunities.xlsx");
  }

  async function exportCSV(){
    const headers=[
      "Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID",
      "Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep",
      "Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"
    ];
    const lines=[headers.join(","), ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    saveAs(blob,"CRM_Opportunities.csv");
  }

  // ======== UTILITIES ========
  function nextId(){
    const p="OPP-"; let max=0;
    for (const r of rows) {
      const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||"");
      if (m) { const n=parseInt(m[1],10); if (n>max) max=n; }
    }
    return p + String(max+1).padStart(6,"0");
  }

  function csvEscape(v){
    if (v==null) return "";
    const s=String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }

  function parseCSVLine(line){
    const out=[], re=/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g; let m;
    while((m=re.exec(line))!==null) out.push((m[1]||m[2]||"").replace(/""/g,'"'));
    return out;
  }

  function q(sel){ return document.querySelector(sel); }
  function on(sel,ev,cb){ const el=q(sel); if (el) el.addEventListener(ev,cb); }
  function setText(sel,txt){ const el=q(sel); if (el) el.textContent=txt; }
  function status(msg){ const el=q('#status'); if (el) el.textContent=msg; }
  function dbg(...args){
    if (!DEBUG) return;
    console.log("[CRM]", ...args);
    const log = document.getElementById('debug-log');
    if (log) {
      const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      log.textContent += (log.textContent ? "\n" : "") + line;
      log.scrollTop = log.scrollHeight;
    }
  }

  function fillSelect(sel, arr){
    if (!sel) return;
    sel.innerHTML="";
    for (const v of arr) {
      const o=document.createElement('option');
      o.value=v; o.textContent=v||"(all)";
      sel.appendChild(o);
    }
  }

  function load(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function saveLocal(){
    localStorage.setItem(KEY_ROWS, JSON.stringify(rows));
    localStorage.setItem(KEY_COMP, JSON.stringify(Companies));
    localStorage.setItem(KEY_CONT, JSON.stringify(Contacts));
    localStorage.setItem(KEY_COMP_INFO, JSON.stringify(CompInfo));
    localStorage.setItem(KEY_CONT_INFO, JSON.stringify(ContInfo));
    status("Data saved locally.");
  }

  function resetLocal(){
    if (!confirm("Reset local data?")) return;
    localStorage.removeItem(KEY_ROWS);
    localStorage.removeItem(KEY_COMP);
    localStorage.removeItem(KEY_CONT);
    localStorage.removeItem(KEY_COMP_INFO);
    localStorage.removeItem(KEY_CONT_INFO);
    rows=[]; Companies={}; Contacts={}; CompInfo={}; ContInfo={};
    status("Local storage reset.");
  }

  function refreshCompanySelect(){
    const sel=q('#f-company-name'); if (!sel) return;
    sel.innerHTML="";
    const names=Object.keys(Companies).sort((a,b)=>a.localeCompare(b));
    sel.add(new Option("(select)",""));
    names.forEach(n => sel.add(new Option(n,n)));
  }

  function refreshContactSelect(){
    const sel=q('#f-contact-name'); if (!sel) return;
    sel.innerHTML="";
    const names = Object.entries(ContInfo)
      .map(([id,info]) => (info.name || ([info.first||"",info.last||""].join(" ").trim())))
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b));
    sel.add(new Option("(select)",""));
    names.forEach(n => sel.add(new Option(n,n)));
  }
})();
