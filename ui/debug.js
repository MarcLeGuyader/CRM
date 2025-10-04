import { q } from './dom.js';
export function attachDebug(ctx){
  const btn=q('#btn-debug'), panel=q('#debug-panel'), log=q('#debug-log');
  if (!btn || !panel) return;
  btn.addEventListener('click', ()=>{
    const hidden=panel.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!hidden));
    panel.setAttribute('aria-hidden', String(hidden));
  });
  const bc=document.getElementById('debug-clear');
  const bcopy=document.getElementById('debug-copy');
  if (bc) bc.addEventListener('click', ()=>{ if(log) log.textContent=""; });
  if (bcopy) bcopy.addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(log?.textContent||""); alert("Debug log copied to clipboard."); }
    catch{
      const r=document.createRange(); r.selectNodeContents(log);
      const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.execCommand("copy"); sel.removeAllRanges();
      alert("Debug log selected. If copying failed, long-press and Copy.");
    }
  });
  ctx.dbg=(...args)=>{
    if (!ctx.settings.debug) return;
    console.log("[CRM]", ...args);
    if (!log) return;
    const line=args.map(a=>typeof a==='object'?JSON.stringify(a):String(a)).join(' ');
    log.textContent += (log.textContent ? "\n" : "") + line;
    log.scrollTop = log.scrollHeight;
  };
}
