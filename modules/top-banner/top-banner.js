// modules/top-banner/top-banner.js
// Top Banner module — renders header UI and emits ui.banner.* events via the shared event bus

// modules/top-banner/top-banner.js
import './top-banner.css'; // <-- local CSS for banner

export function mount(container, bus) {
  if (!container) throw new Error("mount(container, ...) requires a container element");
  if (!bus || typeof bus.emit !== "function") throw new Error("mount(...) requires a bus with emit(topic, payload)");

  const logoSrc = new URL('./maello-logo.png', import.meta.url).href;
  const title = "CRM maello";

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

  const emit = (topic) => bus.emit(topic, { ts: Date.now() });

  root.querySelector("#btnFilter")?.addEventListener("click", () => emit("ui.banner.filter"));
  root.querySelector("#btnNew")?.addEventListener("click", () => emit("ui.banner.new"));
  root.querySelector("#btnDebug")?.addEventListener("click", () => emit("ui.banner.debug"));
  root.querySelector("#btnReset")?.addEventListener("click", () => emit("ui.banner.reset"));
  root.querySelector("#btnUpload")?.addEventListener("click", () => emit("ui.banner.upload"));
  root.querySelector("#btnExport")?.addEventListener("click", () => emit("ui.banner.export"));
  root.querySelector("#btnSave")?.addEventListener("click", () => emit("ui.banner.save"));

  return { destroy() { root.remove(); } };
}
