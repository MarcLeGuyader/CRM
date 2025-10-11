// modules/app.js
// BUILD_TAG: CRM v1
// App core helpers — version registry and utilities

export const App = {
  registerVersion(name, tag) {
    if (!name || !tag) return;
    const store = (window.__VERSIONS ||= {});
    store[name] = String(tag);
  },

  listVersions() {
    const store = (window.__VERSIONS ||= {});
    return Object.entries(store).sort(([a],[b]) => a.localeCompare(b));
  },

  printVersions(logFn = console.log) {
    const rows = this.listVersions();
    rows.forEach(([name, tag]) => logFn(`[version] ${name}`, tag));
  }
};

// --- App.js own tag ---
export const VERSION = 'app@CRM v1';
App.registerVersion('modules/app.js', VERSION);
