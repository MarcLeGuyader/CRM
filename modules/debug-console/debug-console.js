/* modules/debug-console/debug-console.js
 * Debug Console (Module 08)
 * - Uses global event bus at window.bus (required)
 * - Listens to `ui.banner.debug` to toggle (or force open/close via payload.force)
 * - Public API: mount(container, { open=true, minLines=10 }): { log(topic, payload), toggle(force?), clear() }
 */
(function(){
  function findBus(){
    if (window.bus && typeof window.bus.on === 'function' && typeof window.bus.emit === 'function') return window.bus;
    console.warn('[debug-console] No global bus found at window.bus. Debug console will still render, but won\'t auto-toggle from ui.banner.debug.');
    return {
      on: function(){ return function(){}; },
      emit: function(){ return 0; }
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
      .debug-console__pre { margin:0; overflow:auto; white-space:pre; font-size:12px; line-height:1.5; }
      .debug-console__time { color:#8aa0ff; }
      .debug-console__topic { color:#9fe8a6; }
      .debug-console__payload { color:#e0e6f6; }
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

    const opts = Object.assign({ open: true, minLines: 10 }, options || {});
    const root = document.createElement('section');
    root.className = 'debug-console' + (opts.open ? '' : ' hidden');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Debug console');

    // Assure une hauteur minimale côté conteneur, même si le CSS externe est absent
    // 10 lignes ≈ 12px * 1.5 * 10 = 180px
    container.style.minHeight = container.style.minHeight || '180px';

    root.innerHTML = [
      '<div class="debug-console__hdr">',
        '<strong>Debug console</strong>',
        '<div class="debug-console__btns">',
          '<button class="debug-console__btn" data-act="copy" aria-label="Copy log to clipboard">Copy</button>',
          '<button class="debug-console__btn" data-act="clear" aria-label="Clear log">Clear</button>',
          '<button class="debug-console__btn" data-act="hide" aria-label="Hide debug console">Hide</button>',
        '</div>',
      '</div>',
      // on pose min-height directement ici pour iPad/Safari
      '<pre class="debug-console__pre" id="debug-log" aria-live="polite" style="min-height:180px; max-height:260px;"></pre>'
    ].join('');
    container.appendChild(root);

    const pre = root.querySelector('#debug-log');

    function ensureMinLines(){
      // S’il n’y a pas assez de lignes, on complète avec des lignes vides
      const lines = (pre.textContent.match(/\n/g) || []).length + (pre.textContent ? 1 : 0);
      if (lines < opts.minLines) {
        const missing = opts.minLines - lines;
        pre.textContent += (pre.textContent ? '' : '') + '\n'.repeat(missing);
      }
      // scroll toujours en bas
      pre.scrollTop = pre.scrollHeight;
    }

    function write(topic, payload){
      // On enlève d’éventuels padding vides de fin pour insérer la nouvelle ligne proprement
      pre.textContent = pre.textContent.replace(/\n+$/,'');
      const line = `[${fmt(Date.now())}] <${topic}> ${safeJSON(payload)}`;
      pre.textContent += (pre.textContent ? "\n" : "") + line;
      ensureMinLines();
    }

    function toggle(force){
      const show = (force === undefined) ? root.classList.contains('hidden') : !!force;
      root.classList.toggle('hidden', !show);
      root.setAttribute('aria-hidden', String(!show));
      if (show) ensureMinLines();
    }

    function clear(){
      pre.textContent = '';
      ensureMinLines();
    }

    async function copyAll(){
      const btn = root.querySelector('[data-act="copy"]');
      const text = pre.textContent || '';
      try{
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        if (btn){
          const old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(()=>{ btn.textContent = old; }, 1200);
        }
      }catch(err){
        console.error('[debug-console] copy failed:', err);
        if (btn){
          const old = btn.textContent; btn.textContent = 'Copy failed'; setTimeout(()=>{ btn.textContent = old; }, 1500);
        }
      }
    }

    // wire buttons
    root.querySelector('[data-act="copy"]').addEventListener('click', copyAll);
    root.querySelector('[data-act="clear"]').addEventListener('click', clear);
    root.querySelector('[data-act="hide"]').addEventListener('click', function(){ toggle(false); });

    // toggle via bannière; possibilité de forcer avec payload.force = true/false
    const unsub = bus.on('ui.banner.debug', function(payload){
      write('ui.banner.debug', payload || {});
      if (payload && typeof payload.force === 'boolean') toggle(payload.force);
      else toggle();
    });

    // API publique
    const api = { log: write, toggle, clear };

    // Ouvert + 10 lignes au montage
    if (opts.open) {
      toggle(true);
    }
    ensureMinLines();

    root.__debugConsoleAPI = api;
    window.DebugConsole = Object.assign({}, window.DebugConsole || {}, { mount, api }); // conserve compat
    return api;
  }

  // UMD-ish global
  window.DebugConsole = { mount };
})();
