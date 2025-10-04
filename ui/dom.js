export const q = sel => document.querySelector(sel);
export function on(sel, ev, cb){ const el=q(sel); if(el) el.addEventListener(ev, cb); }
export function setText(sel, txt){ const el=q(sel); if(el) el.textContent=txt; }
export function status(msg){ setText('#status', msg); }
export function fillSelect(sel, arr){
  if (!sel) return;
  sel.innerHTML="";
  for (const v of arr){
    const o=document.createElement('option');
    o.value=v; o.textContent=v||"(all)";
    sel.appendChild(o);
  }
}
