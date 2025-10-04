export function importXlsx(arrayBuffer){
  if(!window.XLSX) throw new Error('XLSX lib missing');
  const wb=XLSX.read(arrayBuffer,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const aoa=XLSX.utils.sheet_to_json(ws,{header:1});
  if(!aoa||!aoa.length) return []; const headers=(aoa[0]||[]).map(h=>String(h||'')); const rows=[];
  for(let i=1;i<aoa.length;i++){ const r=aoa[i]||[]; const obj={}; headers.forEach((h,idx)=> obj[h]=r[idx]??'' ); rows.push(obj); }
  return rows;
}
