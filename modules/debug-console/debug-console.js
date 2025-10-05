/* modules/debug-console/debug-console.js
 * Debug Console (Module 08)
 * - Uses global event bus at window.bus (required)
 * - Listens to `ui.banner.debug` to toggle
 * - Public API: mount(container): { log(topic, payload), toggle(force?) }
 */
(function(){
  function findBus(){
    if (window.bus && typeof window.bus.on === 'function' && typeof window.bus.emit === 'function') return window.bus;
    console.warn('[debug-console] No global bus found at window.bus. Debug console will still render, but won\'t auto-toggle from ui.banner.debug.');
    // return a no-op shim to avoid crashes
    return {
      on: function(){ return function(){}; },
      emit: function(){ return 0; },
      count: function(){ return 0; },
      clear: function(){}
    };
  }

  function createStyles(){
    if (document.getElementById('debug-console-styles')) return;
    const css = `
      .debug-console { border-top:1px solid #e5e7eb; background:#0b1020; color:#e5e7eb; padding:10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .debug-console.hidden { display:none; }
      .debug-console__hdr { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:6px; }
      .debug-console__btns { display:flex; gap:8px; align-items:center; }
      .debug-console__btn { border:1px solid #2b3248; background:#121a32; color:#e5e7eb; border-radius:8px; padding:6px 10px; cursor:pointer; }
      .debug-console__btn:hover { border-color:#47506f; }
      .debug-console__pre { margin:0; max-height:260px; overflow:auto; white-space:pre; font-size:12px; line-height:1.5; }
      .debug-console__time { color:#8aa0ff; }
      .debug-console__topic { color:#9fe8a6; }
      .debug-console__payload { color:#e0e6f6; }
      .visually-hidden { position:absolute !important; height:1px; width:1px; overflow:hidden; clip:rect(1px,1px,1px,1px); white-space:nowrap; }
    `;
    const style = document.createElement('style');
    style.id = 'debug-console-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function fmt(ts){ try { return new Date(ts).toISOString(); } catch { return String(ts); } }
  function safeJSON(v){ try { return JSON.stringify(v); } catch { return String(v); } }

  function mount(container, options){
    const bus = findBus();
    createStyles();
    const root = document.createElement('section');
    root.className = 'debug-console hidden';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Debug console');
    root.innerHTML = [
      '<div class="debug-console__hdr">',
        '<strong>Debug console</strong>',
        '<div class="debug-console__btns">',
          '<button class="debug-console__btn" data-act="clear" aria-label="Clear log">Clear</button>',
          '<button class="debug-console__btn" data-act="hide" aria-label="Hide debug console">Hide</button>',
        '</div>',
      '</div>',
      '<pre class="debug-console__pre" id="debug-log" aria-live="polite"></pre>'
    ].join('');
    container.appendChild(root);
    const pre = root.querySelector('#debug-log');

    function write(topic, payload){
      const line = `[${fmt(Date.now())}] <${topic}> ${safeJSON(payload)}`;
      pre.textContent += (pre.textContent ? "\n" : "") + line;
      pre.scrollTop = pre.scrollHeight;
    }
    function toggle(force){
      const show = (force === undefined) ? root.classList.contains('hidden') : !!force;
      root.classList.toggle('hidden', !show);
      root.setAttribute('aria-hidden', String(!show));
    }
    function clear(){
      pre.textContent = '';
    }

    // wire buttons
    root.querySelector('[data-act="clear"]').addEventListener('click', clear);
    root.querySelector('[data-act="hide"]').addEventListener('click', function(){ toggle(false); });

    // listen to ui.banner.debug to toggle
    const unsub = bus.on('ui.banner.debug', function(payload){
      write('ui.banner.debug', payload || {});
      toggle();
    });

    // Optional convenience: expose a handler to log any event via the bus
    // Example usage: bus.on('opps.updated', d => api.log('opps.updated', d));
    const api = { log: write, toggle };

    // Keep a reference (helpful during tests)
    root.__debugConsoleAPI = api;
    return api;
  }

  // UMD-ish global
  window.DebugConsole = { mount };
})();
