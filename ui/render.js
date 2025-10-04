import { state } from '../core/state.js';

const tbody = document.querySelector('#opp-table tbody');

export function renderTable(){
  tbody.innerHTML = state.rows.map(row => {
    const full = `${row.contactFirst || ''} ${row.contactLast || ''}`.trim();
    return `<tr>
      <td>
        <div class="cell-company">
          <span class="company">${row.company || ''}</span>
          <span class="contact">${full || ''}</span>
        </div>
      </td>
      <td>${row.opportunity || ''}</td>
      <td>${row.amount?.toLocaleString?.() ?? row.amount ?? ''}</td>
      <td>${row.stage || ''}</td>
      <td>${row.owner || ''}</td>
    </tr>`;
  }).join('');
}
