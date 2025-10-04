import { normalizeHeader } from './shared.js';

export async function importCsv(ctx, file){
  const txt = await file.text();
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;

  const rawHeaders = lines[0].split(",").map(h=>h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  ctx.dbg?.("CSV headers(raw):", rawHeaders, "mapped:", headers);

  const rowsIn=[];
  for (let i=1;i<lines.length;i++){
    const vals=parseCSVLine(lines[i]);
    const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=vals[idx]??""; });
    rowsIn.push(obj);
  }

  const clean = rowsIn.filter(r => (r["Opportunity.Name"]||"").toString().trim().length>0);

  mergeRows(ctx, clean);
  ctx.save();
}

function parseCSVLine(line){
  const out=[], re=/(?:^|,)(?:"([^\"]*(?:""[^\"]*)*)"|([^",]*))/g; let m;
  while((m=re.exec(line))!==null) out.push((m[1]||m[2]||"").replace(/""/g,'"'));
  return out;
}

function mergeRows(ctx, list){
  let added=0, updated=0;
  for (const r of list){
    if (!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"]||"")) r["Opportunity.ID"]=nextId(ctx.rows);
    const idx = ctx.rows.findIndex(x=>x["Opportunity.ID"]===r["Opportunity.ID"]);
    if (idx>=0){ ctx.rows[idx]=r; updated++; } else { ctx.rows.push(r); added++; }
  }
  ctx.dbg?.("Import CSV done.", {added, updated});
}

function nextId(rows){
  const p="OPP-"; let max=0;
  for (const r of rows){ const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||""); if(m){ const n=parseInt(m[1],10); if(n>max) max=n; } }
  return p+String(max+1).padStart(6,"0");
}
