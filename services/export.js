export function exportCsv(rows){
  const headers=['Company','ContactFirst','ContactLast','Opportunity','Amount','Stage','Owner'];
  const join=v=>{ const s=String(v??''); return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; };
  const body=rows.map(r=>[r.company,r.contactFirst,r.contactLast,r.opportunity,r.amount,r.stage,r.owner].map(join).join(',')).join('\n');
  return headers.join(',')+'\n'+body;
}
export function exportXlsx(rows){
  if(!window.XLSX) throw new Error('XLSX lib missing');
  const headers=['Company','ContactFirst','ContactLast','Opportunity','Amount','Stage','Owner'];
  const aoa=[headers, ...rows.map(r=>[r.company,r.contactFirst,r.contactLast,r.opportunity,r.amount,r.stage,r.owner])];
  const ws=XLSX.utils.aoa_to_sheet(aoa); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Opportunities');
  return XLSX.write(wb,{bookType:'xlsx',type:'array'});
}
