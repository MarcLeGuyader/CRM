// src/bus.js
// Event Bus — minimal, synchronous pub/sub aligned with Spec 00.
// Single global instance exported as `bus`.

class EventBus {
  constructor() {
    /** @type {Record<string, Set<Function>>} */
    this._map = Object.create(null);
  }

  /**
   * Subscribe to a topic.
   * @param {string} topic
   * @param {(payload:any)=>void} handler
   * @returns {() => void} unsubscribe
   */
  on(topic, handler) {
    if (typeof topic !== 'string' || !topic) throw new TypeError('topic must be a non-empty string');
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const set = this._map[topic] || (this._map[topic] = new Set());
    set.add(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.off(topic, handler);
    };
  }

  /**
   * Unsubscribe a handler from a topic.
   * @param {string} topic
   * @param {Function} handler
   * @returns {boolean} true if removed
   */
  off(topic, handler) {
    const set = this._map[topic];
    if (!set) return false;
    const had = set.delete(handler);
    if (set.size === 0) delete this._map[topic];
    return had;
  }

  /**
   * Emit an event synchronously.
   * @param {string} topic
   * @param {any} payload
   */
  emit(topic, payload) {
    const set = this._map[topic];
    if (!set || set.size === 0) return;
    // Clone to avoid issues if handlers unsubscribe during emit
    [...set].forEach(fn => {
      try {
        fn(payload);
      } catch (err) {
        // Fail-safe: log but don't break the loop
        console.error('[bus] handler error on', topic, err);
      }
    });
  }

  /**
   * Remove all handlers (global or a specific topic).
   * @param {string=} topic
   */
  clear(topic) {
    if (typeof topic === 'string') {
      delete this._map[topic];
    } else {
      this._map = Object.create(null);
    }
  }

  /**
   * Return a copy of topics that currently have handlers.
   * @returns {string[]}
   */
  topics() {
    return Object.keys(this._map);
  }
}

export const bus = new EventBus();
export default bus;
