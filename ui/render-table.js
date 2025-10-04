import { q, setText } from './dom.js';

export function renderTable(ctx){
  const tb=q('#tbody'); if (!tb) return; tb.innerHTML="";

  const qv=(q('#q')?.value||"").trim().toLowerCase();
  const fClient=q('#f-client')?.value||"";
  const fOwner=q('#f-owner')?.value||"";
  const fStep=q('#f-step')?.value||"";
  const fNext=q('#f-nextdate')?.value? new Date(q('#f-nextdate').value) : null;

  const filtered = ctx.rows.filter(r => {
    const name=((r["Opportunity.Name"]||"")+"").trim();
    if (!name) return false; // hide empty rows
    if (fClient && r["Opportunity.Client"]!==fClient) return false;
    if (fOwner && r["Opportunity.Owner"]!==fOwner) return false;
    if (fStep && r["Opportunity.SalesStep"]!==fStep) return false;
    if (fNext) { const d=r["Opportunity.NextActionDate"]?new Date(r["Opportunity.NextActionDate"]):null; if (!d || d<fNext) return false; }
    if (qv){
      if (qv==="overdue"){
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

  for (const r of filtered){
    const tr=document.createElement('tr');

    const t0=document.createElement('td');
    const b=document.createElement('button'); b.textContent="✏️"; b.title="Edit";
    b.addEventListener('click', ()=>ctx.openEditor(r));
    t0.appendChild(b); tr.appendChild(t0);

    const compId = String(r["Opportunity.CompanyID"] || "").trim();
    const contId = String(r["Opportunity.ContactID"] || "").trim();
    const compName = ctx.compById?.[compId] || companyNameFromId(ctx, compId);
     const contName = ctx.contById?.[contId] || contactDisplay(ctx, contId);
    
    const cells=[
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
    for (const v of cells){ const td=document.createElement('td'); td.textContent=v; tr.appendChild(td); }
    tb.appendChild(tr);
  }

  setText('#status', `${filtered.length} opportunity(ies) shown / ${ctx.rows.length}`);
}

function companyNameFromId(ctx, id){
  const idt=(id||"").toString().trim();
  if (!idt) return "";
  if (ctx.compInfo[idt]?.name) return ctx.compInfo[idt].name;
  for (const [name, cid] of Object.entries(ctx.companies)) {
    if (String(cid).trim()===idt) { ctx.compInfo[idt] = {name}; ctx.save(); return name; }
  }
  return "";
}

function contactDisplay(ctx, id){
  const idt=(id||"").toString().trim();
  if (!idt) return "";
  const info = ctx.contInfo[idt];
  if (info) {
    const first=(info.first||"").trim(), last=(info.last||"").trim(), name=(info.name||"").trim();
    if (first || last) return `${first} « ${last} »`.trim();
    return name;
  }
  for (const [name, cid] of Object.entries(ctx.contacts)) { if (String(cid).trim()===idt) return name; }
  return "";
}
