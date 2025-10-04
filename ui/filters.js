
// ui/filters.js — collapsible filter console
(function(){
  function $(sel, root = document) { return root.querySelector(sel); }
  const PANEL_ID = 'filterPanel';

  function ensurePanel() {
    let p = $('#'+PANEL_ID);
    if (!p) {
      p = document.createElement('div');
      p.id = PANEL_ID;
      p.style.display = 'none';
      p.style.padding = '8px 12px';
      p.style.borderBottom = '1px solid #ccc';
      p.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
          <label for="filterInput" style="font-weight:600;">Filter</label>
          <input id="filterInput" type="text" placeholder="Company, contact or title…" style="flex:1; padding:6px 8px;">
          <button id="filterClear" type="button">Clear</button>
        </div>
      `;
      const anchor = document.body; // insert below top bar if available
      const topBar = document.querySelector('.topbar') || document.querySelector('header') || null;
      if (topBar && topBar.parentNode) {
        topBar.parentNode.insertBefore(p, topBar.nextSibling);
      } else {
        anchor.insertBefore(p, anchor.firstChild);
      }
    }
    return p;
  }

  function toggle() {
    const p = ensurePanel();
    p.style.display = (p.style.display === 'none') ? 'block' : 'none';
    const input = $('#filterInput', p);
    if (p.style.display === 'block') input && input.focus();
  }

  function resetUI() {
    const p = ensurePanel();
    const input = $('#filterInput', p);
    if (input) input.value = '';
  }

  function init(ctx, onQuery) {
    const p = ensurePanel();
    const input = $('#filterInput', p);
    const clear = $('#filterClear', p);
    if (input) {
      input.value = ctx.filters?.q || '';
      input.addEventListener('input', () => onQuery(input.value));
      input.addEventListener('keydown', (e)=>{
        if (e.key === 'Escape') { input.value = ''; onQuery(''); }
      });
    }
    if (clear) clear.addEventListener('click', () => { if (input){ input.value=''; onQuery(''); } });
  }

  window.FilterPanel = { init, toggle, resetUI };
})();
