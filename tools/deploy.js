// Deploy Tool – CRM
// Version V1 – 16:12 GMT (04/10/2025)
// Complete English version with JSON download, ZIP import, progress bar, and per-file error handling.

const $ = s => document.querySelector(s);
const logEl = $("#log");
const statusEl = $("#status");
const prog = $("#prog");
const progText = $("#prog-text");

function log(...args) {
  const line = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  logEl.textContent += (logEl.textContent ? "\n" : "") + line;
  logEl.scrollTop = logEl.scrollHeight;
  console.log("[DEPLOY]", ...args);
}
function setStatus(s, cls = "") {
  statusEl.textContent = s;
  statusEl.className = "muted " + cls;
}
function setProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  prog.value = pct;
  progText.textContent = `${pct}%`;
}

// ─────────────────────────────────────────────
// Globals
const state = {
  files: [],
  removeList: [],
};

// Supported binary extensions
const BIN_EXTS = [".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".eot",".zip",".mp4",".mov"];
const isBinaryPath = p => BIN_EXTS.some(ext => p.toLowerCase().endsWith(ext));

// ─────────────────────────────────────────────
// Input parsing
function fromBundleJSON(txt) {
  const j = JSON.parse(txt);
  if (!Array.isArray(j.files)) throw new Error("Invalid JSON bundle: missing 'files' array.");
  return j.files.map(f => ({
    path: (f.path || "").replace(/^\.?\//, ""),
    type: f.type || (isBinaryPath(f.path) ? "binary" : "text"),
    content: String(f.content ?? ""),
  }));
}

async function fromZipFile(file) {
  const zip = await JSZip.loadAsync(file);
  const out = [];
  const entries = Object.values(zip.files);
  let done = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const path = entry.name.replace(/^\.?\//, "");
    const isBin = isBinaryPath(path);
    const content = await entry.async(isBin ? "base64" : "text");
    out.push({ path, type: isBin ? "binary" : "text", content });
    done++;
    if (done % 10 === 0) setProgress(done, entries.length);
  }
  return out;
}

// ─────────────────────────────────────────────
// GitHub API helpers
const ghBase = (o, r) => `https://api.github.com/repos/${o}/${r}`;
async function ghFetch(url, method = "GET", token = "", body = null) {
  const opt = {
    method,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
  };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(url, opt);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
  return res.json();
}
async function getShaIfExists(o, r, t, path) {
  const url = `${ghBase(o, r)}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const j = await res.json();
  return j.sha || null;
}

// ─────────────────────────────────────────────
// Validation
async function validateInput() {
  const jsonTxt = $("#json-in").value.trim();
  const zipFile = $("#zip-in").files[0] || null;
  if (!jsonTxt && !zipFile) throw new Error("Please provide a JSON bundle or ZIP file.");

  setStatus("Reading input…");
  if (jsonTxt) {
    state.files = fromBundleJSON(jsonTxt);
    log(`Parsed JSON bundle: ${state.files.length} files.`);
  } else {
    state.files = await fromZipFile(zipFile);
    log(`Parsed ZIP: ${state.files.length} files.`);
  }

  $("#btn-download-json").disabled = false;
  setStatus("Input validated.", "ok");
}

// ─────────────────────────────────────────────
// Dry run
async function dryRun() {
  const owner = $("#gh-owner").value.trim();
  const repo = $("#gh-repo").value.trim();
  const branch = $("#gh-branch").value.trim() || "main";
  const token = $("#gh-token").value.trim();
  const mode = $("#mode").value;

  if (!owner || !repo || !token) throw new Error("Owner, repository, and token are required.");

  log(`Dry run: mode = ${mode}, ${state.files.length} files.`);

  if (mode === "replace") {
    const ref = await ghFetch(`${ghBase(owner, repo)}/git/refs/heads/${branch}`, "GET", token);
    const commitSha = ref.object.sha;
    const commit = await ghFetch(`${ghBase(owner, repo)}/git/commits/${commitSha}`, "GET", token);
    const treeSha = commit.tree.sha;
    const tree = await ghFetch(`${ghBase(owner, repo)}/git/trees/${treeSha}?recursive=1`, "GET", token);
    const existing = (tree.tree || []).filter(x => x.type === "blob").map(x => x.path);
    const incoming = state.files.map(f => f.path);
    const toRemove = existing.filter(p => !incoming.includes(p));
    state.removeList = toRemove;
    log(`Would delete ${toRemove.length} existing files (replace mode).`);
  } else {
    log("No deletions in patch mode.");
  }

  setStatus("Dry run completed.", "ok");
}

// ─────────────────────────────────────────────
// Deploy
async function deploy() {
  const owner = $("#gh-owner").value.trim();
  const repo = $("#gh-repo").value.trim();
  const branch = $("#gh-branch").value.trim() || "main";
  const token = $("#gh-token").value.trim();
  const msg = $("#gh-message").value.trim() || "Deploy via Deploy Tool";
  const total = state.files.length + state.removeList.length;

  if (!owner || !repo || !token) throw new Error("Owner, repository, and token are required.");

  setStatus("Starting deployment…");
  let done = 0;

  // Delete first if replace mode
  for (const path of state.removeList) {
    try {
      const sha = await getShaIfExists(owner, repo, token, path);
      if (!sha) continue;
      await ghFetch(`${ghBase(owner, repo)}/contents/${encodeURIComponent(path)}`, "DELETE", token, { message: `[deploy] remove ${path}`, branch, sha });
      log(`🗑️ Deleted: ${path}`);
    } catch (e) {
      log(`⚠️ Delete error for ${path}: ${e.message}`);
    }
    done++; setProgress(done, total);
  }

  // Upload/update files
  for (const f of state.files) {
    try {
      const sha = await getShaIfExists(owner, repo, token, f.path);
      const base64 = f.type === "binary" ? f.content : btoa(unescape(encodeURIComponent(f.content)));
      const body = { message: msg, branch, content: base64 };
      if (sha) body.sha = sha;
      await ghFetch(`${ghBase(owner, repo)}/contents/${encodeURIComponent(f.path)}`, "PUT", token, body);
      log(`${sha ? "📝 Updated" : "➕ Added"}: ${f.path}`);
    } catch (e) {
      log(`❌ Error on ${f.path}: ${e.message}`);
    }
    done++; setProgress(done, total);
  }

  setStatus("Deployment completed.", "ok");
  log("✅ All done.");
}

// ─────────────────────────────────────────────
// JSON download
function downloadJSON() {
  if (!state.files.length) {
    alert("No files to download. Validate a bundle first.");
    return;
  }
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const repo = $("#gh-repo").value.trim() || "CRM";
  const bundle = { meta: { project: repo, date: now, totalFiles: state.files.length }, files: state.files };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${repo}-deploy-${now}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setStatus("JSON downloaded.", "ok");
}

// ─────────────────────────────────────────────
// Event wiring
$("#btn-validate").addEventListener("click", async () => {
  try {
    setStatus("Validating input…");
    logEl.textContent = "";
    await validateInput();
    $("#btn-deploy").disabled = false;
  } catch (e) {
    setStatus("Error: " + e.message, "warn");
    log(e.message);
  }
});

$("#btn-dryrun").addEventListener("click", async () => {
  try {
    setStatus("Running dry run…");
    await validateInput();
    await dryRun();
  } catch (e) {
    setStatus("Error: " + e.message, "warn");
    log(e.message);
  }
});

$("#btn-deploy").addEventListener("click", async () => {
  try {
    setStatus("Deploying…");
    await deploy();
  } catch (e) {
    setStatus("Error: " + e.message, "warn");
    log(e.message);
  }
});

$("#btn-download-json").addEventListener("click", () => downloadJSON());

setStatus("Ready.");
