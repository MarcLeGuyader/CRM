// 🔹 Full project bundler — capture absolutely everything under project root
// Includes text, binary, and hidden files (.github, .env, .png, etc.)
// Produces a single JSON with Base64 content for binaries
// Version: Full Capture V1 - generated at runtime (France local time)

const $ = s => document.querySelector(s);
const outTA = $("#out");
const statusEl = $("#status");
const btnGen = $("#btn-gen");
const btnCopy = $("#btn-copy");

const BIN_EXTS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".webp", ".pdf", ".woff", ".woff2", ".ttf", ".eot"
];

const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
};

// 🔸 Fetch text
async function fetchText(path) {
  const res = await fetch("../" + path);
  if (!res.ok) throw new Error(`Fetch failed ${path}: ${res.status}`);
  return await res.text();
}

// 🔸 Fetch binary -> Base64
async function fetchBinary(path) {
  const res = await fetch("../" + path);
  if (!res.ok) throw new Error(`Binary fetch failed ${path}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// 🔸 Fallback for hidden/.github files
async function fetchRaw(path) {
  const parts = location.pathname.split("/").filter(Boolean);
  const repo = parts[0] || "";
  const owner = location.hostname.split(".")[0];
  const branch = "main";
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Raw fetch failed ${path}: ${res.status}`);
  return await res.text();
}

// 🔸 Try both fetch methods
async function fetchAny(path, binary = false) {
  try {
    return binary ? await fetchBinary(path) : await fetchText(path);
  } catch (e) {
    if (path.startsWith(".github/")) {
      return binary ? btoa(await fetchRaw(path)) : await fetchRaw(path);
    }
    throw e;
  }
}

// 🔸 Recursive file listing (no exclusions)
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
    if (isDir) {
      const sub = await listFiles(base + "/" + path, path + "/");
      files.push(...sub);
    } else {
      files.push(path);
    }
  }
  return files;
}

// 🔸 Generate JSON bundle
async function generate() {
  btnGen.disabled = true;
  btnCopy.disabled = true;
  statusEl.textContent = "Scanning project…";
  outTA.value = "";

  try {
    const files = await listFiles(".");
    statusEl.textContent = `Found ${files.length} files. Reading all…`;

    const items = [];
    for (const p of files) {
      try {
        const lower = p.toLowerCase();
        const isBinary = BIN_EXTS.some(ext => lower.endsWith(ext));
        const content = await fetchAny(p, isBinary);
        items.push({
          path: p,
          size: content.length,
          type: isBinary ? "binary" : "text",
          hash: djb2(content),
          content
        });
      } catch (e) {
        items.push({ path: p, error: String(e.message || e) });
      }
    }

    const now = new Date();
    const versionStr = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    const bundle = {
      meta: {
        project: "CRM_Modular_Full",
        version: `Full Project Capture - ${versionStr}`,
        generatedAt: now.toISOString(),
        totalFiles: items.length
      },
      files: items
    };

    outTA.value = JSON.stringify(bundle, null, 2);
    statusEl.textContent = `✅ Done — ${items.length} files captured.`;
    btnCopy.disabled = false;
  } catch (e) {
    statusEl.textContent = "❌ Error: " + (e.message || e);
  } finally {
    btnGen.disabled = false;
  }
}

// 🔸 Copy JSON output
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
