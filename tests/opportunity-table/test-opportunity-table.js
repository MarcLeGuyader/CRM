
(function(){
  const resultsEl = document.getElementById('results');
  function assert(name, cond){
    const div = document.createElement('div');
    div.className = 'case ' + (cond ? 'ok' : 'ko');
    div.textContent = (cond ? '✔ ' : '✖ ') + name;
    resultsEl.appendChild(div);
  }

  // mount module
  const mountEl = document.getElementById('mount');
  const companies = { "C-1":"Maello" };
  const contacts = { "CT-1":{ firstName:"Marc", lastName:"Le Guyader", companyId:"C-1" } };
  function resolveCompanyName(id){ return companies[id]; }
  function resolveContactName(id){ const c = contacts[id]; return c ? (c.firstName+' '+c.lastName) : ''; }

  const table = OpportunityTable.mount(mountEl, bus, { resolveCompanyName, resolveContactName });

  // load data
  const rows = [{ id:"OPP-000001", name:"Test", salesStep:"Discovery", client:"X", owner:"Y", companyId:"C-1", contactId:"CT-1", closingValue:1000 }];
  bus.emit('data.loaded', { rows });

  // Assertion 1: row rendered
  const hasRow = !!document.querySelector('table.opps-table tbody tr');
  assert('renders one row', hasRow);

  // Assertion 2: clicking edit emits dialogs.open.opportunity
  const tdAction = document.querySelector('table.opps-table tbody tr td.action');
  tdAction.click();
  const evts1 = bus.take().filter(e => e.topic === 'dialogs.open.opportunity');
  assert('click edit emits dialogs.open.opportunity', evts1.length === 1 && evts1[0].payload.id === 'OPP-000001');

  // Assertion 3: clicking company emits dialogs.open.company
  const companyLink = document.querySelector('table.opps-table tbody tr [data-act="company"]');
  companyLink.click();
  const evts2 = bus.take().filter(e => e.topic === 'dialogs.open.company');
  assert('click company emits dialogs.open.company', evts2.length === 1 && evts2[0].payload.companyId === 'C-1');

  // Assertion 4: clicking contact emits dialogs.open.contact
  const contactLink = document.querySelector('table.opps-table tbody tr [data-act="contact"]');
  contactLink.click();
  const evts3 = bus.take().filter(e => e.topic === 'dialogs.open.contact');
  assert('click contact emits dialogs.open.contact', evts3.length === 1 && evts3[0].payload.contactId === 'CT-1');

  // Assertion 5: filters.changed hides row for unmatched client
  bus.emit('filters.changed', { client: 'Nope' });
  const noRow = !document.querySelector('table.opps-table tbody tr td.action');
  assert('filters.changed applies filtering', noRow);
})();
