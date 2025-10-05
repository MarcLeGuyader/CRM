// modules/filters/filters.js
// Module 2 — Filter Console
// Responsibility: render a filter panel and emit filter events via a bus.
// API: mount(container, initial?:Filters, bus?:EventBus) -> { open(), close(), get(), destroy() }
// Events emitted: filters.changed, filters.cleared, filters.toggled
// Events listened: ui.banner.filter, ui.banner.reset
//
// Filters type:
// {
//   q?: string,
//   client?: string,
//   closeDate?: { from?: string, to?: string }, // ISO yyyy-mm-dd
//   salesStep?: string
// }
//
export function createFiltersModule(bus) {
  // Minimal guard: allow injecting a bus; if none, provide a local fallback.
  const localBus = bus || (function(){
    const map = new Map();
    return {
      on(topic, handler){ if(!map.has(topic)) map.set(topic, new Set()); map.get(topic).add(handler); return () => map.get(topic)?.delete(handler); },
      emit(topic, payload){ (map.get(topic) || []).forEach(h => { try{ h(payload); } catch(e){ console.error(e);} }); }
    };
  })();

  function mount(container, initial = {}){
    if (!container) throw new Error("filters.mount: container is required");

    // Build DOM
    container.innerHTML = `
      <section class="filters-panel hidden" aria-hidden="true" data-open="false">
        <header class="filters-header">
          <h2>Filters</h2>
          <button type="button" class="btn btn-small" id="flt-close" aria-label="Close filters">Close</button>
        </header>
        <div class="filters-body">
          <label>Search
            <input type="search" id="flt-q" placeholder="Company, contact, title…" />
          </label>
          <label>Client
            <input type="text" id="flt-client" placeholder="Client…"/>
          </label>
          <div class="row-2">
            <label>Close date (from)
              <input type="date" id="flt-date-from"/>
            </label>
            <label>Close date (to)
              <input type="date" id="flt-date-to"/>
            </label>
          </div>
          <label>Sales step
            <select id="flt-step">
              <option value="">(All)</option>
              <option>Discovery</option>
              <option>Qualified</option>
              <option>Solution selling</option>
              <option>Negotiation</option>
              <option>Closing</option>
              <option>Won</option>
              <option>Lost</option>
            </select>
          </label>
        </div>
        <footer class="filters-actions">
          <button type="button" class="btn" id="flt-apply">Apply</button>
          <button type="button" class="btn" id="flt-clear">Clear</button>
        </footer>
      </section>
    `;

    const panel = container.querySelector(".filters-panel");
    const els = {
      q: container.querySelector("#flt-q"),
      client: container.querySelector("#flt-client"),
      dateFrom: container.querySelector("#flt-date-from"),
      dateTo: container.querySelector("#flt-date-to"),
      step: container.querySelector("#flt-step"),
      btnApply: container.querySelector("#flt-apply"),
      btnClear: container.querySelector("#flt-clear"),
      btnClose: container.querySelector("#flt-close"),
    };

    // initialize values
    const init = (obj) => {
      if (!obj) return;
      if (obj.q != null) els.q.value = obj.q;
      if (obj.client != null) els.client.value = obj.client;
      if (obj.closeDate?.from) els.dateFrom.value = obj.closeDate.from;
      if (obj.closeDate?.to) els.dateTo.value = obj.closeDate.to;
      if (obj.salesStep != null) els.step.value = obj.salesStep;
    };
    init(initial);

    // helpers
    const isOpen = () => panel.getAttribute("data-open") === "true";
    const open = () => {
      panel.classList.remove("hidden");
      panel.setAttribute("data-open", "true");
      panel.setAttribute("aria-hidden", "false");
      localBus.emit("filters.toggled", { open: true });
    };
    const close = () => {
      panel.classList.add("hidden");
      panel.setAttribute("data-open", "false");
      panel.setAttribute("aria-hidden", "true");
      localBus.emit("filters.toggled", { open: false });
    };
    const toggle = () => isOpen() ? close() : open();

    const read = () => {
      const out = {};
      const q = els.q.value.trim();
      const client = els.client.value.trim();
      const from = els.dateFrom.value;
      const to = els.dateTo.value;
      const step = els.step.value;

      if (q) out.q = q;
      if (client) out.client = client;
      if (from || to) out.closeDate = { ...(from && {from}), ...(to && {to}) };
      if (step) out.salesStep = step;
      return out;
    };

    const clear = () => {
      els.q.value = "";
      els.client.value = "";
      els.dateFrom.value = "";
      els.dateTo.value = "";
      els.step.value = "";
      localBus.emit("filters.cleared", {});
    };

    // events (UI)
    els.btnApply.addEventListener("click", () => {
      localBus.emit("filters.changed", read());
    });
    els.btnClear.addEventListener("click", () => clear());
    els.btnClose.addEventListener("click", () => close());

    // events (Bus)
    const off1 = localBus.on("ui.banner.filter", () => toggle());
    const off2 = localBus.on("ui.banner.reset",  () => { clear(); });
    const off3 = localBus.on("filters.set", (payload) => { // optional external setter
      init(payload || {});
      localBus.emit("filters.changed", read());
    });

    // API surface
    const api = {
      open, close,
      get: read,
      destroy(){
        off1?.(); off2?.(); off3?.();
        container.innerHTML = "";
      }
    };
    return api;
  }

  return { mount, bus: localBus };
}
