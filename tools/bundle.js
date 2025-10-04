// Snapshot de code pour collaboration : produit un JSON unique avec tous les fichiers.
const DEFAULT_FILES = [
  "index.html",
  "app.js",
  "manifest.json",
  "styles/main.css",
  "config/version.js",
  "config/settings.js",
  "core/storage.js",
  "core/id.js",
  "core/state.js",
  "services/shared.js",
  "services/import-xlsx.js",
  "services/import-csv.js",
  "services/export.js",
  "ui/dom.js",
  "ui/filters.js",
  "ui/debug.js",
  "ui/dialog.js",
  "ui/render-table.js",
  ".github/workflows/pages.yml"
];

const $ = s => document.querySelector(s);
const filesTA = $("#files");
const outTA = $("#out");
const statusEl = $("#status");
const btnGen = $("#btn-gen");
const btnCopy = $("#btn-copy");

const djb2 = (str) => {
  let h = 5381;
  for (let i=0; i<str.length; i++) h = ((h<<5)+h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8,"0");
};

async function readVersion() {
  // Essaye l'import ESM, sinon parse le fichier brut
  try {
    const mod = await import("../config/version.js");
    return (mod?.VERSION_STAMP) || "";
  } catch {
    try {
      const txt = await fetch("../config/version.js").then(r=>r.text());
      const m = /VERSION_STAMP\s*=\s*["'`](.+?)["'`]/.exec(txt);
      return m ? m[1] : "";
    } catch { return ""; }
  }
}

async function fetchText(path) {
  const res = await fetch("../" + path);
  if (!res.ok) throw new Error(`Fetch failed ${path}: ${res.status}`);
  return await res.text();
}

async function generate() {
  btnGen.disabled = true;
  btnCopy.disabled = true;
  statusEl.textContent = "Generating…";
  outTA.value = "";

  try {
    const version = await readVersion();
    const list = (filesTA.value.trim() ? filesTA.value.split(/\r?\n/) : DEFAULT_FILES)
                  .map(s => s.trim()).filter(Boolean);

    const files = [];
    for (const p of list) {
      try {
        const content = await fetchText(p);
        files.push({
          path: p,
          size: content.length,
          hash: djb2(content),
          content
        });
      } catch (e) {
        files.push({
          path: p,
          error: String(e.message || e),
        });
      }
    }

    const bundle = {
      meta: {
        project: "CRM_Modular_Full",
        version,
        generatedAt: new Date().toISOString(),
        totalFiles: files.length
      },
      files
    };

    outTA.value = JSON.stringify(bundle, null, 2);
    btnCopy.disabled = false;
    statusEl.textContent = `Done. ${files.length} files.`;
    statusEl.classList.remove("ok");
  } catch (e) {
    statusEl.textContent = "Error: " + (e.message || e);
  } finally {
    btnGen.disabled = false;
  }
}

async function copyOut() {
  try {
    await navigator.clipboard.writeText(outTA.value || "");
    statusEl.textContent = "Copied to clipboard.";
    statusEl.classList.add("ok");
    setTimeout(()=>statusEl.classList.remove("ok"), 1500);
  } catch {
    outTA.select();
    document.execCommand("copy");
  }
}

filesTA.value = DEFAULT_FILES.join("\n");
btnGen.addEventListener("click", generate);
btnCopy.addEventListener("click", copyOut);
