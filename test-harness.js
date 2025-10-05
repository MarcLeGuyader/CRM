// test-harness.js — logs every ui.banner.* event to the page
import { bus } from './bus.js';
import { mountTopBanner } from './top-banner.js';

const $ = s => document.querySelector(s);
const logEl = $('#log');

function log(topic, payload){
  const line = `[${new Date().toISOString()}] ${topic} ${JSON.stringify(payload)}`;
  console.log(line);
  logEl.textContent += (logEl.textContent ? '\n' : '') + line;
  logEl.scrollTop = logEl.scrollHeight;
}

// Subscribe to all banner topics
const topics = ['filter','new','debug','reset','upload','export','save'].map(x => `ui.banner.${x}`);
topics.forEach(t => bus.on(t, p => log(t, p)));

// Mount the banner into #app
mountTopBanner(document.getElementById('app'), { title: 'CRM' });

// Extra button to clear all listeners (for testing)
const clearBtn = document.getElementById('btnClearListeners');
clearBtn.addEventListener('click', () => {
  bus.clearAll();
  log('system.info', { message:'Cleared all listeners' });
});
