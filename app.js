/* CRM
   Version V3.3 - 03/10/2025 20:12 (French time)
   V3.3: show Company/Contact names, toggle debug ⟨⟩, 'Upload Excel', title CRM with version under it,
         hide Opportunity.ID in UI, headers simplified, edit-only icon at row start.
*/
(() => {
  const DEBUG = true;
  const KEY_ROWS = "opportunities-db-v3";
  const KEY_COMP = "companies-db-v1"; // Company.Name -> Company.ID
  const KEY_CONT = "contacts-db-v1";  // Contact.Name  -> Contact.ID

  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  let rows = load(KEY_ROWS, []);
  let Companies = load(KEY_COMP, {});
  let Contacts = load(KEY_CONT, {});
  let editingIndex = -1;

  function reverseMap(obj){ const r={}; for(const [k,v] of Object.entries(obj)) r[String(v)]=k; return r; }
  function dbg(...a){ if(!DEBUG) return; console.log("[CRM]",...a); const el=document.getElementById('debug-log'); if(el){ const line=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '); el.textContent+=(el.textContent?'\n':'')+line; el.scrollTop=el.scrollHeight; } }

  const hasNativeDialog = typeof HTMLDialogElement!=="undefined" && HTMLDialogElement.prototype.showModal && HTMLDialogElement.prototype.close;
  const dlgShow = d=> hasNativeDialog ? d.showModal() : d.setAttribute("open","");
  const dlgClose = (d,v)=> hasNativeDialog ? d.close(v||"") : d.removeAttribute("open");

  document.addEventListener("DOMContentLoaded", init);

  function init(){
    // Filters
    fillSelect(q('#f-client'), ["", ...ClientList]);
    fillSelect(q('#f-owner'), ["", ...OwnerList]);
    fillSelect(q('#f-step'), ["", ...SalesStepList]);
    ['#q','#f-client','#f-owner','#f-step','#f-nextdate'].forEach(s=>{ const el=q(s); if(el) el.addEventListener('input', render); });

    // Top bar
    on('#btn-new','click', () => openDialog());
    on('#btn-save','click', saveLocal);
    on('#btn-reset','click', resetLocal);
    on('#btn-export-xlsx','click', exportXLSX);
    on('#btn-export-csv','click', exportCSV);
    on('#file-input','change', handleImport);

    // Debug panel toggle/copy/clear
    const btnDbg=q('#btn-debug'), dbgPanel=q('#debug-panel');
    on('#btn-debug','click', ()=>{ const hidden=dbgPanel.classList.toggle('hidden'); btnDbg.setAttribute('aria-expanded', String(!hidden)); dbgPanel.setAttribute('aria-hidden', String(hidden)); });
    on('#debug-clear','click', ()=>{ const log=q('#debug-log'); if(log) log.textContent=""; });
    on('#debug-copy','click', async()=>{ const log=q('#debug-log'); if(!log) return; try{ await navigator.clipboard.writeText(log.textContent||""); alert("Debug log copied to clipboard."); }catch(e){ const r=document.createRange(); r.selectNodeContents(log); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); document.execCommand("copy"); sel.removeAllRanges(); alert("Debug log selected. If copying failed, long-press and Copy."); } });

    // Dialog refs
    const dlg=q('#dlg'), frm=q('#frm');
    const fId=q('#f-id');
    const fCoName=q('#f-company-name'), fCoId=q('#f-company-id');
    const fCtName=q('#f-contact-name'), fCtId=q('#f-contact-id');

    on('#dlg-cancel','click', ev=>{ ev.preventDefault(); dlgClose(dlg,'cancel'); });
    on('#dlg-ok','click', ev=>{ ev.preventDefault();
      const data=formToObj(frm);
      if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"]||"")) data["Opportunity.ID"]=nextId();
      if (editingIndex>=0) rows[editingIndex]=data; else {
        if (rows.some(x=>x["Opportunity.ID"]===data["Opportunity.ID"])) { alert("This ID already exists."); return; }
        rows.push(data);
      }
      dlgClose(dlg,'ok'); render(); saveLocal();
    });

    refreshCompanySelect(); refreshContactSelect();
    if (fCoName) fCoName.addEventListener('change', ()=>{ const n=fCoName.value; if (Companies[n]) fCoId.value=Companies[n]; });
    if (fCtName) fCtName.addEventListener('change', ()=>{ const n=fCtName.value; if (Contacts[n]) fCtId.value=Contacts[n]; });

    render();
    status("Ready. Use 'Upload Excel' to load your file.");
    dbg("App started", {rows: rows.length, companies: Object.keys(Companies).length, contacts: Object.keys(Contacts).length});
  }

  // Render table (hide Opp ID, show names for Company/Contact)
  function render(){
    const tb=q('#tbody'); if(!tb) return; tb.innerHTML="";
    const qv=(q('#q')?.value||"").trim().toLowerCase();
    const fClient=q('#f-client')?.value||"";
    const fOwner=q('#f-owner')?.value||"";
    const fStep=q('#f-step')?.value||"";
    const fNext=q('#f-nextdate')?.value? new Date(q('#f-nextdate').value):null;

    const compById=reverseMap(Companies);
    const contById=reverseMap(Contacts);

    const filtered=rows.filter(r=>{
      if (fClient && r["Opportunity.Client"]!==fClient) return false;
      if (fOwner && r["Opportunity.Owner"]!==fOwner) return false;
      if (fStep && r["Opportunity.SalesStep"]!==fStep) return false;
      if (fNext) { const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null; if(!d||d<fNext) return false; }
      if (qv) {
        if (qv==="overdue") { const t=new Date(); t.setHours(0,0,0,0); const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null; if(!(d&&d<t)) return false; }
        else { const hay=(Object.values(r).join(" ")+"").toLowerCase(); if (!hay.includes(qv)) return false; }
      }
      return true;
    });

    for (const r of filtered) {
      const tr=document.createElement('tr');
      // edit icon at row start
      const tdIcon=document.createElement('td');
      const bE=document.createElement('button'); bE.textContent="✏️"; bE.title="Edit"; bE.addEventListener('click',()=>openDialog(r));
      tdIcon.appendChild(bE); tr.appendChild(tdIcon);

      const compName=compById[String(r["Opportunity.CompanyID"]||"")]||"";
      const contName=contById[String(r["Opportunity.ContactID"]||"")]||"";

      const keys=[
        "Opportunity.Name",
        "Opportunity.CompanyID",
        "Opportunity.ContactID",
        "Opportunity.Client",
        "Opportunity.Owner",
        "Opportunity.SalesStep",
        "Opportunity.SalesCycleLastChangeDate",
        "Opportunity.NextActionDate",
        "Opportunity.NextAction",
        "Opportunity.ClosingDate",
        "Opportunity.ClosingValue",
        "Opportunity.Notes"
      ];

      for (const k of keys) {
        const td=document.createElement('td');
        if (k==="Opportunity.CompanyID") td.textContent=compName;
        else if (k==="Opportunity.ContactID") td.textContent=contName;
        else td.textContent=r[k]||"";
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    status(`${filtered.length} opportunity(ies) shown / ${rows.length}`);
  }

  // Open dialog for edit/new
  function openDialog(row){
    const dlg=q('#dlg'), frm=q('#frm'), fId=q('#f-id');
    const fCoName=q('#f-company-name'), fCoId=q('#f-company-id');
    const fCtName=q('#f-contact-name'), fCtId=q('#f-contact-id');

    frm.reset(); editingIndex=-1;
    fillSelect(q('#c-client'), ClientList);
    fillSelect(q('#c-owner'), OwnerList);
    fillSelect(q('#c-step'), SalesStepList);
    refreshCompanySelect(); refreshContactSelect();

    if (!row) {
      fId.value=nextId();
      setText('#dlg-title',"New");
      if (fCoName) fCoName.value=""; if (fCoId) fCoId.value="";
      if (fCtName) fCtName.value=""; if (fCtId) fCtId.value="";
    } else {
      editingIndex=rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
      for (const el of frm.elements) { if (el.name && row[el.name]!=null) el.value=row[el.name]; }
      const compById=reverseMap(Companies), contById=reverseMap(Contacts);
      const cname=compById[String(row["Opportunity.CompanyID"]||"")]||"";
      const tname=contById[String(row["Opportunity.ContactID"]||"")]||"";
      if (fCoName) fCoName.value=cname;
      if (fCtName) fCtName.value=tname;
      setText('#dlg-title',"Edit");
    }
    dlgShow(dlg);
  }

  // Import / Export
  async function handleImport(ev){
    const file=ev.target.files[0]; if(!file) return;
    if (!window.XLSX) { alert("Excel library not loaded."); return; }
    dbg("Import start:", file.name);
    try{
      const buf=await file.arrayBuffer();
      let rowsIn=[], companiesIn={}, contactsIn={};

      if (file.name.toLowerCase().endsWith(".csv")) {
        const txt=new TextDecoder("utf-8").decode(new Uint8Array(buf));
        const lines=txt.split(/\r?\n/).filter(Boolean);
        if (!lines.length) { status("No lines detected in CSV."); ev.target.value=""; return; }
        const rawHeaders=lines[0].split(",").map(h=>h.trim());
        const headers=rawHeaders.map(normalizeHeader);
        dbg("CSV headers(raw):", rawHeaders, "mapped:", headers);
        for (let i=1;i<lines.length;i++){ const vals=parseCSVLine(lines[i]); const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=vals[idx]??""; }); rowsIn.push(obj); }
      } else {
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
            for(let i=1;i<aoa.length;i++){ const r=aoa[i]; if(!r||!r.length) continue; const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=r[idx]??""; }); rowsIn.push(obj); }
          }
        }

        // Companies
        const compWS=wb.Sheets["Companies"];
        if (compWS) {
          const ca=XLSX.utils.sheet_to_json(compWS,{header:1});
          for(let i=1;i<ca.length;i++){ const r=ca[i]; const name=(r[0]??"").toString().trim(); const id=(r[1]??"").toString().trim(); if(name && id) companiesIn[name]=id; }
        }

        // Contacts
        const contWS=wb.Sheets["Contacts"];
        if (contWS) {
          const ca=XLSX.utils.sheet_to_json(contWS,{header:1});
          if (ca && ca.length) {
            const headers=(ca[0]||[]).map(h=>(h??"").toString().trim().toLowerCase());
            let nameIdx=headers.findIndex(h=>/name$/.test(h)||h.includes("name"));
            let idIdx=headers.findIndex(h=>/id$/.test(h)||h.includes("id"));
            if (nameIdx<0) nameIdx=0; if (idIdx<0) idIdx=1;
            for (let i=1;i<ca.length;i++){ const r=ca[i]; const name=(r[nameIdx]??"").toString().trim(); const id=(r[idIdx]??"").toString().trim(); if(name && id) contactsIn[name]=id; }
          }
        }
      }

      rowsIn=rowsIn.filter(r=>Object.values(r).some(v=>(v??"")!==""));
      dbg("Parsed rows:", rowsIn.length, "Companies:", Object.keys(companiesIn).length, "Contacts:", Object.keys(contactsIn).length);

      if (!rowsIn.length && !Object.keys(companiesIn).length && !Object.keys(contactsIn).length) { alert("No readable data: check sheet names and headers."); ev.target.value=""; return; }

      let added=0, updated=0;
      for (const r of rowsIn){ if(!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"]||"")) r["Opportunity.ID"]=nextId(); const idx=rows.findIndex(x=>x["Opportunity.ID"]===r["Opportunity.ID"]); if(idx>=0){ rows[idx]=r; updated++; } else { rows.push(r); added++; } }
      for (const [n,id] of Object.entries(companiesIn)) Companies[n]=id;
      for (const [n,id] of Object.entries(contactsIn)) Contacts[n]=id;

      saveLocal(); render();
      status(`Import OK: ${added} added, ${updated} updated. Companies: ${Object.keys(companiesIn).length}. Contacts: ${Object.keys(contactsIn).length}.`);
      dbg("Import done.", {added, updated, companies:Object.keys(companiesIn).length, contacts:Object.keys(contactsIn).length});
    } catch(err){ console.error(err); alert("Import error. Make sure the file is not protected and the first row contains headers."); dbg("Import error", err && err.message ? err.message : err); }
    finally { ev.target.value=""; }
  }

  // Normalize headers like "Opportunities.OpportunityID" or "OpportunityID"
  function normalizeHeader(h){
    if (h == null) return "";
    let w=String(h).trim().toLowerCase();
    const parts=w.split(".");
    const known=new Set(["opportunities","opportunity","companies","contacts","validationlists"]);
    if (parts.length>1 && known.has(parts[0])) w=parts.slice(1).join(".");
    w=w.replace(/[\.\-_]/g," ").replace(/\s+/g," ").trim();

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
      "sales cycle last change date":"Opportunity.SalesCycleLastChangeDate",
      "salescyclelastchangedate":"Opportunity.SalesCycleLastChangeDate"
    };

    if (map[w]) return map[w];
    if (/^opportunity[a-z]/.test(w)){ const tail=w.replace(/^opportunity/,"").trim(); return map[tail] || map[tail.replace(/\s+/g,"")] || (tail==="id" ? "Opportunity.ID" : ""); }
    return "";
  }

  // Export
  async function exportXLSX(){
    if (!window.XLSX) { alert("Excel library not loaded."); return; }
    const wb=XLSX.utils.book_new();
    const headers=["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const data=[headers, ...rows.map(r=>headers.map(h=>r[h]??""))];
    const ws=XLSX.utils.aoa_to_sheet(data); XLSX.utils.book_append_sheet(wb, ws, "Opportunities");

    const comp=Object.entries(Companies);
    if (comp.length) { const ch=["Company.Name","Company.ID"]; const cd=[ch, ...comp.map(([n,id])=>[n,id])]; const cws=XLSX.utils.aoa_to_sheet(cd); XLSX.utils.book_append_sheet(wb, cws, "Companies"); }
    const cont=Object.entries(Contacts);
    if (cont.length) { const ch=["Contact.Name","Contact.ID"]; const cd=[ch, ...cont.map(([n,id])=>[n,id])]; const cws=XLSX.utils.aoa_to_sheet(cd); XLSX.utils.book_append_sheet(wb, cws, "Contacts"); }

    const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    saveAs(new Blob([out],{type:"application/octet-stream"}),"CRM_Opportunities.xlsx");
  }

  async function exportCSV(){
    const headers=["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const lines=[headers.join(","), ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    saveAs(blob,"CRM_Opportunities.csv");
  }

  // Utils
  function nextId(){ const p="OPP-"; let max=0; for(const r of rows){ const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||""); if(m){ const n=parseInt(m[1],10); if(n>max) max=n; } } return p+String(max+1).padStart(6,"0"); }
  function csvEscape(v){ if(v==null) return ""; const s=String(v); return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; }
  function parseCSVLine(line){ const out=[], re=/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g; let m; while((m=re.exec(line))!==null) out.push((m[1]||m[2]||"").replace(/""/g,'"')); return out; }

  function q(s){ return document.querySelector(s); }
  function on(s,ev,cb){ const el=q(s); if(el) el.addEventListener(ev,cb); }
  function setText(s,txt){ const el=q(s); if(el) el.textContent=txt; }
  function status(msg){ const el=q('#status'); if(el) el.textContent=msg; }

  function fillSelect(sel, arr){ if(!sel) return; sel.innerHTML=""; for(const v of arr){ const o=document.createElement('option'); o.value=v; o.textContent=v||"(all)"; sel.appendChild(o); } }
  function load(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; } }
  function saveLocal(){ localStorage.setItem(KEY_ROWS, JSON.stringify(rows)); localStorage.setItem(KEY_COMP, JSON.stringify(Companies)); localStorage.setItem(KEY_CONT, JSON.stringify(Contacts)); status("Data saved locally."); }
  function resetLocal(){ if(!confirm("Reset local data?")) return; localStorage.removeItem(KEY_ROWS); localStorage.removeItem(KEY_COMP); localStorage.removeItem(KEY_CONT); rows=[]; Companies={}; Contacts={}; status("Local storage reset."); }

  function refreshCompanySelect(){ const sel=q('#f-company-name'); if(!sel) return; sel.innerHTML=""; const names=Object.keys(Companies).sort((a,b)=>a.localeCompare(b)); const empty=new Option("(select)",""); sel.add(empty); names.forEach(n=>sel.add(new Option(n,n))); }
  function refreshContactSelect(){ const sel=q('#f-contact-name'); if(!sel) return; sel.innerHTML=""; const names=Object.keys(Contacts).sort((a,b)=>a.localeCompare(b)); const empty=new Option("(select)",""); sel.add(empty); names.forEach(n=>sel.add(new Option(n,n))); }
})();
