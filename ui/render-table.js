
// ui/render-table.js — render opportunities in existing table (#opp-table)
(function(){
  function $(s, r=document){ return r.querySelector(s); }
  function euro(n){ try{ return Number(n||0).toLocaleString(undefined,{style:'currency',currency:'EUR'}); }catch{ return n; } }

  function render(ctx, rows, zebraRGB){
    const tb = $('#opp-table tbody');
    if (!tb) return;
    tb.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (i % 2 === 1) tr.style.background = zebraRGB || 'rgb(216,214,208)';
      const full = [r.contactFirst||'', r.contactLast||''].filter(Boolean).join(' ').trim();
      tr.innerHTML = `
        <td>
          <div class="cell-company">
            <span class="company">${(r.company||'')}</span>
            <span class="contact">${full}</span>
          </div>
        </td>
        <td>${r.title || ''}</td>
        <td style="text-align:right;">${euro(r.value)}</td>
        <td>${r.stage || ''}</td>
        <td>${r.owner || ''}</td>
      `;
      tb.appendChild(tr);
    });
    if (!rows.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="padding:12px;color:#666;font-style:italic;">No opportunities match your filter.</td>`;
      tb.appendChild(tr);
    }
  }

  window.RenderTable = { render };
})();
