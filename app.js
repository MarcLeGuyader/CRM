/* Opportunities Manager
   Version V3-Avancée - 03/10/2025 18:40 (heure française)
   V3 avancée : import/export XLSX/CSV, filtres, ID auto, dropdown sociétés, stockage local, polyfill dialog
*/
(() => {
  const KEY_ROWS = "opportunities-db-v3";
  const KEY_COMP = "companies-db-v1";

  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  let rows = loadRows();
  let Companies = loadCompanies();
  let editingIndex = -1;

  // Polyfill dialog
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

    // Top bar
    on('#btn-new','click', () => openDialog());
    on('#btn-save','click', saveLocal);
    on('#btn-reset','click', resetLocal);
    on('#btn-export-xlsx','click', exportXLSX);
    on('#btn-export-csv','click', exportCSV);
    on('#file-input','change', handleImport);

    // Dialog refs
    const dlg = qs('#dlg'); const frm = qs('#frm');
    const btnOk = qs('#dlg-ok'); const btnDel = qs('#dlg-delete'); const btnCancel = qs('#dlg-cancel');
    const fId = qs('#f-id'); const fCoName = qs('#f-company-name'); const fCoId = qs('#f-company-id');

    btnCancel.addEventListener('click', (e)=>{ e.preventDefault(); dlgClose(dlg,'cancel'); });
    btnOk.addEventListener('click', (e)=>{ e.preventDefault();
      const data = formToObj(frm);
      if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"]||"")) { alert("Opportunity.ID doit suivre OPP-000123"); return; }
      if (editingIndex>=0) rows[editingIndex]=data; else {
        if (rows.some(x=>x["Opportunity.ID"]===data["Opportunity.ID"])) { alert("Cet ID existe déjà."); return; }
        rows.push(data);
      }
      dlgClose(dlg,'ok'); render(); saveLocal();
    });
    btnDel.addEventListener('click', (e)=>{ e.preventDefault();
      if (editingIndex<0) return;
      if (!confirm("Supprimer cette opportunité ?")) return;
      rows.splice(editingIndex,1);
      dlgClose(dlg,'delete'); render(); saveLocal();
    });

    // Company dropdown
    refreshCompanySelect();
    if (fCoName) fCoName.addEventListener('change', ()=>{ const n=fCoName.value; if (Companies[n]) fCoId.value=Companies[n]; });

    render();

    // ---- Inner fns ----
    function render() {
      if (!tbody) return;
      tbody.innerHTML = "";
      const q = (filters.q?.value||"").trim().toLowerCase();
      const fClient = filters.client?.value||"";
      const fOwner = filters.owner?.value||"";
      const fStep = filters.step?.value||"";
      const fNext = filters.nextdate?.value ? new Date(filters.nextdate.value) : null;

      const filtered = rows.filter(r=>{
        if (fClient && r["Opportunity.Client"]!==fClient) return false;
        if (fOwner && r["Opportunity.Owner"]!==fOwner) return false;
        if (fStep && r["Opportunity.SalesStep"]!==fStep) return false;
        if (fNext) { const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null; if(!d||d<fNext) return false; }
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
        const bE=document.createElement('button'); bE.textContent="✏️"; bE.title="Éditer"; bE.addEventListener('click',()=>openDialog(r));
        const bD=document.createElement('button'); bD.textContent="🗑"; bD.title="Supprimer"; bD.addEventListener('click',()=>delRow(r));
        tdA.append(bE,bD); tr.appendChild(tdA); tbody.appendChild(tr);
      }
      status(`${filtered.length} opportunité(s) affichée(s) / ${rows.length}`);
    }

    function openDialog(row) {
      frm.reset(); editingIndex=-1;
      fillSelect(qs('#c-client'), ClientList);
      fillSelect(qs('#c-owner'), OwnerList);
      fillSelect(qs('#c-step'), SalesStepList);
      refreshCompanySelect();

      if (!row) {
        fId.value = nextId();
        btnDel.style.display="none";
        setText('#dlg-title',"Nouvelle opportunité");
        if (fCoName) fCoName.value=""; if (fCoId) fCoId.value="";
      } else {
        editingIndex = rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
        for (const el of frm.elements) { if (el.name && row[el.name]!=null) el.value=row[el.name]; }
        const name = Object.keys(Companies).find(n=>Companies[n]===row["Opportunity.CompanyID"]);
        if (fCoName) fCoName.value = name || "";
        btnDel.style.display="inline-block";
        setText('#dlg-title',"Éditer opportunité");
      }
      dlgShow(dlg);
    }

    function delRow(row) {
      const idx=rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
      if (idx>=0 && confirm("Supprimer cette opportunité ?")) { rows.splice(idx,1); render(); saveLocal(); }
    }

    function refreshCompanySelect() {
      const sel = qs('#f-company-name'); if (!sel) return;
      sel.innerHTML=""; const names=Object.keys(Companies).sort((a,b)=>a.localeCompare(b));
      const empty=document.createElement('option'); empty.value=""; empty.textContent="(sélectionner)"; sel.appendChild(empty);
      for (const n of names) { const o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); }
    }
  }

  // Import/Export
  async function exportXLSX() {
    if (!window.XLSX) { alert("Librairie XLSX non chargée."); return; }
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

  async function handleImport(ev) {
    const file=ev.target.files[0]; if(!file) return;
    if (!window.XLSX) { alert("Librairie XLSX non chargée."); return; }
    const buf=await file.arrayBuffer();
    let incoming=[], incomingCompanies={};

    if (file.name.endsWith(".csv")) {
      const txt=new TextDecoder("utf-8").decode(new Uint8Array(buf));
      const lines=txt.split(/\r?\n/).filter(Boolean);
      const headers=lines[0].split(",");
      for(let i=1;i<lines.length;i++){ const vals=parseCSVLine(lines[i]); const obj={}; headers.forEach((h,idx)=>obj[h.trim()]=vals[idx]??""); incoming.push(obj); }
    } else {
      const wb=XLSX.read(buf,{type:"array"});
      const opp=wb.Sheets["Opportunities"]||wb.Sheets[wb.SheetNames[0]];
      if (opp) {
        const aoa=XLSX.utils.sheet_to_json(opp,{header:1}); const headers=aoa[0]||[];
        for(let i=1;i<aoa.length;i++){ const row=aoa[i]; if(!row||!row.length) continue; const obj={}; headers.forEach((h,idx)=>obj[h]=row[idx]??""); incoming.push(obj); }
      }
      const comp=wb.Sheets["Companies"];
      if (comp) {
        const aoa=XLSX.utils.sheet_to_json(comp,{header:1});
        for(let i=1;i<aoa.length;i++){ const r=aoa[i]; const n=r[0]; const id=r[1]; if(n&&id) incomingCompanies[n]=id; }
      }
    }

    let added=0, updated=0;
    for (const r of incoming) {
      if (!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"]||"")) r["Opportunity.ID"]=nextId();
      const idx=rows.findIndex(x=>x["Opportunity.ID"]===r["Opportunity.ID"]);
      if (idx>=0) { rows[idx]=r; updated++; } else { rows.push(r); added++; }
    }
    for (const [n,id] of Object.entries(incomingCompanies)) Companies[n]=id;

    saveLocal(); // persist both
    document.getElementById('f-company-name') && refreshCompanySelect();
    document.getElementById('q') && document.getElementById('q').dispatchEvent(new Event('input')); // trigger render if needed
    status(`Import: ${added} ajout(s), ${updated} maj. Entreprises: ${Object.keys(incomingCompanies).length}.`);
    ev.target.value="";
  }

  // Utils
  function nextId(){ const p="OPP-"; let max=0; for(const r of rows){ const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||""); if(m){ const n=parseInt(m[1],10); if(n>max) max=n; } } return p + String(max+1).padStart(6,"0"); }
  function csvEscape(v){ if(v==null) return ""; const s=String(v); return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; }
  function parseCSVLine(line){ const out=[], re=/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g; let m; while((m=re.exec(line))!==null) out.push((m[1]||m[2]||"").replace(/""/g,'"')); return out; }

  function qs(s){return document.querySelector(s);}
  function on(s,ev,cb){const el=qs(s); if(el) el.addEventListener(ev,cb);}
  function setText(s,txt){const el=qs(s); if(el) el.textContent=txt;}
  function status(msg){const el=qs('#status'); if(el) el.textContent=msg;}

  function fillSelect(sel, arr){ if(!sel) return; sel.innerHTML=""; for(const v of arr){ const o=document.createElement('option'); o.value=v; o.textContent=v||"(tous)"; sel.appendChild(o); } }
  function loadRows(){ try{return JSON.parse(localStorage.getItem(KEY_ROWS))||[];}catch{return[];} }
  function loadCompanies(){ try{return JSON.parse(localStorage.getItem(KEY_COMP))||{};}catch{return{};} }
  function saveLocal(){ localStorage.setItem(KEY_ROWS, JSON.stringify(rows)); localStorage.setItem(KEY_COMP, JSON.stringify(Companies)); status("Données enregistrées localement."); }
  function resetLocal(){ if(!confirm("Réinitialiser les données locales ?")) return; localStorage.removeItem(KEY_ROWS); localStorage.removeItem(KEY_COMP); rows=[]; Companies={}; status("Local storage réinitialisé."); }
})();
