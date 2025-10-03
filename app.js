/* Opportunities Manager
   Version 03/10/2025 16:49 (heure française)
*/

(() => {
  // --- Constantes & état persistant ---
  const KEY_ROWS = "opportunities-db-v2";
  const KEY_COMP = "companies-db-v1";

  // Listes (à adapter si besoin)
  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  // État mémoire
  let rows = loadRows();
  let Companies = loadCompanies(); // { "Nom Société": "CMPY-000123", ... }
  let editingIndex = -1;

  // Références DOM (remplies dans init)
  let tbody, filters, dlg, frm, btnOk, btnDel, btnCancel, fId, fCoName, fCoId;

  // --- Bootstrap UI une fois le DOM prêt ---
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    // Sélecteurs principaux
    tbody = document.getElementById('tbody');
    filters = {
      q: document.getElementById('q'),
      client: document.getElementById('f-client'),
      owner: document.getElementById('f-owner'),
      step: document.getElementById('f-step'),
      nextdate: document.getElementById('f-nextdate'),
    };

    // Filtres
    fillSelect(filters.client, ["", ...ClientList]);
    fillSelect(filters.owner, ["", ...OwnerList]);
    fillSelect(filters.step, ["", ...SalesStepList]);
    Object.values(filters).forEach(el => el && el.addEventListener('input', render));

    // Boutons barre du haut
    qs('#btn-new').addEventListener('click', () => openDialog());
    qs('#btn-save').addEventListener('click', () => saveLocal());
    qs('#btn-reset').addEventListener('click', resetLocal);
    qs('#btn-export-xlsx').addEventListener('click', exportXLSX);
    qs('#btn-export-csv').addEventListener('click', exportCSV);
    qs('#file-input').addEventListener('change', handleImport);

    // PWA install (optionnel)
    const install = qs('#install');
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (install) install.style.display='inline'; });
    if (install) {
      install.addEventListener('click', async (e) => { e.preventDefault(); if (deferredPrompt){ deferredPrompt.prompt(); deferredPrompt = null; } });
    }

    // Dialog éléments
    dlg = qs('#dlg');
    frm = qs('#frm');
    btnOk = qs('#dlg-ok');
    btnDel = qs('#dlg-delete');
    btnCancel = qs('#dlg-cancel');
    fId = qs('#f-id');
    fCoName = qs('#f-company-name');
    fCoId = qs('#f-company-id');

    // Actions du dialog
    btnCancel.addEventListener('click', (e) => { e.preventDefault(); dlg.close('cancel'); });
    btnOk.addEventListener('click', onSaveDialog);
    btnDel.addEventListener('click', onDeleteDialog);

    // Dropdown sociétés + liaison nom→ID
    refreshCompanySelect();
    fCoName.addEventListener('change', () => {
      const name = fCoName.value;
      if (Companies[name]) fCoId.value = Companies[name];
    });

    // Premier rendu
    render();
    status("Prêt.");
  }

  // --- Handlers dialog ---
  function onSaveDialog(e) {
    e.preventDefault();
    const data = formToObj(frm);

    // Validation ID
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
  }

  function onDeleteDialog(e) {
    e.preventDefault();
    if (editingIndex < 0) return;
    if (!confirm("Supprimer cette opportunité ?")) return;
    rows.splice(editingIndex, 1);
    dlg.close('delete');
    render(); saveLocal();
  }

  // --- Rendu tableau ---
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
        td.textContent = r[k] ?? "";
        tr.appendChild(td);
      }
      const tdActions = document.createElement('td');
      tdActions.className = "row-actions";
      const bEdit = document.createElement('button'); bEdit.textContent = "✏️"; bEdit.title = "Éditer"; bEdit.addEventListener('click', () => openDialog(r));
      const bDel = document.createElement('button');  bDel.textContent = "🗑"; bDel.title = "Supprimer"; bDel.addEventListener('click', () => delRow(r));
      tdActions.append(bEdit, bDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }

    status(`${filtered.length} opportunité(s) affichée(s) / ${rows.length}`);
  }

  // --- Ouvrir / supprimer ---
  function openDialog(row) {
    frm.reset();
    editingIndex = -1;

    // (Re)remplir enums
    fillSelect(qs('#c-client'), ClientList);
    fillSelect(qs('#c-owner'), OwnerList);
    fillSelect(qs('#c-step'), SalesStepList);
    refreshCompanySelect();

    if (!row) {
      // Nouveau → ID auto
      fId.value = nextId();
      btnDel.style.display = "none";
      qs('#dlg-title').textContent = "Nouvelle opportunité";
      fCoName.value = "";
      fCoId.value = "";
    } else {
      editingIndex = rows.findIndex(x => x["Opportunity.ID"] === row["Opportunity.ID"]);
      for (const el of frm.elements) {
        if (el.name && row[el.name] != null) el.value = row[el.name];
      }
      // Remonter nom société depuis CompanyID si possible
      const name = Object.keys(Companies).find(n => Companies[n] === row["Opportunity.CompanyID"]);
      fCoName.value = name || "";
      btnDel.style.display = "inline-block";
      qs('#dlg-title').textContent = "Éditer opportunité";
    }

    dlg.showModal();
  }

  function delRow(row) {
    const idx = rows.findIndex(x => x["Opportunity.ID"] === row["Opportunity.ID"]);
    if (idx >= 0 && confirm("Supprimer cette opportunité ?")) {
      rows.splice(idx, 1);
      render(); saveLocal();
    }
  }

  // --- Helpers UI / Storage ---
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
    if (!fCoName) return;
    fCoName.innerHTML = "";
    const names = Object.keys(Companies).sort((a,b)=>a.localeCompare(b));
    const empty = document.createElement('option'); empty.value = ""; empty.textContent = "(sélectionner)";
    fCoName.appendChild(empty);
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      fCoName.appendChild(o);
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

  // --- Import / Export ---
  async function exportXLSX() {
    if (!window.XLSX) { alert("Librairie XLSX non chargée (connexion requise)."); return; }
    const wb = XLSX.utils.book_new();
    const headers = ["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const data = [headers, ...rows.map(r => headers.map(h => r[h] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Opportunities");

    // Ajoute la feuille Companies si on a des paires nom/ID
    const compEntries = Object.entries(Companies);
    if (compEntries.length) {
      const cheaders = ["Company.Name","Company.ID"];
      const cdata = [cheaders, ...compEntries.map(([name, id]) => [name, id])];
      const cws = XLSX.utils.aoa_to_sheet(cdata);
      XLSX.utils.book_append_sheet(wb, cws, "Companies");
    }

    const out = XLSX.write(wb, {bookType:"xlsx", type:"array"});
    saveAs(new Blob([out], {type:"application/octet-stream"}), "Opportunities.xlsx");
  }

  async function exportCSV() {
    if (!window.XLSX) { alert("Librairie XLSX non chargée (connexion requise)."); return; }
    const headers = ["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const lines = [headers.join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))];
    const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
    saveAs(blob, "Opportunities.csv");
  }

  function csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  async function handleImport(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (!window.XLSX) { alert("Librairie XLSX non chargée (connexion requise)."); return; }
    const buf = await file.arrayBuffer();
    let importedRows = [];
    let importedCompanies = {};

    if (file.name.endsWith(".csv")) {
      const txt = new TextDecoder("utf-8").decode(new Uint8Array(buf));
      const lines = txt.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",");
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => obj[h.trim()] = vals[idx] ?? "");
        importedRows.push(obj);
      }
    } else {
      const wb = XLSX.read(buf, {type:"array"});
      // Opportunities
      const oppSheet = wb.Sheets["Opportunities"] || wb.Sheets[wb.SheetNames[0]];
      if (oppSheet) {
        const aoa = XLSX.utils.sheet_to_json(oppSheet, {header:1});
        const headers = aoa[0] || [];
        for (let i = 1; i < aoa.length; i++) {
          const row = aoa[i];
          if (!row || !row.length) continue;
          const obj = {};
          headers.forEach((h, idx) => obj[h] = row[idx] ?? "");
          importedRows.push(obj);
        }
      }
      // Companies
      const compSheet = wb.Sheets["Companies"];
      if (compSheet) {
        const aoa = XLSX.utils.sheet_to_json(compSheet, {header:1});
        for (let i = 1; i < aoa.length; i++) {
          const row = aoa[i];
          const name = row[0]; const id = row[1];
          if (name && id) importedCompanies[name] = id;
        }
      }
    }

    // Upsert par ID, auto-ID si non valide
    let countNew = 0, countUpd = 0;
    for (const r of importedRows) {
      if (!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"] || "")) {
        r["Opportunity.ID"] = nextId();
      }
      const idx = rows.findIndex(x => x["Opportunity.ID"] === r["Opportunity.ID"]);
      if (idx >= 0) { rows[idx] = r; countUpd++; } else { rows.push(r); countNew++; }
    }
    // Merge companies
    for (const [n,id] of Object.entries(importedCompanies)) Companies[n] = id;

    refreshCompanySelect();
    render(); saveLocal();
    status(`Import terminé: ${countNew} ajout(s), ${countUpd} mise(s) à jour. Entreprises: ${Object.keys(importedCompanies).length} intégrées.`);
    ev.target.value = "";
  }

  function parseCSVLine(line) {
    const out = [], re = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      out.push((m[1] || m[2] || "").replace(/""/g, '"'));
    }
    return out;
  }

  // --- Utils ---
  function qs(sel){ return document.querySelector(sel); }
  function status(msg){ const el = qs('#status'); if (el) el.textContent = msg; }
})();
