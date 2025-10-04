// Deploy Tool — Client-side GitHub uploader for JSON or ZIP bundles
// English version with logs, dry-run, replace/patch modes, and Download JSON

const $ = s => document.querySelector(s);
const logEl = $("#log");
const statusEl = $("#status");

function log(...args) {
  const line = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
  logEl.textContent += (logEl.textContent ? "\n" : "") + line;
  console.log("[DEPLOY]", ...args);
}

function setStatus(s, cls = "") {
  statusEl.textContent = s;
  statusEl.className = "muted " + cls;
}

const state = { files: null, removeList: [] };
const BIN_EXTS = [".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",".pdf",".woff",".woff2",".ttf",".zip",".mp4",".mov"];
const isBinaryPath = p => BIN_EXTS.some(ext => p.toLowerCase().endsWith(ext));

function fromBundleJSON(txt) {
  const j = JSON.parse(txt);
  if (!j.files || !Array.isArray(j.files)) throw new Error("Invalid JSON: missing 'files' array");
  return j.files.filter(f => f && f.path).map(f => ({
    path: f.path.replace(/^\.?\//, ""),
    type: f.type || (isBinaryPath(f.path) ? "binary" : "text"),
    content: String(f.content ?? "")
  }));
}

async function fromZipFile(file) {
  const zip = await JSZip.loadAsync(file);
  const out = [];
  await Promise.all(Object.keys(zip.files).map(async name => {
    const entry = zip.files[name];
    if (entry.dir) return;
    const path = name.replace(/^\.?\//, "");
    const binary = isBinaryPath(path);
    const content = binary ? await entry.async("base64") : await entry.async("text");
    out.push({ path, type: binary ? "binary" : "text", content });
  }));
  return out;
}

function ghBase(owner, repo) { return `https://api.github.com/repos/${owner}/${repo}`; }

async function ghGet(owner, repo, token, path) {
  const r = await fetch(`${ghBase(owner, repo)}/contents/${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  return r;
}

async function ghPut(owner, repo, token, branch, path, contentBase64, message, sha = null) {
  const body = { message, content: contentBase64, branch };
  if (sha) body.sha = sha;
  const r = await fetch(`${ghBase(owner, repo)}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status}`);
  return r.json();
}

async function ghDelete(owner, repo, token, branch, path, message, sha) {
  const r = await fetch(`${ghBase(owner, repo)}/contents/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ message, branch, sha })
  });
  if (!r.ok) throw new Error(`DEL ${path} -> ${r.status}`);
}

async function getShaIfExists(owner, repo, token, path) {
  const r = await ghGet(owner, repo, token, path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HEAD ${path} -> ${r.status}`);
  const j = await r.json();
  return j.sha || null;
}

async function listRepoTree(owner, repo, token, branch) {
  const ref = await fetch(`${ghBase(owner, repo)}/git/refs/heads/${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  const refData = await ref.json();
  const commit = await fetch(`${ghBase(owner, repo)}/git/commits/${refData.object.sha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  const commitData = await commit.json();
  const tree = await fetch(`${ghBase(owner, repo)}/git/trees/${commitData.tree.sha}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  const treeData = await tree.json();
  return (treeData.tree || []).filter(x => x.type === "blob").map(x => x.path);
}

function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

async function validateInput() {
  const jsonTxt = $("#json-in").value.trim();
  const zipFile = $("#zip-in").files[0] || null;
  if (!jsonTxt && !zipFile) throw new Error("Provide a JSON or ZIP bundle.");

  if (jsonTxt) {
    state.files = fromBundleJSON(jsonTxt);
    log(`Loaded ${state.files.length} files from JSON bundle.`);
  } else {
    state.files = await fromZipFile(zipFile);
    log(`Loaded ${state.files.length} files from ZIP bundle.`);
  }
}

function sanityFilter(list) {
  return list.filter(p => !/^tools\/deploy\.(html|js)$/i.test(p));
}

async function dryRun() {
  const owner = $("#gh-owner").value.trim();
  const repo = $("#gh-repo").value.trim();
  const branch = $("#gh-branch").value.trim() || "main";
  const token = $("#gh-token").value.trim();
  const mode = $("#mode").value;

  if (!owner || !repo || !token) throw new Error("Owner, repo, and token required.");

  const incoming = state.files.map(f => f.path);
  log(`Incoming files: ${incoming.length}`);

  if (mode === "replace") {
    const existing = await listRepoTree(owner, repo, token, branch);
    const toRemove = sanityFilter(existing.filter(p => !incoming.includes(p)));
    state.removeList = toRemove;
    log(`Replace mode: ${toRemove.length} files will be deleted.`);
  } else {
    state.removeList = [];
    log(`Patch mode: no deletions.`);
  }
}

async function deploy() {
  const owner = $("#gh-owner").value.trim();
  const repo = $("#gh-repo").value.trim();
  const branch = $("#gh-branch").value.trim() || "main";
  const token = $("#gh-token").value.trim();
  const msg = $("#gh-message").value.trim() || "Deploy via deploy tool";

  for (const path of state.removeList) {
    const sha = await getShaIfExists(owner, repo, token, path);
    if (!sha) continue;
    log(`DEL ${path}`);
    await ghDelete(owner, repo, token, branch, path, `[deploy] remove ${path}`, sha);
  }

  for (const f of state.files) {
    const sha = await getShaIfExists(owner, repo, token, f.path);
    const base64 = f.type === "binary" ? f.content : toBase64(f.content);
    log(`${sha ? "PUT" : "NEW"} ${f.path}`);
    await ghPut(owner, repo, token, branch, f.path, base64, msg, sha);
  }

  log("✅ Deployment completed successfully.");
  setStatus("Done.", "ok");
  $("#btn-dl-json").disabled = false;
}

function downloadJSON() {
  const out = {
    meta: { source: "Deployment tool", generatedAt: new Date().toISOString(), fileCount: state.files?.length || 0 },
    files: state.files || []
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  a.download = `deploy-preview-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("JSON downloaded.", "ok");
}

// --- Event bindings
$("#btn-validate").addEventListener("click", async () => {
  try {
    setStatus("Validating…");
    logEl.textContent = "";
    await validateInput();
    setStatus("Valid bundle — ready for Dry run or Deploy.", "ok");
    $("#btn-deploy").disabled = false;
  } catch (e) {
    setStatus("Error: " + e.message, "warn"); log(e);
  }
});

$("#btn-dryrun").addEventListener("click", async () => {
  try {
    setStatus("Dry run…");
    await validateInput();
    await dryRun();
    setStatus("Dry run complete. See log.", "ok");
    $("#btn-deploy").disabled = false;
  } catch (e) {
    setStatus("Error: " + e.message, "warn"); log(e);
  }
});

$("#btn-deploy").addEventListener("click", async () => {
  try {
    setStatus("Deploying…");
    await deploy();
  } catch (e) {
    setStatus("Error: " + e.message, "warn"); log(e);
  }
});

$("#btn-dl-json").addEventListener("click", downloadJSON);

setStatus("Ready.");
