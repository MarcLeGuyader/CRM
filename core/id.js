export function nextOppId(rows){
  const p="OPP-"; let max=0;
  for (const r of rows){
    const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||"");
    if (m){ const n=parseInt(m[1],10); if (n>max) max=n; }
  }
  return p + String(max+1).padStart(6,"0");
}
