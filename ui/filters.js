import { q, on, fillSelect } from './dom.js';
export function attachFilters(ctx, render){
  fillSelect(q('#f-client'), ["", ...ctx.settings.clients]);
  fillSelect(q('#f-owner'),  ["", ...ctx.settings.owners]);
  fillSelect(q('#f-step'),   ["", ...ctx.settings.steps]);

  ['#q','#f-client','#f-owner','#f-step','#f-nextdate'].forEach(sel => {
    const el = q(sel); if (el) el.addEventListener('input', render);
  });

  const container = document.querySelector('main.container');
  const panel = q('#filters-panel');
  const toggle = () => {
    const off = container.classList.toggle('no-filters');
    if (panel) panel.style.display = off ? 'none' : '';
  };
  on('#btn-toggle-filters','click', toggle);
}
