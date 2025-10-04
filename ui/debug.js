
// ui/debug.js — bottom debug console (toggleable)
(function(){
  function $(sel, root = document) { return root.querySelector(sel); }

  function ensureConsole() {
    let c = $('#debugConsole');
    if (!c) {
      c = document.createElement('div');
      c.id = 'debugConsole';
      c.style.display = 'none';
      c.style.position = 'fixed';
      c.style.left = '0';
      c.style.right = '0';
      c.style.bottom = '0';
      c.style.maxHeight = '28vh';
      c.style.overflow = 'auto';
      c.style.background = '#111';
      c.style.color = '#ddd';
      c.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      c.style.fontSize = '12px';
      c.style.borderTop = '2px solid #333';
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #333;">
          <strong>Debug Console</strong>
          <button id="dbgClear" type="button">Clear</button>
          <button id="dbgHide" type="button">Hide</button>
        </div>
        <pre class="log-body" style="margin:0;padding:8px 10px;white-space:pre-wrap;"></pre>
      `;
      document.body.appendChild(c);
      $('#dbgClear', c).addEventListener('click', () => { $('.log-body', c).textContent = ''; });
      $('#dbgHide', c).addEventListener('click', () => { c.style.display = 'none'; });
    }
    return c;
  }

  function log(line) {
    const c = ensureConsole();
    const body = c.querySelector('.log-body');
    const ts = new Date().toISOString().split('T')[1].split('.')[0];
    body.textContent += `[${ts}] ${line}\n`;
    body.scrollTop = body.scrollHeight;
  }

  function toggle() {
    const c = ensureConsole();
    c.style.display = (c.style.display === 'none') ? 'block' : 'none';
  }

  function init() {
    ensureConsole();
  }

  window.DebugConsole = { init, toggle, log };
})();
