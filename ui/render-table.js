
// ui/render-table.js — render opportunities table with company + contact, zebra rows
(function(){
  function $(sel, root = document) { return root.querySelector(sel); }
  function ensureTable() {
    let t = $('#oppsTable');
    if (!t) {
      t = document.createElement('table');
      t.id = 'oppsTable';
      t.style.width = '100%';
      t.style.borderCollapse = 'collapse';
      t.innerHTML = `
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">ID</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">Company</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">Contact</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">Title</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc;">Value</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">Stage</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      // Insert below filter panel if present
      const anchor = document.querySelector('#filterPanel') || document.body;
      anchor.parentNode.insertBefore(t, anchor.nextSibling);
    }
    return t;
  }

  function render(ctx, rows, zebraRGB) {
    const table = ensureTable();
    const tb = table.querySelector('tbody');
    tb.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (i % 2 === 1) tr.style.background = zebraRGB || 'rgb(216,214,208)';
      tr.innerHTML = `
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${r.id || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">${r.company || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${[r.contactFirst||'', r.contactLast||''].filter(Boolean).join(' ')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${r.title || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${Number(r.value||0).toLocaleString(undefined,{style:'currency',currency:'EUR'})}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${r.stage || ''}</td>
      `;
      tb.appendChild(tr);
    });
    // empty state
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" style="padding:12px;color:#666;font-style:italic;">No opportunities match your filter.</td>`;
      tb.appendChild(tr);
    }
  }

  window.RenderTable = { render };
})();
