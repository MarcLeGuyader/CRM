// CRM bundle generator — full recursive version (captures all project text files)
const EXCLUDED_DIRS = ['node_modules'];
const EXCLUDED_EXTS = ['.png','.jpg','.jpeg','.gif','.zip','.mp4','.mov','.pdf'];

const $ = s => document.querySelector(s);
const outTA = $("#out");
const statusEl = $("#status");
const btnGen = $("#btn-gen");
const btnCopy = $("#btn-copy");

const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
};

async function fetchText(path) {
  const res = await fetch("../" + path);
  if (!res.ok) throw new Error(`Fetch failed ${path}: ${res.status}`);
  return await res.text();
}

async function listFiles(base = ".", prefix = "") {
  const res = await fetch("../" + base);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll("a"))
    .map(a => a.getAttribute("href"))
    .filter(h => !!h && h !== "../");

  const files = [];
  for (const link of links) {
    const path = prefix + link.replace(/\/$/, "");
    const isDir = link.endsWith("/");
    if (isDir && !EXCLUDED_DIRS.includes(path)) {
      const sub = await listFiles(base + "/" + path, path + "/");
      files.push(...sub);
    } else if (!EXCLUDED_EXTS.some(ext => path.toLowerCase().endsWith(ext))) {
      files.push(path);
    }
  }
  return files;
}

async function generate() {
  btnGen.disabled = true;
  btnCopy.disabled = true;
  statusEl.textContent = "Scanning project…";
  outTA.value = "";

  try {
    const files = await listFiles(".");
    statusEl.textContent = `Found ${files.length} files. Reading…`;

    const items = [];
    for (const p of files) {
      try {
        const content = await fetchText(p);
        items.push({ path: p, size: content.length, hash: djb2(content), content });
      } catch (e) {
        items.push({ path: p, error: String(e.message || e) });
      }
    }

    const version = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    const bundle = {
      meta: {
        project: "CRM_Modular_Full",
        version: `Full project snapshot - ${version}`,
        generatedAt: new Date().toISOString(),
        totalFiles: items.length
      },
      files: items
    };

    outTA.value = JSON.stringify(bundle, null, 2);
    btnCopy.disabled = false;
    statusEl.textContent = `Done. ${items.length} files bundled.`;
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
  } catch {
    outTA.select();
    document.execCommand("copy");
  }
}

btnGen.addEventListener("click", generate);
btnCopy.addEventListener("click", copyOut);
