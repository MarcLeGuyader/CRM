/* TestCode.js — terrain de test “riche” pour l'outil Patch
   Contient des ancres explicites et des constructions JS variées.

   ANCHORS (utiles pour insert_before / insert_after):
   - [PATCH-ANCHOR:IMPORTS]
// [PATCH] lignes injectées après IMPORTS
const PATCH_MARK = 'imports-ok';
// [PATCH] lignes injectées après IMPORTS
const PATCH_MARK = 'imports-ok';
   - [PATCH-ANCHOR:CONFIG]
   - [PATCH-ANCHOR:UTILS]
   - [PATCH-ANCHOR:CLASS]
   - [PATCH-ANCHOR:REGEX]
// [PATCH] nouvelle regex de test
const RX_DOLLAR = /\$/g;
// [PATCH] nouvelle regex de test
const RX_DOLLAR = /\$/g;
// [PATCH] helper ajouté avant EXPORTS
export function __patchHelper__(){ return 'helper-ok'; }
// [PATCH] helper ajouté avant EXPORTS
export function __patchHelper__(){ return 'helper-ok'; }
   - [PATCH-ANCHOR:EXPORTS]

   Notes:
   - Plusieurs occurrences de certaines chaînes existent pour tester replace_all vs replace_once.
   - Présence de lignes très proches pour tester les ancres.
   - Chaînes multilignes et backticks à manipuler avec prudence.
*/

// [PATCH-ANCHOR:IMPORTS]
export const TEST_BUILD_TAG = { file: "TestCode.js", note: "v1" };

// Simule un import conditionnel (à patcher éventuellement)
const maybeIntl = typeof Intl !== "undefined" ? Intl : null;

// Valeurs de config (ancres et clés susceptibles d’être patchées)
// [PATCH-ANCHOR:CONFIG]
export const config = {
  apiBase: "https://api.example.dev",
  featureFlags: {
    useNewCache: false,
    enableFancyUI: true,
  },
  retry: { count: 3, backoffMs: 250 },
  brandColor: "#1a6b9a", // (présenté aussi dans le CSS du projet)
};

// Utilitaires divers
// [PATCH-ANCHOR:UTILS]
// [PATCH] commentaire inséré juste avant sleep()
// [PATCH] commentaire inséré juste avant sleep()
export function sleep(ms = 0) {
  return new Promise(res => setTimeout(res, ms));
}

export const toKebab = (s) =>
  String(s || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

// Regex et unicodes — edge cases
// [PATCH-ANCHOR:REGEX]
const RX_WORD = /\bword\b/gi;                  // simple
const RX_QUOTES = /"([^"]*)"|'([^']*)'/g;      // guillemets
const RX_LOOKBEHIND = /(?<=\s|^)[A-Z][a-z]+/g; // lookbehind (selon moteur)
const RX_U_FLAG = /\p{Letter}+/gu;             // unicode property (peut varier selon env)

// Valeurs “grandes” et Symbol
const BIG = 2n ** 61n - 1n;
const SYM = Symbol("test");

// Classe riche: champs privés, getters, statics, async/générateur
// [PATCH-ANCHOR:CLASS]
export class DataBox {
  // [PATCH] champ statique ajouté pour test
  static patched = true;
  // [PATCH] champ statique ajouté pour test
  static patched = true;
  #items = new Map();
  static version = "1.0.0";

  constructor(seed = []) {
    for (const [k, v] of seed) this.#items.set(k, v);
  }

  set(key, value) {
    this.#items.set(key, value);
    return this;
  }

  get(key, fallback = null) {
    return this.#items.has(key) ? this.#items.get(key) : fallback;
  }

  get size() { return this.#items.size; }

  *keysLike(rx = /.*/) {
    for (const k of this.#items.keys()) if (rx.test(String(k))) yield k;
  }

  async *stream(delayMs = 0) {
    for (const [k, v] of this.#items.entries()) {
      if (delayMs) await sleep(delayMs);
      yield { k, v };
    }
  }

  toJSON() {
    const obj = Object.fromEntries(this.#items.entries());
    return { ...obj, $version: DataBox.version };
  }
}

// Proxy délicat (piège pour patchs “global replace” mal ciblés)
export function proxify(target = {}) {
  return new Proxy(target, {
    get(t, p, r) {
      if (p === "get") return Reflect.get(t, p, r);
      return Reflect.get(t, p, r);
    },
    set(t, p, v, r) {
      if (typeof v === "string" && RX_WORD.test(v)) {
        v = v.replace(RX_WORD, "WORD");
      }
      return Reflect.set(t, p, v, r);
    }
  });
}

// Async workflow + corner cases (nullish, optional chaining, Intl)
export async function complexWorkflow(options = {}) {
  const {
    locale = "fr-FR",
    amount = 1234.56,
    items = [{label: "Alpha"}, {label: "Bravo"}],
  } = options ?? {};

  // optional chaining / nullish
  const flag = options?.flag ?? "none";

  const fmt = maybeIntl?.NumberFormat
    ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" })
    : { format: (x) => String(x) };

  // répétition de chaîne pour tester replace_all
  let title = "Serious Title - Serious Title - Serious Title";

  // chaîne multilignes (attention aux backticks)
  const banner = `
==== BANNER ====
Locale: ${locale}
Amount: ${fmt.format(amount)}
Flag:   ${flag}
===============
`.trim();

  // Map/Set sur des valeurs originales
  const set = new Set(["A", "B", "C"]);
  const map = new Map([["k1", 1], ["k2", 2], ["k3", 3]]);

  await sleep(10);

  return {
    title, banner,
    digits: Array.from(map.values()).reduce((a,b)=>a+b, 0),
    list: items.map(x => x?.label?.toUpperCase?.() ?? "UNKNOWN"),
    big: BIG,
    symDesc: SYM.description,
    kebab: toKebab("Élégant Patch Tool!"),
    setHasB: set.has("B"),
  };
}

// Exports supplémentaires — servent d’ancres
// [PATCH-ANCHOR:EXPORTS]
export const examples = {
  simpleText: "replace me once",
  repeatedText: "echo echo echo",   // plusieurs “echo”
  tricky: `Line1\nLine2 with "quotes" and 'single-quotes'\nLine3`,
};

export default {
  config,
  DataBox,
  complexWorkflow,
  proxify,
  examples,
};
