import { q, setText } from './dom.js';
import { nextOppId } from '../core/id.js';

const hasNativeDialog = typeof HTMLDialogElement!=="undefined"
  && HTMLDialogElement.prototype.showModal
  && HTMLDialogElement.prototype.close;
const dlgShow  = d => hasNativeDialog ? d.showModal() : d.setAttribute("open","");
const dlgClose = (d,v) => hasNativeDialog ? d.close(v||"") : d.removeAttribute("open");

export function attachDialog(ctx, render){
  const dlg=q('#dlg'), frm=q('#frm');
  const fId=q('#f-id');
  const fCoName=q('#f-company-name'), fCoId=q('#f-company-id');
  const fCtName=q('#f-contact-name'), fCtId=q('#f-contact-id');

  document.getElementById('dlg-cancel')?.addEventListener('click', ev=>{ev.preventDefault(); dlgClose(dlg,'cancel')});
  document.getElementById('dlg-ok')?.addEventListener('click', ev=>{
    ev.preventDefault();
    const data=formToObj(frm);
    if (!/^[A-Z]{3}-\d{6}$/.test(data["Opportunity.ID"]||"")) data["Opportunity.ID"]=nextOppId(ctx.rows);
    if (ctx.editingIndex>=0) ctx.rows[ctx.editingIndex]=data;
    else {
      if (ctx.rows.some(x=>x["Opportunity.ID"]===data["Opportunity.ID"])) { alert("This ID already exists."); return; }
      ctx.rows.push(data);
    }
    dlgClose(dlg,'ok'); render(); ctx.save();
  });

  fCoName?.addEventListener('change', ()=>{ const n=fCoName.value; if (ctx.companies[n]) fCoId.value=ctx.companies[n]; });
  fCtName?.addEventListener('change', ()=>{ const n=fCtName.value; if (ctx.contacts[n])  fCtId.value=ctx.contacts[n];  });

  ctx.openEditor = (row)=>{
    frm.reset(); ctx.editingIndex=-1;
    fillSelect(document.getElementById('c-client'), ctx.settings.clients);
    fillSelect(document.getElementById('c-owner'),  ctx.settings.owners);
    fillSelect(document.getElementById('c-step'),   ctx.settings.steps);
    refreshCompanySelect(ctx); refreshContactSelect(ctx);

    if (!row){
      fId.value = nextOppId(ctx.rows);
      setText('#dlg-title',"New");
      fCoName && (fCoName.value=""); fCoId && (fCoId.value="");
      fCtName && (fCtName.value=""); fCtId && (fCtId.value="");
    } else {
      ctx.editingIndex = ctx.rows.findIndex(x=>x["Opportunity.ID"]===row["Opportunity.ID"]);
      for (const el of frm.elements){ if(el.name && row[el.name]!=null) el.value=row[el.name]; }
      const compNm = companyNameFromId(ctx, (row["Opportunity.CompanyID"]||"").toString().trim());
      const contNm = contactDisplay(ctx, (row["Opportunity.ContactID"]||"").toString().trim());
      if (fCoName) fCoName.value = compNm || "";
      if (fCtName) fCtName.value = contNm || "";
      setText('#dlg-title',"Edit");
    }
    dlgShow(dlg);
  };
}

function formToObj(form){
  const out={};
  for (const el of form.elements){ if (el.name) out[el.name]=el.value; }
  return out;
}

function fillSelect(sel, arr){
  if (!sel) return;
  sel.innerHTML="";
  sel.add(new Option("(select)",""));
  for (const v of arr){ sel.add(new Option(v,v)); }
}

function refreshCompanySelect(ctx){
  const sel=document.getElementById('f-company-name'); if (!sel) return;
  sel.innerHTML=""; sel.add(new Option("(select)",""));
  Object.keys(ctx.companies).sort((a,b)=>a.localeCompare(b)).forEach(n=> sel.add(new Option(n,n)) );
}

function refreshContactSelect(ctx){
  const sel=document.getElementById('f-contact-name'); if (!sel) return;
  sel.innerHTML=""; sel.add(new Option("(select)",""));
  const names = Object.entries(ctx.contInfo)
    .map(([id,info]) => (info.name || ([info.first||"",info.last||""].join(" ").trim())) )
    .filter(Boolean)
    .sort((a,b)=>a.localeCompare(b));
  names.forEach(n=> sel.add(new Option(n,n)) );
}

function companyNameFromId(ctx, id){
  const idt=(id||"").toString().trim();
  if (!idt) return "";
  if (ctx.compInfo[idt]?.name) return ctx.compInfo[idt].name;
  for (const [name, cid] of Object.entries(ctx.companies)) {
    if (String(cid).trim()===idt) { ctx.compInfo[idt] = {name}; ctx.save(); return name; }
  }
  return "";
}

function contactDisplay(ctx, id){
  const idt=(id||"").toString().trim();
  if (!idt) return "";
  const info = ctx.contInfo[idt];
  if (info) {
    const first=(info.first||"").trim(), last=(info.last||"").trim(), name=(info.name||"").trim();
    if (first || last) return `${first} « ${last} »`.trim();
    return name;
  }
  for (const [name, cid] of Object.entries(ctx.contacts)) { if (String(cid).trim()===idt) return name; }
  return "";
}
