// top-banner.js — Module 1: Top Banner
// Responsibility: render banner and emit UI events; no business logic here.

import { bus } from './bus.js';

export function mountTopBanner(container, opts={}){
  const logoSrc = opts.logoSrc || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" rx="4" ry="4" fill="%234B8680"/><text x="14" y="19" text-anchor="middle" font-family="Arial" font-size="14" fill="white">CRM</text></svg>';
  const title = opts.title || 'CRM';

  container.innerHTML = `
    <header class="banner" role="banner" aria-label="Top application bar">
      <div class="left">
        <img src="${logoSrc}" alt="Logo" class="logo"/>
        <h1 class="title">${title}</h1>
        <button id="btnFilter"   class="btn"      aria-label="Open filters">Filter</button>
        <button id="btnNew"      class="btn primary" aria-label="Create new opportunity" title="New opportunity">➕ New opportunity</button>
      </div>
      <div class="right">
        <button id="btnDebug"    class="btn outline" aria-label="Toggle debug console">🐞 Debug</button>
        <button id="btnReset"    class="btn" aria-label="Reset data" title="Reset">⟲ Reset</button>
        <button id="btnUpload"   class="btn" aria-label="Upload Excel CRM data">Upload Excel CRM data</button>
        <button id="btnExport"   class="btn" aria-label="Export Excel CRM">Export Excel CRM</button>
        <button id="btnSave"     class="btn success" aria-label="Save data">Save</button>
      </div>
    </header>
  `;

  // wire events -> ui.banner.* topics
  const now = () => ({ ts: Date.now() });
  const byId = id => container.querySelector('#'+id);

  byId('btnFilter') ?.addEventListener('click', ()=> bus.emit('ui.banner.filter', now()));
  byId('btnNew')    ?.addEventListener('click', ()=> bus.emit('ui.banner.new', now()));
  byId('btnDebug')  ?.addEventListener('click', ()=> bus.emit('ui.banner.debug', now()));
  byId('btnReset')  ?.addEventListener('click', ()=> bus.emit('ui.banner.reset', now()));
  byId('btnUpload') ?.addEventListener('click', ()=> bus.emit('ui.banner.upload', now()));
  byId('btnExport') ?.addEventListener('click', ()=> bus.emit('ui.banner.export', now()));
  byId('btnSave')   ?.addEventListener('click', ()=> bus.emit('ui.banner.save', now()));

  return {
    destroy(){
      container.innerHTML='';
    }
  };
}
