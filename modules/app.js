// modules/app.js
// BUILD_TAG: APP v1

export const App = (() => {
  const versions = {};

  /**
   * Enregistre la version d’un module
   * @param {string} path - chemin du fichier ou module
   * @param {string} tag - identifiant de version (ex: "debug-console@CRM v1")
   */
  function registerVersion(path, tag) {
    if (!path || !tag) return;
    versions[path] = tag;
  }

  /**
   * Affiche toutes les versions enregistrées
   * @param {function} printer - fonction de log (console.log ou DebugConsole.log)
   */
  function printVersions(printer = console.log) {
    for (const [path, tag] of Object.entries(versions)) {
      printer(`[version] ${path}`, tag);
    }
  }

  // 🔄 Si certains modules ont stocké leurs versions avant que App ne soit chargé
  if (Array.isArray(window.__pendingVersions)) {
    window.__pendingVersions.forEach(([p, v]) => registerVersion(p, v));
    delete window.__pendingVersions;
  }

  // Expose globalement
  return { registerVersion, printVersions };
})();

// Rattache à window pour usage global
window.App = App;
