import { state } from './core/state.js';
import { log } from './ui/debug.js';
import { renderTable } from './ui/render.js';
import { filterData, bindFilter } from './ui/filters.js';

// Wire header buttons
const el = (id)=>document.getElementById(id);
const filterPanel = el('filter-console');
const debugPanel = el('debug-console');

el('btn-filter').addEventListener('click', ()=>{
  const isHidden = filterPanel.classList.toggle('hidden');
  filterPanel.setAttribute('aria-hidden', isHidden);
});
el('btn-close-filter').addEventListener('click', ()=>{
  filterPanel.classList.add('hidden'); filterPanel.setAttribute('aria-hidden','true');
});

el('btn-debug').addEventListener('click', ()=>{
  const isHidden = debugPanel.classList.toggle('hidden');
  debugPanel.setAttribute('aria-hidden', isHidden);
});
el('btn-close-debug').addEventListener('click', ()=>{
  debugPanel.classList.add('hidden'); debugPanel.setAttribute('aria-hidden','true');
});

// Stubs
el('btn-new').addEventListener('click', ()=> log('Open dialog: New opportunity (stub).'));
el('btn-reset').addEventListener('click', ()=> { state.rows = [...state._seed]; renderTable(); log('State reset.'); });
el('btn-upload').addEventListener('click', ()=> log('Upload Excel (stub).'));
el('btn-export').addEventListener('click', ()=> log('Export Excel (stub).'));
el('btn-save').addEventListener('click', ()=> log('Save (stub).'));

// Init
bindFilter(()=>{
  state.rows = filterData(state._seed);
  renderTable();
});

// Seed demo data
state._seed = [
  { company:'Maello', contactFirst:'Marc', contactLast:'LeGuyader', opportunity:'New portal', amount:12000, stage:'Discovery', owner:'Marc' },
  { company:'Globex', contactFirst:'Jane', contactLast:'Doe', opportunity:'CRM rollout', amount:54000, stage:'Proposal', owner:'Alex' },
  { company:'Initech', contactFirst:'Peter', contactLast:'Gibbons', opportunity:'Licensing', amount:9000, stage:'Won', owner:'Sam' },
  { company:'Umbrella', contactFirst:'Alice', contactLast:'Abernathy', opportunity:'Renewal', amount:23000, stage:'Lost', owner:'Nina' }
];
state.rows = [...state._seed];
renderTable();
