/* Opportunities Manager
   Version 03/10/2025 16:49 (heure française)
*/

(() => {
  const KEY_ROWS = "opportunities-db-v2";
  const KEY_COMP = "companies-db-v1";
  const status = (msg) => { const s=document.getElementById('status'); if(s) s.textContent = msg; };

  // Listes de validation
  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  // Entreprises (name -> id), alimentées à l'import si feuille "Companies" présente
  let Companies = loadCompanies(); // ex: { "Axis Communications": "CMPY-000023" }

  // État
  let rows = loadRows();
  let editingIndex = -1;

  // Éléments
  const tbody = document.getElementById('tbody');
  const filters = {
    q: document.getElementById('q'),
    client: document.getElementById('f-client'),
    owner: document.getElementById('f-owner'),
    step: document.getElementById('f-step'),
    nextdate: document.getElementById('f-nextdate'),
  };

  if (!tbody) {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init(){
    // Remplir filtres
    fillSelect(filters.client, ["", ...ClientList]);
    fillSelect(filters.owner, ["", ...OwnerList]);
    fillSelect(filters.step, ["", ...SalesStepList]);

    // Bind UI
    document.getElementById('btn-new').addEventListener('click', () => openDialog());
    document.getElementById('btn-save').addEventListener('click', () => saveLocal());
    document.getElementById('btn-reset').addEventListener('click', resetLocal);
    document.getElementById('btn-export-xlsx').addEventListener('click', exportXLSX);
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('file-input').addEventListener('change', handleImport);
    Object.values(filters).forEach(el => el && el.addEventListener('input', render));

    // PWA
    let deferredPrompt;
    const install = document.getElementById('install');
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if(install) install.style.display='inline'; });
    if(install){
      install.addEventListener('click', async (e) => { e.preventDefault(); if (deferredPrompt){ deferredPrompt.prompt(); deferredPrompt = null; } });
    }

    // Dialog
    const dlg = document.getElementById('dlg');
    const frm = document.getElementById('frm');
    const btnOk = document.getElementById('dlg-ok');
    const btnDel = document.getElementById('dlg-delete');
    const btnCancel = document.getElementById('dlg-cancel');
    const fId = document.getElementById('f-id');
    const fCoName = document.getElementById('f-company-name');
    const fCoId = document.getElementById('f-company-id');

    // Init dropdown des sociétés
    refreshCompanySelect();

    // ✅ Annuler
    btnCancel.addEventListener('click', (e) => {
      e.preventDefault();
      dlg.close('cancel');
    });

    // ✅ Enregistrer
    btnOk.addEventListener('click', (e) => {
      e.preventDefault();
      const data = formToObj(frm);
      if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"] || "")) {
        alert("Opportunity.ID doit suivre le format OPP-000123.");
        return;
      }
      if (editingIndex >= 0) {
        rows[editingIndex] = data;
      } else {
        if (rows.some(x => x["Opportunity.ID"] === data["Opportunity.ID"])) {
          alert("Cet ID existe déjà.");
          return;
        }
        rows.push(data);
      }
      dlg.close('ok');
      render(); saveLocal();
    });

    // ✅ Supprimer
    btnDel.addEventListener('click', (e) => {
      e.preventDefault();
      if (editingIndex < 0) return;
      if (!confirm("Supprimer cette opportunité ?")) return;
      rows.splice(editingIndex,1);
      dlg.close('delete');
      render(); saveLocal();
    });

    // ✅ Company (nom) → auto CompanyID
    fCoName.addEventListener('change', () => {
      const name = fCoName.value;
      if (Companies[name]) fCoId.value = Companies[name];
    });

    render();
  }

  function fillSelect(sel, arr) {
    if (!sel) return;
    sel.innerHTML = "";
    for (const v of arr) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v || "(tous)";
      sel.appendChild(o);
    }
  }

  function refreshCompanySelect() {
    const fCoName = document.getElementById('f-company-name');
    if (!fCoName) return;
    fCoName.innerHTML = "";
    const keys = Object.keys(Companies).sort((a,b)=>a.localeCompare(b));
    const emptyOpt = document.createElement('option'); emptyOpt.value=""; emptyOpt.textContent="(sélectionner)";
    fCoName.appendChild(emptyOpt);
    for (const name of keys) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      fCoName.appendChild(o);
    }
  }

  function loadRows() {
    try { return JSON.parse(localStorage.getItem(KEY_ROWS)) || []; } catch { return []; }
  }
  function saveLocal() {
    localStorage.setItem(KEY_ROWS, JSON.stringify(rows));
    localStorage.setItem(KEY_COMP, JSON.stringify(Companies));
    status("Données enregistrées localement.");
  }
  function resetLocal() {
    if (!confirm("Réinitialiser les données locales ?")) return;
    localStorage.removeItem(KEY_ROWS);
    localStorage.removeItem(KEY_COMP);
    rows = [];
    Companies = {};
    refreshCompanySelect();
    render();
    status("Local storage réinitialisé.");
  }
  function loadCompanies() {
    try { return JSON.parse(localStorage.getItem(KEY_COMP)) || {}; } catch { return {}; }
  }

  function render() {
    if (!tbody) return;
    tbody.innerHTML = "";
    const q = (filters.q?.value || "").trim().toLowerCase();
    const fClient = filters.client?.value || "";
    const fOwner = filters.owner?.value || "";
    const fStep = filters.step?.value || "";
    const fNext = filters.nextdate?.value ? new Date(filters.nextdate.value) : null;

    const filtered = rows.filter(r => {
      if (fClient && r["Opportunity.Client"] !== fClient) return false;
      if (fOwner && r["Opportunity.Owner"] !== fOwner) return false;
      if (fStep && r["Opportunity.SalesStep"] !== fStep) return false;
      if (fNext) {
        const d = r["Opportunity.NextActionDate"] ? new Date(r["Opportunity.NextActionDate"]) : null;
        if (!d || d < fNext) return false;
      }
      if (q) {
        if (q === "overdue") {
          const today = new Date(); today.setHours(0,0,0,0);
          const d = r["Opportunity.NextActionDate"] ? new Date(r["Opportunity.NextActionDate"]) : null;
          if (!(d && d < today)) return false;
        } else {
          const hay = (Object.values(r).join(" ") + "").toLowerCase();
          if (!hay.includes(q)) return false;
        }
      }
      return true;
    });

    for (const r of filtered) {
      const tr = document.createElement('tr');
      const keys = [
        "Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client",
        "Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate",
        "Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"
      ];
      for (const k of keys) {
        const td = document.createElement('td');
        td.textContent = r[k] || "";
        tr.appendChild(td);
      }
      const tdA = document.createElement('td');
      tdA.className = "row-actions";
      const btnE = document.createElement('button'); btnE.textContent = "✏️"; btnE.title = "Éditer"; btnE.addEventListener('click', () => openDialog(r));
      const btnD = document.createElement('button'); btnD.textContent = "🗑"; btnD.title = "Supprimer"; btnD.addEventListener('click', () => del(r));
      tdA.append(btnE, btnD);
      tr.appendChild(tdA);
      tbody.appendChild(tr);
    }

    status(`${filtered.length} opportunité(s) affichée(s) / ${rows.length}`);
  }

  function openDialog(row) {
    const frm = document.getElementById('frm');
    const dlg = document.getElementById('dlg');
    const btnDel = document.getElementById('dlg-delete');
    const fId = document.getElementById('f-id');
    const fCoName = document.getElementById('f-company-name');
    const fCoId = document.getElementById('f-company-id');

    frm.reset();
    editingIndex = -1;
    fillSelect(document.getElementById('c-client'), ClientList);
    fillSelect(document.getElementById('c-owner'), OwnerList);
    fillSelect(document.getElementById('c-step'), SalesStepList);
    refreshCompanySelect();

    if (!row) {
      const id = nextId();
      fId.value = id;
      btnDel.style.display = "none";
      document.getElementById('dlg-title').textContent = "Nouvelle opportunité";
      fCoName.value = "";
      fCoId.value = "";
    } else {
      editingIndex = rows.findIndex(x => x["Opportunity.ID"] === row["Opportunity.ID"]);
      for (const el of frm.elements) {
        if (el.name && row[el.name] != null) el.value = row[el.name];
      }
      const name = Object.keys(Companies).find(n => Companies[n] === row["Opportunity.CompanyID"]);
      fCoName.value = name || "";
      btnDel.style.display = "inline-block";
      document.getElementById('dlg-title').textContent = "Éditer opportunité";
    }
    dlg.showModal();
  }

  function del(row) {
    const idx = rows.findIndex(x => x["Opportunity.ID"] === row["Opportunity.ID"]);
    if (idx >= 0 && confirm("Supprimer cette opportunité ?")) {
      rows.splice(idx,1);
      render(); saveLocal();
    }
  }

  function formToObj(frm) {
    const data = {};
    for (const el of frm.elements) {
      if (!el.name) continue;
      data[el.name] = (el.type === "number") ? (el.value ? Number(el.value) : "") : el.value;
    }
    return data;
  }

  function nextId() {
    const prefix = "OPP-";
    let max = 0;
    for (const r of rows) {
      const m = /^OPP-(\d{6})$/.exec(r["Opportunity.ID"] || "");
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    const next = (max + 1).toString().padStart(6, "0");
    return prefix + next;
  }

  // --- Import/Export ---
  async function exportXLSX() { /* inchangé */ }
  async function exportCSV() { /* inchangé */ }
  async function handleImport(ev) { /* inchangé */ }
  function parseCSVLine(line) { /* inchangé */ }
})();
