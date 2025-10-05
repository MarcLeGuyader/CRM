// modules/top-banner/bus.js
// Minimal synchronous Event Bus used by modules & tests
export function createBus() {
  const listeners = new Map(); // topic -> Set<handler>
  return {
    on(topic, handler) {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(handler);
      // Return unsubscribe function
      return () => {
        const set = listeners.get(topic);
        if (set) set.delete(handler);
      };
    },
    emit(topic, payload) {
      const set = listeners.get(topic);
      if (!set) return;
      // Copy to array so a handler can unsubscribe during iteration safely
      for (const h of Array.from(set)) {
        try { h(payload); } catch (e) { console.error("[bus] handler error", topic, e); }
      }
    },
    clear() {
      listeners.clear();
    }
  };
}
