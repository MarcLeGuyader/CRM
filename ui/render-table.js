
(function(){
  function fmtCompany(o){
    const company = o.company || '';
    const contact = [o.contactFirst, o.contactLast].filter(Boolean).join(' ');
    return company && contact ? company + ' · ' + contact : (company || contact || '');
  }
  function money(n){
    if (n == null || n === '') return '';
    const v = Number(n);
    if (isNaN(v)) return String(n);
    return v.toLocaleString(undefined, {style:'currency', currency:'EUR', maximumFractionDigits:0});
  }
  window.renderOpportunities = function(opps){
    const tbody = document.getElementById('opps-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    opps.forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = [
        `<td>${fmtCompany(o)}</td>`,
        `<td>${o.title || ''}</td>`,
        `<td>${o.stage || ''}</td>`,
        `<td>${money(o.amount)}</td>`,
        `<td>${o.owner || ''}</td>`
      ].join('');
      tbody.appendChild(tr);
    });
  };
})();
