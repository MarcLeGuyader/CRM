// src/main.js
import { bus } from './bus.js';

const logEl = document.getElementById('log');

function uiLog(line, obj) {
  const time = new Date().toISOString();
  const msg = document.createElement('div');
  msg.className = 'row';
  msg.textContent = `[${time}] ${line}` + (obj ? ' ' + JSON.stringify(obj) : '');
  logEl.appendChild(msg);
  logEl.scrollTop = logEl.scrollHeight;
}

// Demo subscribers
const unsubFilter = bus.on('ui.banner.filter', (p) => uiLog('ui.banner.filter', p));
const unsubNew = bus.on('ui.banner.new', (p) => uiLog('ui.banner.new', p));
const unsubDebug = bus.on('ui.banner.debug', (p) => uiLog('ui.banner.debug', p));
const unsubReset = bus.on('ui.banner.reset', (p) => uiLog('ui.banner.reset', p));
const unsubUpload = bus.on('ui.banner.upload', (p) => uiLog('ui.banner.upload', p));
const unsubExport = bus.on('ui.banner.export', (p) => uiLog('ui.banner.export', p));
const unsubSave = bus.on('ui.banner.save', (p) => uiLog('ui.banner.save', p));

// Wire demo buttons to emit events
const $ = (s) => document.querySelector(s);
$('#btn-filter').addEventListener('click', () => bus.emit('ui.banner.filter', { ts: Date.now() }));
$('#btn-new').addEventListener('click', () => bus.emit('ui.banner.new', { ts: Date.now() }));
$('#btn-debug').addEventListener('click', () => bus.emit('ui.banner.debug', { ts: Date.now() }));
$('#btn-reset').addEventListener('click', () => bus.emit('ui.banner.reset', { ts: Date.now() }));
$('#btn-upload').addEventListener('click', () => bus.emit('ui.banner.upload', { ts: Date.now() }));
$('#btn-export').addEventListener('click', () => bus.emit('ui.banner.export', { ts: Date.now() }));
$('#btn-save').addEventListener('click', () => bus.emit('ui.banner.save', { ts: Date.now() }));

// Show current topics
function refreshTopics() {
  const list = document.getElementById('topics');
  list.textContent = bus.topics().join(', ');
}
refreshTopics();

// Button to clear listeners (for demo)
document.getElementById('btn-clear').addEventListener('click', () => {
  bus.clear();
  uiLog('Cleared all listeners');
  refreshTopics();
});

