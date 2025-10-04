export async function exportXlsx(ctx){
  if (!window.XLSX) { alert("Excel library not loaded."); return; }
  const wb=XLSX.utils.book_new();
  const headers=[
    "Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID",
    "Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep",
    "Opportunity.NextActionDate","Opportunity.NextAction",
    "Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"
  ];
  const data=[headers, ...ctx.rows.map(r=>headers.map(h=>r[h]??""))];
  const ws=XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Opportunities");

  const comp=Object.entries(ctx.companies);
  if (comp.length){
    const ch=["Company.Name","Company.ID"];
    const cd=[ch, ...comp.map(([n,id])=>[n,id])];
    const cws=XLSX.utils.aoa_to_sheet(cd);
    XLSX.utils.book_append_sheet(wb, cws, "Companies");
  }

  const cont=Object.entries(ctx.contInfo).map(([id,info])=>[(info.name || ([info.first||"",info.last||""].join(" ").trim())), id]);
  if (cont.length){
    const ch=["Contact.Name","Contact.ID"];
    const cd=[ch, ...cont];
    const cws=XLSX.utils.aoa_to_sheet(cd);
    XLSX.utils.book_append_sheet(wb, cws, "Contacts");
  }

  const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  saveAs(new Blob([out],{type:"application/octet-stream"}),"CRM_Opportunities.xlsx");
}

export async function exportCsv(ctx){
  const headers=[
    "Opportunity.ID","Opportunity.Name","Opportunity.CompanyID","Opportunity.ContactID",
    "Opportunity.Client","Opportunity.Owner","Opportunity.SalesStep",
    "Opportunity.NextActionDate","Opportunity.NextAction",
    "Opportunity.ClosingDate","Opportunity.ClosingValue","Opportunity.Notes"
  ];
  const lines=[headers.join(","), ...ctx.rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))];
  const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
  saveAs(blob,"CRM_Opportunities.csv");
}

function csvEscape(v){
  if (v==null) return "";
  const s=String(v);
  return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s;
}
