// modules/top-banner/top-banner.js
// Minimal, self-contained banner with inline styles and robust logo handling.
export function mount(container, bus) {
  if (!container) throw new Error("mount(container, ...) requires a container element");
  if (!bus || typeof bus.emit !== "function") throw new Error("mount(...) requires a bus with emit(topic, payload)");

  // 1) Resolve logo relative to this file and add a cache-buster
  const logoSrc = new URL('./maello-logo.png?v=2', import.meta.url).href;
  const title = "CRM";

  // 2) Build DOM with inline styles (no external CSS dependencies)
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
    b.onpointerdown = () => b.style.transform = "scale(0.98)";
    b.onpointerup = () => b.style.transform = "none";
    return b;
  };

  // logo + title
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

  right.appendChild(mkBtn("btnDebug","🐞 Debug","border:1px solid #fff;background:transparent;color:#fff;"));
  right.appendChild(mkBtn("btnReset","⟲ Reset"));
  right.appendChild(mkBtn("btnUpload","Upload Excel CRM data"));
  right.appendChild(mkBtn("btnExport","Export Excel CRM"));
  right.appendChild(mkBtn("btnSave","Save","background:#2f9e44;color:#fff;"));

  // status line (ALWAYS visible, helps debug)
  const status = document.createElement("div");
  status.style.cssText = "width:100%;font-size:12px;color:#fffa; margin-top:4px";
  status.textContent = `Logo path: ${logoSrc}`;

  root.appendChild(left);
  root.appendChild(right);
  root.appendChild(status);
  container.appendChild(root);

  // 3) Robust logo diagnostics
  console.log("[TopBanner] resolved logo URL:", img.src);
  img.addEventListener("load", () => {
    console.log("[TopBanner] ✅ logo loaded:", img.src);
    status.textContent = `Logo loaded ✓ — ${img.src}`;
    status.style.color = "#e7ffe7";
  });
  img.addEventListener("error", () => {
    console.error("[TopBanner] ⚠️ failed to load logo:", img.src);
    status.textContent = `⚠️ Failed to load logo — ${img.src}`;
    status.style.color = "#ffe3e3";
    // visual fallback so layout doesn’t break
    img.replaceWith(Object.assign(document.createElement("div"), {
      textContent: "🟩", style: "font-size:28px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:#ffffff22;border-radius:6px"
    }));
  });

  // 4) Emit helper
  const emit = (topic) => bus.emit(topic, { ts: Date.now() });

  // 5) Wire events
  root.querySelector("#btnFilter")?.addEventListener("click", () => emit("ui.banner.filter"));
  root.querySelector("#btnNew")?.addEventListener("click", () => emit("ui.banner.new"));
  root.querySelector("#btnDebug")?.addEventListener("click", () => emit("ui.banner.debug"));
  root.querySelector("#btnReset")?.addEventListener("click", () => emit("ui.banner.reset"));
  root.querySelector("#btnUpload")?.addEventListener("click", () => emit("ui.banner.upload"));
  root.querySelector("#btnExport")?.addEventListener("click", () => emit("ui.banner.export"));
  root.querySelector("#btnSave")?.addEventListener("click", () => emit("ui.banner.save"));

  return { destroy(){ root.remove(); } };
}
