import { normalizeHeader } from './shared.js';

export async function importXlsx(ctx, file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf,{type:"array"});
  ctx.dbg?.("Sheets:", wb.SheetNames);

  const rowsIn = [];
  const oppWS = wb.Sheets["Opportunities"] || wb.Sheets[wb.SheetNames[0]];
  if (oppWS){
    const aoa = XLSX.utils.sheet_to_json(oppWS,{header:1});
    if (aoa && aoa.length){
      const rawHeaders=(aoa[0]||[]).map(h=>(h??"").toString().trim());
      const headers=rawHeaders.map(normalizeHeader);
      ctx.dbg?.("Opportunities headers(raw):", rawHeaders, "mapped:", headers);
      for (let i=1;i<aoa.length;i++){
        const r=aoa[i]; if(!r||!r.length) continue;
        const obj={}; headers.forEach((h,idx)=>{ if(h) obj[h]=r[idx]??""; });
        rowsIn.push(obj);
      }
    }
  }

  const companiesIn = {}, compInfoIn = {};
  const compWS = wb.Sheets["Companies"];
  if (compWS){
    const ca=XLSX.utils.sheet_to_json(compWS,{header:1});
    for (let i=1;i<ca.length;i++){
      const r=ca[i]||[];
      const name=(r[0]??"").toString().trim();
      const id  =(r[1]??"").toString().trim();
      if (name && id){ companiesIn[name]=id; compInfoIn[id]={name}; }
    }
  }

  const contactsIn={}, contInfoIn={};
  const contWS = wb.Sheets["Contacts"];
  if (contWS){
    const ca=XLSX.utils.sheet_to_json(contWS,{header:1});
    if (ca && ca.length){
      const headers=(ca[0]||[]).map(h=>(h??"").toString().trim());
      const hdrL=headers.map(h=>h.toLowerCase());
      let nameIdx = hdrL.findIndex(h => /(^|\b)(displayname|fullname|name)(\b|$)/.test(h));
      let firstIdx= hdrL.findIndex(h => /(^|\b)first(name)?(\b|$)/.test(h));
      let lastIdx = hdrL.findIndex(h => /(^|\b)last(name)?(\b|$)/.test(h));
      let idIdx   = hdrL.findIndex(h => /(^|\b)id(\b|$)/.test(h));
      if (idIdx<0) idIdx=1;
      const buildFromFirstLast = (nameIdx<0 && firstIdx>=0 && lastIdx>=0);
      ctx.dbg?.("Contacts headers:", headers, { nameIdx, firstIdx, lastIdx, idIdx, buildFromFirstLast });

      for (let i=1;i<ca.length;i++){
        const r=ca[i]||[];
        const id=(r[idIdx]??"").toString().trim();
        let name="", first="", last="";
        if (buildFromFirstLast){
          first=(r[firstIdx]??"").toString().trim();
          last =(r[lastIdx] ??"").toString().trim();
          name=[first,last].filter(Boolean).join(" ").trim();
        } else if (nameIdx>=0){
          name=(r[nameIdx]??"").toString().trim();
        }
        if (id && (name || first || last)){
          contactsIn[name || ([first,last].filter(Boolean).join(" ").trim())] = id;
          contInfoIn[id] = { name, first, last };
        }
      }
    }
  }

  const clean = rowsIn.filter(r => (r["Opportunity.Name"]||"").toString().trim().length>0);

  mergeRows(ctx, clean);
  Object.assign(ctx.companies, companiesIn);
  Object.assign(ctx.contacts,  contactsIn);
  Object.assign(ctx.compInfo,  compInfoIn);
  Object.assign(ctx.contInfo,  contInfoIn);
// (re)construire les index id -> nom après import
  import('../core/state.js').then(m => m.rebuildIndexes(ctx));
  ctx.save();
  ctx.dbg?.("Import done.", {rows: clean.length, companies: Object.keys(companiesIn).length, contacts: Object.keys(contInfoIn).length});
}

function mergeRows(ctx, list){
  let added=0, updated=0;
  for (const r of list){
    if (!/^[A-Z]{3}-\d{6}$/.test(r["Opportunity.ID"]||"")) r["Opportunity.ID"]=nextId(ctx.rows);
    const idx = ctx.rows.findIndex(x=>x["Opportunity.ID"]===r["Opportunity.ID"]);
    if (idx>=0){ ctx.rows[idx]=r; updated++; } else { ctx.rows.push(r); added++; }
  }
  ctx.dbg?.("Merge rows:", {added, updated});
}

function nextId(rows){
  const p="OPP-"; let max=0;
  for (const r of rows){ const m=/^OPP-(\d{6})$/.exec(r["Opportunity.ID"]||""); if(m){ const n=parseInt(m[1],10); if(n>max) max=n; } }
  return p+String(max+1).padStart(6,"0");
}
