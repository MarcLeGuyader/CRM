export function importCsv(text){
  const lines=text.split(/\r?\n/).filter(Boolean); if(!lines.length) return [];
  const rawHeaders=splitCsvLine(lines[0]); const headers=rawHeaders.map(h=>normalize(h));
  const rows=[]; for(let i=1;i<lines.length;i++){ const vals=splitCsvLine(lines[i]); const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=vals[idx]??''; }); rows.push(obj); }
  return rows;
}
function splitCsvLine(line){ const out=[], re=/(?:^|,)(?:"([^\"]*(?:""[^\"]*)*)"|([^",]*))/g; let m; while((m=re.exec(line))!==null) out.push((m[1]||m[2]||'').replace(/""/g,'"')); return out; }
function normalize(h){ if(!h) return ''; let w=String(h).trim().toLowerCase().replace(/[._-]/g,' '); w=w.replace(/\s+/g,' ').trim();
  const map={'opportunity id':'Opportunity.ID','id':'Opportunity.ID','opportunity name':'Opportunity.Name','name':'Opportunity.Name','title':'Opportunity.Name','client':'Opportunity.Client','owner':'Opportunity.Owner','sales step':'Opportunity.SalesStep','stage':'Opportunity.SalesStep','closing value':'Opportunity.ClosingValue','amount':'Opportunity.ClosingValue'};
  return map[w]||h;
}
