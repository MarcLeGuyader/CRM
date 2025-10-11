// modules/app.js
// Petit registre centralisé des versions (tags) pour l'appli
// API :
//   App.registerVersion(filePath, tagString)
//   App.printVersions(printerFn?)  // printerFn(msg, value)
//   App.getVersions() -> Array<{ file, tag, ts }>

const __GLOBAL_KEY__ = '__APP_VERSIONS__';

function ensureStore(){
  if (!window[__GLOBAL_KEY__]) {
    window[__GLOBAL_KEY__] = [];
  }
  return window[__GLOBAL_KEY__];
}

function registerVersion(file, tag){
  const store = ensureStore();
  const existingIdx = store.findIndex(x => x.file === file);
  const rec = { file: String(file || ''), tag: String(tag || ''), ts: Date.now() };
  if (existingIdx >= 0) store[existingIdx] = rec;
  else store.push(rec);
  return rec;
}

function getVersions(){
  // clone trié par file asc
  return ensureStore().slice().sort((a,b) => a.file.localeCompare(b.file));
}

function printVersions(printer){
  const print = typeof printer === 'function'
    ? printer
    : (msg, v) => console.log(msg, v);

  getVersions().forEach(r => {
    print(`[version] ${r.file}`, r.tag);
  });
}

export const App = { registerVersion, printVersions, getVersions };
