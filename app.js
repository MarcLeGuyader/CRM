(() => {
  const KEY = "opportunities-db-v1";
  const status = (msg) => { document.getElementById('status').textContent = msg; };

  // Validation lists (edit here or extend by importing)
  const SalesStepList = ["Discovery","Qualified","Solution selling","Negotiation","Closing","Won","Lost"];
  const OwnerList = ["Marc","Sam","Sven"];
  const ClientList = ["ResQuant","PUFsecurity","Aico","eShard","IOTR"];

  // State
  let rows = load();
  let editingIndex = -1;

  // Elements
  const tbody = document.getElementById('tbody');
  const filters = {
    q: document.getElementById('q'),
    client: document.getElementById('f-client'),
    owner: document.getElementById('f-owner'),
    step: document.getElementById('f-step'),
    nextdate: document.getElementById('f-nextdate'),
  };

  // Fill selects
  fillSelect(filters.client, ["", ...ClientList]);
  fillSelect(filters.owner, ["", ...OwnerList]);
  fillSelect(filters.step, ["", ...SalesStepList]);

  // Fill dialog selects
  fillSelect(document.getElementById('c-client'), ClientList);
  fillSelect(document.getElementById('c-owner'), OwnerList);
  fillSelect(document.getElementById('c-step'), SalesStepList);

  // Bind UI
  document.getElementById('btn-new').addEventListener('click', () => openDialog());
  document.getElementById('btn-save').addEventListener('click', () => saveLocal());
  document.getElementById('btn-reset').addEventListener('click', resetLocal);
  document.getElementById('btn-export-xlsx').addEventListener('click', exportXLSX);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('file-input').addEventListener('change', handleImport);
  Object.values(filters).forEach(el => el.addEventListener('input', render));

  // PWA install
  let deferredPrompt;
  const install = document.getElementById('install');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; install.style.display='inline'; });
  install.addEventListener('click', async (e) => { e.preventDefault(); if (deferredPrompt){ deferredPrompt.prompt(); deferredPrompt = null; } });

  render();

  // --- Functions ---
  function fillSelect(sel, arr) {
    sel.innerHTML = "";
    for (const v of arr) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v || "(tous)";
      sel.appendChild(o);
    }
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }

  function saveLocal() {
    localStorage.setItem(KEY, JSON.stringify(rows));
    status("Données enregistrées localement.");
  }

  function resetLocal() {
    if (!confirm("Réinitialiser les données locales ?")) return;
    localStorage.removeItem(KEY);
    rows = [];
    render();
    status("Local storage réinitialisé.");
  }

  function render() {
    const q = filters.q.value.trim().toLowerCase();
    const fClient = filters.client.value;
    const fOwner = filters.owner.value;
    const fStep = filters.step.value;
    const fNext = filters.nextdate.value ? new Date(filters.nextdate.value) : null;

    tbody.innerHTML = "";

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

    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
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
    const dlg = document.getElementById('dlg');
    const frm = document.getElementById('frm');
    frm.reset();
    editingIndex = -1;

    // populate selects again in case lists changed
    fillSelect(document.getElementById('c-client'), ClientList);
    fillSelect(document.getElementById('c-owner'), OwnerList);
    fillSelect(document.getElementById('c-step'), SalesStepList);

    if (row) {
      editingIndex = rows.findIndex(x => x["Opportunity.ID"] === row["Opportunity.ID"]);
      for (const el of frm.elements) {
        if (el.name && row[el.name] != null) el.value = row[el.name];
      }
      document.getElementById('dlg-delete').style.display = "inline-block";
    } else {
      document.getElementById('dlg-delete').style.display = "none";
    }

    dlg.showModal();

    document.getElementById('dlg-ok').onclick = (e) => {
      e.preventDefault();
      const data = formToObj(frm);
      if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"] || "")) {
        alert("Opportunity.ID doit suivre le format OPP-000123 (3 lettres, tiret, 6 chiffres).");
        return;
      }
      if (editingIndex >= 0) {
        rows[editingIndex] = data;
      } else {
        // prevent duplicates
        if (rows.some(x => x["Opportunity.ID"] === data["Opportunity.ID"])) {
          alert("Cet ID existe déjà.");
          return;
        }
        rows.push(data);
      }
      dlg.close();
      render();
      saveLocal();
    };

    document.getElementById('dlg-delete').onclick = (e) => {
      e.preventDefault();
      if (editingIndex < 0) return;
      if (!confirm("Supprimer cette opportunité ?")) return;
      rows.splice(editingIndex,1);
      dlg.close();
      render();
      saveLocal();
    };
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

  // --- Import/Export ---
  async function exportXLSX() {
    if (!window.XLSX) { alert("Librairie XLSX non chargée (connexion requise)."); return; }
    const wb = XLSX.utils.book_new();
    const headers = ["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const data = [headers, ...rows.map(r => headers.map(h => r[h] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Opportunities");
    const out = XLSX.write(wb, {bookType:"xlsx", type:"array"});
    saveAs(new Blob([out], {type:"application/octet-stream"}), "Opportunities.xlsx");
  }

  async function exportCSV() {
    if (!window.XLSX) { alert("Librairie XLSX non chargée (connexion requise)."); return; }
    const headers = ["Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID","Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep","Opportunity.SalesCycleLastChangeDate","Opportunity.NextActionDate","Opportunity.NextAction","Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"];
    const rowsOut = [headers.join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))];
    const blob = new Blob([rowsOut.join("\n")], {type:"text/csv;charset=utf-8"});
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
    let newRows = [];
    if (file.name.endsWith(".csv")) {
      const txt = new TextDecoder("utf-8").decode(new Uint8Array(buf));
      const lines = txt.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",");
      for (let i=1;i<lines.length;i++){
        const vals = parseCSVLine(lines[i]);
        const obj = {};
        headers.forEach((h,idx) => obj[h.trim()] = vals[idx] ?? "");
        newRows.push(obj);
      }
    } else {
      const wb = XLSX.read(buf, {type:"array"});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, {header:1});
      const headers = aoa[0];
      for (let i=1;i<aoa.length;i++){
        const row = aoa[i];
        const obj = {};
        headers.forEach((h,idx) => obj[h] = row[idx] ?? "");
        newRows.push(obj);
      }
    }
    // Merge by Opportunity.ID (upsert)
    let countNew = 0, countUpd = 0;
    for (const r of newRows) {
      if (!r["Opportunity.ID"]) continue;
      const idx = rows.findIndex(x => x["Opportunity.ID"] === r["Opportunity.ID"]);
      if (idx >= 0) { rows[idx] = r; countUpd++; } else { rows.push(r); countNew++; }
    }
    render(); saveLocal();
    status(`Import terminé: ${countNew} ajout(s), ${countUpd} mise(s) à jour.`);
    ev.target.value = "";
  }

  function parseCSVLine(line) {
    const out=[], re=/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g; // allows quotes
    let m;
    while ((m = re.exec(line)) !== null) {
      out.push((m[1]||m[2]||"").replace(/""/g,'"'));
    }
    return out;
  }
})();