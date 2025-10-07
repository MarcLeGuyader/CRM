(function(global){
  function fmtMoney(v, currency){
    if (v == null || v === '' || isNaN(Number(v))) return '';
    try{ return Number(v).toLocaleString(undefined, { style:'currency', currency: currency || 'EUR' }); }
    catch{ return String(v); }
  }
  function iso(d){ return d || ''; }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  const RX = { opp:/^OPP-\d{6}$/, cmpy:/^CMPY-\d{6}$/, cont:/^CON-\d{6}$/ };

  function mount(container, bus, options){
    const state = { rows:[], isInlineEdit:false, clientList:[], currency:'EUR' };
    const trace = (topic,p)=>{ try{ bus.emit('opptable.trace',{topic,...p}); }catch{} };
    const wrap=document.createElement('div');
    wrap.className='opps-wrap';
    wrap.innerHTML=`
    <table class="opps-table">
      <colgroup>
        <col class="col-name"><col class="col-step"><col class="col-client">
        <col class="col-owner"><col class="col-company"><col class="col-contact">
        <col class="col-notes"><col class="col-next"><col class="col-nextdt">
        <col class="col-closedt"><col class="col-value">
      </colgroup>
      <thead><tr>
        <th>Name</th><th>Step</th><th>Client</th><th>Owner</th><th>Company</th>
        <th>Contact</th><th>Notes</th><th>Next action</th><th>Next date</th>
        <th>Closing date</th><th>Value</th>
      </tr></thead><tbody></tbody></table>`;
    container.innerHTML='';container.appendChild(wrap);
    const tbody=wrap.querySelector('tbody');

    function render(){
      tbody.innerHTML=(state.rows||[]).map(r=>{
        const id=r.id||r['Opportunity.ID']||'',notes=r.notes||r['Opportunity.Notes']||'',next=r.nextAction||r['Opportunity.NextAction']||'';
        if(state.isInlineEdit) return `<tr data-id="${id}" class="inline">
          <td><textarea>${esc(notes)}</textarea></td><td><textarea>${esc(next)}</textarea></td></tr>`;
        return `<tr data-id="${id}"><td>${esc(notes)}</td><td>${esc(next)}</td></tr>`;
      }).join('');
      trace('render.done',{rows:(state.rows||[]).length});
    }

    bus.on('data.loaded',payload=>{ if(payload?.rows){state.rows=payload.rows;} render(); });
    bus.on('ui.opptable.inline.toggle',({on})=>{ state.isInlineEdit=!!on; render(); });

    return{ render:(r)=>{state.rows=r||[];render();} };
  }
  global.OpportunityTable={ mount };
})(window);
