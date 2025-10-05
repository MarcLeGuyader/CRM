// tests/top-banner/test-harness.js
import { createBus } from "../../modules/top-banner/bus.js";
import { mount as mountBanner } from "../../modules/top-banner/top-banner.js";

const app = document.getElementById("app");
const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");

function log(topic, payload) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${topic} ${JSON.stringify(payload)}`;
  logEl.textContent += (logEl.textContent ? "\n" : "") + line;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

const bus = createBus();
const topics = [
  "ui.banner.filter",
  "ui.banner.new",
  "ui.banner.debug",
  "ui.banner.reset",
  "ui.banner.upload",
  "ui.banner.export",
  "ui.banner.save"
];

// Subscribe to all banner topics
topics.forEach(t => bus.on(t, (p) => log(t, p)));

// Mount the banner
mountBanner(app, bus, { title: "CRM", logoSrc: "../../assets/maello-logo.png" });
setStatus("Top Banner mounted. Click the buttons above.");

// Clear log button
document.getElementById("btn-clear").addEventListener("click", () => {
  logEl.textContent = "";
  setStatus("Log cleared.");
});
