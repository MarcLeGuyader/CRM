// modules/dialogs/dialogs.js
// Stackable dialogs: Opportunity, Company, Contact
// ESM export + global fallback (window.Dialogs)

/**
 * @typedef {Object} Opportunity
 * @property {string} [id]
 * @property {string} [name]
 * @property {string} [salesStep]
 * @property {string} [client]
 * @property {string} [owner]
 * @property {string} [companyId]
 * @property {string} [contactId]
 * @property {string} [notes]
 * @property {string} [nextAction]
 * @property {string} [nextActionDate]
 * @property {string} [closingDate]
 * @property {number} [closingValue]
 */

/**
 * mountDialogs
 * @param {HTMLElement} container host element
 * @param {Object} opts
 * @param {Object} [opts.bus] optional event-bus (on/emit) — not required for basic test
 * @param {(id:string)=>string} [opts.resolveCompanyName]
 * @param {(id:string)=>string} [opts.resolveContactName]
 * @returns {{ open(type:string,payload?:any):void, closeTop():void }}
 */
export function mountDialogs(container, opts={}){
  const bus = opts.bus || null;
  const resolveCompanyName = opts.resolveCompanyName || (()=>'');
  const resolveContactName = opts.resolveContactName || (()=>'');

  /** @type {HTMLElement[]} */
  const stack = [];
  function updateStackBadge(){
    let el = document.querySelector('.stack-note');
    if (!el){ el = document.createElement('div'); el.className = 'stack-note'; document.body.appendChild(el); }
    el.textContent = `Dialogs stack: ${stack.length}`;
  }

  function supportsNativeDialog(){
    return typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal;
  }

  function makeShell(title){
    let wrapper, card, head, body, actions;
    if (supportsNativeDialog()){
      wrapper = document.createElement('dialog');
      wrapper.addEventListener('close', ()=>{});
      wrapper.style.padding = '0'; // reset default dialog padding
      card = document.createElement('div'); card.className='dialog-card';
      head = document.createElement('div'); head.className='dialog-head';
      body = document.createElement('div'); body.className='dialog-body';
      actions = document.createElement('div'); actions.className='dialog-actions';
      wrapper.appendChild(card); card.appendChild(head); card.appendChild(body); card.appendChild(actions);
      wrapper.classList.add('crm-dialog');
    } else {
      wrapper = document.createElement('div'); wrapper.className='dialog-backdrop crm-dialog';
      card = document.createElement('div'); card.className='dialog-card';
      head = document.createElement('div'); head.className='dialog-head';
      body = document.createElement('div'); body.className='dialog-body';
      actions = document.createElement('div'); actions.className='dialog-actions';
      wrapper.appendChild(card); card.appendChild(head); card.appendChild(body); card.appendChild(actions);
    }
    const h = document.createElement('h3'); h.className='dialog-title'; h.textContent = title;
    const closeBtn = document.createElement('button'); closeBtn.className='btn'; closeBtn.textContent='Cancel';
    closeBtn.addEventListener('click', () => closeTop());
    head.appendChild(h); head.appendChild(closeBtn);
    return { wrapper, body, actions };
  }

  function push(el){
    stack.push(el);
    document.body.appendChild(el);
    if (el.tagName.toLowerCase()==='dialog'){ try{ el.showModal(); }catch{ el.show(); } }
    updateStackBadge();
  }
  function pop(){
    const el = stack.pop();
    if (!el) return;
    if (el.tagName.toLowerCase()==='dialog'){
      try{ el.close(); }catch{}
    }
    el.remove();
    updateStackBadge();
  }

  function closeTop(){ pop(); }

  // --- Dialog types
  function openOpportunity(payload /** @type {Partial<Opportunity>} */ = {}){
    const { wrapper, body, actions } = makeShell(payload.id ? 'Edit Opportunity' : 'New Opportunity');
    body.innerHTML = `
      <div class="grid">
        <label>Name<input id="f-name" value="${(payload.name||'').replace(/"/g,'&quot;')}"></label>
        <label>Sales step
          <select id="f-step">
            ${['','Discovery','Qualified','Solution selling','Negotiation','Closing','Won','Lost'].map(v=>{
              const sel = v===payload.salesStep ? 'selected' : '';
              return '<option '+sel+'>'+v+'</option>';
            }).join('')}
          </select>
        </label>
        <label>Client<input id="f-client" value="${(payload.client||'').replace(/"/g,'&quot;')}"></label>
        <label>Owner<input id="f-owner" value="${(payload.owner||'').replace(/"/g,'&quot;')}"></label>
        <label>Company
          <div>
            <span class="badge">ID: ${payload.companyId||''}</span>
            <a class="fake" id="lnk-company"> ${resolveCompanyName(payload.companyId||'') || '(open company)'} </a>
          </div>
        </label>
        <label>Contact
          <div>
            <span class="badge">ID: ${payload.contactId||''}</span>
            <a class="fake" id="lnk-contact"> ${resolveContactName(payload.contactId||'') || '(open contact)'} </a>
          </div>
        </label>
        <label>Notes<textarea id="f-notes">${(payload.notes||'')}</textarea></label>
        <label>Next action<input id="f-nextAction" value="${(payload.nextAction||'').replace(/"/g,'&quot;')}"></label>
        <label>Next action date<input id="f-nextActionDate" type="date" value="${payload.nextActionDate||''}"></label>
        <label>Closing date<input id="f-closingDate" type="date" value="${payload.closingDate||''}"></label>
        <label>Closing value (€)<input id="f-closingValue" type="number" min="0" step="0.01" value="${payload.closingValue ?? ''}"></label>
      </div>
    `;
    const save = document.createElement('button'); save.className='btn primary'; save.textContent='Save';
    // Option 3B (visual only): close without emitting save/validate
    save.addEventListener('click', ()=>{
      // Optional: bus?.emit('dialogs.opportunity.saved.locally', {/*snapshot for debug*/});
      closeTop();
    });
    actions.appendChild(save);
    push(wrapper);

    body.querySelector('#lnk-company')?.addEventListener('click', ()=>{
      openCompany({ id: payload.companyId||'', name: resolveCompanyName(payload.companyId||'') });
    });
    body.querySelector('#lnk-contact')?.addEventListener('click', ()=>{
      openContact({ id: payload.contactId||'', name: resolveContactName(payload.contactId||'') , companyId: payload.companyId||'' });
    });
  }

  function openCompany(payload = { id:'', name:'' }){
    const { wrapper, body, actions } = makeShell('Company');
    const name = payload.name || resolveCompanyName(payload.id||'') || '(unknown company)';
    body.innerHTML = `
      <div>
        <div><span class="badge">ID: ${payload.id||''}</span></div>
        <h4>${name}</h4>
        <div id="company-contacts" class="list"></div>
      </div>
    `;
    // In test mode we don't query data; allow injecting a list via payload.contacts
    const list = Array.isArray(payload.contacts) ? payload.contacts : [];
    const ul = document.createElement('ul');
    list.forEach(c => {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.className='fake'; a.textContent = c.name || `(contact ${c.id})`;
      a.addEventListener('click', ()=> openContact({ id:c.id, name:c.name, companyId: payload.id }));
      li.appendChild(a);
      ul.appendChild(li);
    });
    body.querySelector('#company-contacts')?.appendChild(ul);
    const btn = document.createElement('button'); btn.className='btn primary'; btn.textContent='OK';
    btn.addEventListener('click', closeTop);
    actions.appendChild(btn);
    push(wrapper);
  }

  function openContact(payload = { id:'', name:'', companyId:'' }){
    const { wrapper, body, actions } = makeShell('Contact');
    const name = payload.name || resolveContactName(payload.id||'') || '(unknown contact)';
    const companyName = resolveCompanyName(payload.companyId||'') || '(company)';
    body.innerHTML = `
      <div>
        <div><span class="badge">ID: ${payload.id||''}</span></div>
        <h4>${name}</h4>
        <div>Company: <a class="fake" id="lnk-company">${companyName}</a> <span class="badge">ID: ${payload.companyId||''}</span></div>
      </div>
    `;
    body.querySelector('#lnk-company')?.addEventListener('click', ()=> openCompany({ id: payload.companyId, name: companyName }));
    const btn = document.createElement('button'); btn.className='btn primary'; btn.textContent='OK';
    btn.addEventListener('click', closeTop);
    actions.appendChild(btn);
    push(wrapper);
  }

  // Optional: wire to bus if provided
  if (bus){
    bus.on('dialogs.open.opportunity', (p)=> openOpportunity(p||{}));
    bus.on('dialogs.open.company', (p)=> openCompany(p||{}));
    bus.on('dialogs.open.contact', (p)=> openContact(p||{}));
    bus.on('dialogs.closeTop', ()=> closeTop());
  }

  // Mount host marker (not strictly required)
  container.dataset.module = 'dialogs';

  return {
    open(type, payload){
      if (type==='opportunity') return openOpportunity(payload);
      if (type==='company') return openCompany(payload);
      if (type==='contact') return openContact(payload);
    },
    closeTop
  };
}

// Global fallback
if (typeof window !== 'undefined'){
  window.Dialogs = window.Dialogs || {};
  window.Dialogs.mount = (container, opts) => mountDialogs(container, opts);
}
