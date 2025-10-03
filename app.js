/* Opportunities Manager
   Version V2 - 03/10/2025 18:20 (heure française)
*/
document.addEventListener("DOMContentLoaded", () => {
  const rows = [];
  const tbody = document.getElementById('tbody');
  const dlg = document.getElementById('dlg');
  const frm = document.getElementById('frm');
  const fId = document.getElementById('f-id');

  function render() {
    tbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r["Opportunity.ID"]}</td><td>${r["Opportunity.Name"]}</td><td>${r["Opportunity.Client"]}</td><td><button>✏️</button></td>`;
      tr.querySelector('button').onclick = () => openDialog(r);
      tbody.appendChild(tr);
    }
  }

  function nextId() { return "OPP-" + String(rows.length+1).padStart(6,"0"); }

  function openDialog(r) {
    frm.reset();
    if (r) {
      fId.value = r["Opportunity.ID"];
      frm.elements["Opportunity.Name"].value = r["Opportunity.Name"];
      frm.elements["Opportunity.Client"].value = r["Opportunity.Client"];
    } else {
      fId.value = nextId();
    }
    dlg.setAttribute("open","");
  }

  document.getElementById('btn-new').onclick = () => openDialog(null);
  document.getElementById('dlg-cancel').onclick = (e) => { e.preventDefault(); dlg.removeAttribute("open"); };
  document.getElementById('dlg-ok').onclick = (e) => {
    e.preventDefault();
    const r = {
      "Opportunity.ID": fId.value,
      "Opportunity.Name": frm.elements["Opportunity.Name"].value,
      "Opportunity.Client": frm.elements["Opportunity.Client"].value
    };
    const idx = rows.findIndex(x => x["Opportunity.ID"] === r["Opportunity.ID"]);
    if (idx>=0) rows[idx]=r; else rows.push(r);
    dlg.removeAttribute("open");
    render();
  };

  render();
});
