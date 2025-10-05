/**
 * Event Bus — minimal, synchronous pub/sub.
 * - Exact topic matching (no wildcards).
 * - FIFO handler order per topic.
 * - Returns an unsubscribe function from `on`.
 * - Includes `count` and `clear` for diagnostics/tests.
 */
export const bus = (() => {
  /** @type {Map<string, Set<Function>>} */
  const map = new Map();

  function on(topic, handler) {
    if (typeof topic !== 'string' || !topic) throw new TypeError('on(topic): topic must be a non-empty string');
    if (typeof handler !== 'function') throw new TypeError('on(handler): handler must be a function');
    let set = map.get(topic);
    if (!set) { set = new Set(); map.set(topic, set); }
    set.add(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const s = map.get(topic);
      if (s) {
        s.delete(handler);
        if (s.size === 0) map.delete(topic);
      }
    };
  }

  function emit(topic, payload) {
    if (typeof topic !== 'string' || !topic) throw new TypeError('emit(topic): topic must be a non-empty string');
    const set = map.get(topic);
    if (!set || set.size === 0) return 0;
    // Copy to array to avoid mutation during iteration affecting order
    const handlers = Array.from(set);
    for (const fn of handlers) {
      try { fn(payload); } catch (err) {
        // Never throw across module boundaries; surface to console but continue delivery
        console.error('[bus.emit] handler error on topic', topic, err);
      }
    }
    return handlers.length;
  }

  function count(topic) {
    if (!topic) {
      let c = 0;
      map.forEach(s => c += s.size);
      return c;
    }
    const s = map.get(topic);
    return s ? s.size : 0;
  }

  /** Danger zone: tests/dev only */
  function clear(topic) {
    if (!topic) { map.clear(); return; }
    map.delete(topic);
  }

  return Object.freeze({ on, emit, count, clear });
})();
