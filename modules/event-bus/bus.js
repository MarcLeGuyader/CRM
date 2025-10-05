// modules/event-bus/bus.js
// Minimal synchronous pub/sub event bus.
// API:
//   const bus = createBus();
//   const off = bus.on('topic', (payload) => {});
//   bus.emit('topic', payload);
//   off(); // unsubscribe
//   bus.clear(); // removes all listeners (test helper)

export function createBus() {
  const listeners = new Map(); // topic -> Set<fn>

  function on(topic, handler) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(handler);
    return () => {
      const set = listeners.get(topic);
      if (set) set.delete(handler);
    };
  }

  function emit(topic, payload) {
    const set = listeners.get(topic);
    if (!set || set.size === 0) return;
    // clone to tolerate unsubscription during iteration
    [...set].forEach(fn => {
      try { fn(payload); } catch (e) { console.error('[bus error]', topic, e); }
    });
  }

  function clear() {
    listeners.clear();
  }

  return { on, emit, clear };
}
