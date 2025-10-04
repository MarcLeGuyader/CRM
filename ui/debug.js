
// ui/debug.js — bottom debug console (toggleable) bound to existing DOM
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const panel = ()=> $('#debug-console');
  const body  = ()=> $('#debug-log');
  const closeBtn = ()=> $('#btn-close-debug');

  function ensure(){
    const p = panel(); if (!p) return;
    closeBtn() && closeBtn().addEventListener('click', () => toggle());
  }
  function log(line){
    if (!body()) return;
    const ts = new Date().toISOString().split('T')[1].split('.')[0];
    body().textContent += `[${ts}] ${line}\n`;
    body().scrollTop = body().scrollHeight;
  }
  function toggle(){
    const p = panel(); if (!p) return;
    const hidden = p.classList.toggle('hidden');
    p.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }
  function init(){ ensure(); }

  window.DebugConsole = { init, toggle, log };
})();
