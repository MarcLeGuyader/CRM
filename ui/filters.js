import { state } from '../core/state.js';

export function bindFilter(onChange){
  const q = document.getElementById('flt-q');
  const stage = document.getElementById('flt-stage');
  const handler = ()=> onChange();
  q.addEventListener('input', handler);
  stage.addEventListener('change', handler);
}

export function filterData(rows){
  const q = document.getElementById('flt-q').value.trim().toLowerCase();
  const stage = document.getElementById('flt-stage').value;
  return rows.filter(r => {
    const full = `${r.company} ${r.contactFirst} ${r.contactLast} ${r.opportunity} ${r.owner} ${r.stage}`.toLowerCase();
    const okQ = !q || full.includes(q);
    const okS = !stage || r.stage === stage;
    return okQ && okS;
  });
}
