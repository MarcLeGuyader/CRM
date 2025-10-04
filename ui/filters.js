
// ui/filters.js — collapsible filter console bound to existing DOM
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const panel = ()=> $('#filter-console');
  const input = ()=> $('#flt-q');
  const closeBtn = ()=> $('#btn-close-filter');

  function ensureWiring(){
    const p = panel(); if (!p) return;
    closeBtn() && closeBtn().addEventListener('click', () => toggle());
    input() && input().addEventListener('keydown', (e)=>{ if (e.key === 'Escape') { input().value=''; onQuery(''); } });
  }

  let onQuery = ()=>{};

  function toggle(){
    const p = panel(); if (!p) return;
    const hidden = p.classList.toggle('hidden');
    p.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (!hidden && input()) input().focus();
  }
  function resetUI(){
    if (input()) input().value='';
  }
  function init(ctx, onQ){
    onQuery = onQ || (()=>{});
    ensureWiring();
    if (input()){
      input().value = ctx?.filters?.q || '';
      input().addEventListener('input', ()=> onQuery(input().value));
    }
  }

  window.FilterConsole = { init, toggle, resetUI };
})();
