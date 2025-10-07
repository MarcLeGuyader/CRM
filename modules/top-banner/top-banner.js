// modules/top-banner/top-banner.js
// Top Banner module — renders header UI and emits ui.banner.* events via the shared event bus
// + Ajout d'un bouton "Inline edit" qui émet ui.opptable.inline.toggle { on:boolean }

export function mount(container, bus) {
  if (!container) throw new Error("mount(container, ...) requires a container element");
  if (!bus || typeof bus.emit !== "function") throw new Error("mount(...) requires a bus with emit(topic, payload)");

  // Resolve logo relative to this module
  const logoSrc = new URL('./maello-logo.png', import.meta.url).href;
  const title = "CRM";

  // Build DOM
  const root = document.createElement("header");
  root.className = "banner";
  root.style.cssText = [
    "display:flex","justify-content:space-between","align-items:center",
    "background:rgb(75,134,128)","color:white","padding:10px 20px",
    "box-shadow:0 2px 4px rgba(0,0,0,0.2)","flex-wrap:wrap","gap:10px"
  ].join(";");

  const left = document.createElement("div");
  left.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap";
  const right = document.createElement("div");
  right.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap";

  // helper to make buttons
  const mkBtn = (id, text, extraStyles="") => {
    const b = document.createElement("button");
    b.id = id; b.textContent = text;
    b.style.cssText = "background:#fff;color:rgb(75,134,128);border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-weight:600;" + extraStyles;
    b.onpointerdown = () => { b.style.transform = "scale(0.98)"; };
    b.onpointerup = () => { b.style.transform = "none"; };
    return b;
  };

  // Logo + title
  const img = document.createElement("img");
  img.src = logoSrc;
  img.alt = "Logo";
  img.style.cssText = "height:40px;width:40px;object-fit:contain;background:#ffffff22;border-radius:6px";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  h1.style.cssText = "font-size:22px;margin:0 16px 0 8px;font-weight:700;letter-spacing:.2px";

  left.appendChild(img);
  left.appendChild(h1);
  left.appendChild(mkBtn("btnFilter","Filter"));
  left.appendChild(mkBtn("btnNew","+ New opportunity"));

  // Bouton Debug (transparent)
  right.appendChild(mkBtn("btnDebug","🐞 Debug","border:1px solid #fff;background:transparent;color:#fff;"));

  // === Nouveau : bouton Inline edit (toggle)
  const btnInline = mkBtn("btnInline","Inline edit","border:1px solid #fff;background:transparent;color:#fff;");
  btnInline.setAttribute("aria-pressed", "false");
  // état local
  let inlineOn = false;
  const updateInlineBtn = () => {
    btnInline.textContent = inlineOn ? "Inline edit: ON" : "Inline edit";
    btnInline.setAttribute("aria-pressed", String(inlineOn));
    // petit feedback visuel
    btnInline.style.background = inlineOn ? "#fff" : "transparent";
    btnInline.style.color = inlineOn ? "rgb(75,134,128)" : "#fff";
  };
  right.appendChild(btnInline);

  right.appendChild(mkBtn("btnReset","⟲ Reset"));
  right.appendChild(mkBtn("btnUpload","Upload Excel CRM data"));
  right.appendChild(mkBtn("btnExport","Export Excel CRM"));
  right.appendChild(mkBtn("btnSave","Save","background:#2f9e44;color:#fff;"));

  root.appendChild(left);
  root.appendChild(right);
  container.appendChild(root);

  // Emit helper
  const emit = (topic, extra = {}) => bus.emit(topic, { ts: Date.now(), ...extra });

  // Wire events
  root.querySelector("#btnFilter")?.addEventListener("click", () => emit("ui.banner.filter"));
  root.querySelector("#btnNew")?.addEventListener("click", () => emit("ui.banner.new"));
  root.querySelector("#btnDebug")?.addEventListener("click", () => emit("ui.banner.debug"));
  root.querySelector("#btnReset")?.addEventListener("click", () => {
    // reset inline state visuellement aussi
    inlineOn = false;
    updateInlineBtn();
    emit("ui.banner.reset");
  });
  root.querySelector("#btnUpload")?.addEventListener("click", () => emit("ui.banner.upload"));
  root.querySelector("#btnExport")?.addEventListener("click", () => emit("ui.banner.export"));
  root.querySelector("#btnSave")?.addEventListener("click", () => emit("ui.banner.save"));

  // Toggle inline edit
  btnInline.addEventListener("click", () => {
    inlineOn = !inlineOn;
    updateInlineBtn();
    emit("ui.opptable.inline.toggle", { on: inlineOn });
  });

  // Si un autre module veut forcer l'état :
  // bus.emit('ui.opptable.inline.set', { on:true|false })
  bus.on?.("ui.opptable.inline.set", ({ on }) => {
    if (typeof on === "boolean") {
      inlineOn = on;
      updateInlineBtn();
    }
  });

  // init visuel
  updateInlineBtn();

  return { destroy(){ root.remove(); } };
}
