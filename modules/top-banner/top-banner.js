// modules/top-banner/top-banner.js
// Top Banner module — renders header UI and emits ui.banner.* events via the shared event bus
//
// API:
//   mount(container: HTMLElement, bus: { emit(topic, payload) })
//   -> returns { destroy(): void }
//
// Emits (payload = { ts: number }):
//   ui.banner.filter
//   ui.banner.new
//   ui.banner.debug
//   ui.banner.reset
//   ui.banner.upload
//   ui.banner.export
//   ui.banner.save
//

export function mount(container, bus) {
  if (!container) throw new Error("mount(container, ...) requires a container element");
  if (!bus || typeof bus.emit !== "function") throw new Error("mount(...) requires a bus with emit(topic, payload)");

  const logoSrc = "./modules/top-banner/maello-logo.png";
  const title = "CRM";

  // Create DOM
  const root = document.createElement("header");
  root.className = "banner";
  root.innerHTML = `
    <div class="left">
      <img src="${logoSrc}" alt="Logo" class="logo"/>
      <h1 class="title">${title}</h1>
      <button id="btnFilter" class="btn" aria-label="Open filters">Filter</button>
      <button id="btnNew" class="btn primary" aria-label="Create opportunity">+ New opportunity</button>
    </div>
    <div class="right">
      <button id="btnDebug" class="btn outline" aria-label="Toggle debug">🐞 Debug</button>
      <button id="btnReset" class="btn" aria-label="Reset state">⟲ Reset</button>
      <button id="btnUpload" class="btn" aria-label="Upload Excel/CSV">Upload Excel CRM data</button>
      <button id="btnExport" class="btn" aria-label="Export Excel/CSV">Export Excel CRM</button>
      <button id="btnSave" class="btn success" aria-label="Save">Save</button>
    </div>
  `;

  container.appendChild(root);

  // Emit helper with timestamp
  const emit = (topic) => bus.emit(topic, { ts: Date.now() });



  //////////////. a enlever

  // Debug log for logo loading


  // Resolve logo path relative to THIS module file (not index.html)
const logoSrc = new URL('./maello-logo.png', import.meta.url).href;
const title = "CRM";

// ... after container.appendChild(root); keep the debug but log the real src:
const img = root.querySelector('.logo');
if (img) {
  console.log('[TopBanner] Looking for logo at:', img.src); // <-- this is the actual resolved URL
  img.addEventListener('load',   () => console.log('[TopBanner] ✅ Logo loaded:', img.src));
  img.addEventListener('error',  () => console.error('[TopBanner] ⚠️ Failed to load logo:', img.src));
} else {
  console.error('[TopBanner] ❌ No .logo element found');
}

  ///////////////////
  
  // Wire events
  root.querySelector("#btnFilter")?.addEventListener("click", () => emit("ui.banner.filter"));
  root.querySelector("#btnNew")?.addEventListener("click", () => emit("ui.banner.new"));
  root.querySelector("#btnDebug")?.addEventListener("click", () => emit("ui.banner.debug"));
  root.querySelector("#btnReset")?.addEventListener("click", () => emit("ui.banner.reset"));
  root.querySelector("#btnUpload")?.addEventListener("click", () => emit("ui.banner.upload"));
  root.querySelector("#btnExport")?.addEventListener("click", () => emit("ui.banner.export"));
  root.querySelector("#btnSave")?.addEventListener("click", () => emit("ui.banner.save"));

  return {
    destroy() {
      root.remove();
    }
  };
}
