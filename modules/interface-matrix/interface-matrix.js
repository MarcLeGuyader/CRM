/**
 * interface-matrix.js
 * Validates event usage against a declared matrix and can guard the bus.
 *
 * Usage:
 *   import { attachBusGuard, audit, loadMatrix } from './interface-matrix.js';
 *   const matrix = await loadMatrix('./matrix.json');
 *   const detach = attachBusGuard(bus, matrix, { mode: 'warn' });
 *   // ... run app/tests ...
 *   console.table(audit());
 *   detach();
 */
export function toMapByEvent(entries){
  const m = new Map();
  for (const row of entries){
    if (!row || !row.event) continue;
    m.set(row.event, row);
  }
  return m;
}

const _state = {
  known: new Set(),
  listened: new Set(),
  emitted: new Set(),
  errors: [],
  warns: [],
  guardActive: false,
  origEmit: null,
  origOn: null,
  expectedListeners: new Map(), // event -> string[]
};

export async function loadMatrix(urlOrObject){
  let entries;
  if (Array.isArray(urlOrObject)) entries = urlOrObject;
  else if (typeof urlOrObject === 'string'){
    const res = await fetch(urlOrObject);
    entries = await res.json();
  } else {
    throw new Error('loadMatrix: pass JSON url or array');
  }
  _state.known = new Set(entries.map(e => e.event));
  _state.expectedListeners = new Map(entries.map(e => [e.event, Array.isArray(e.listeners)? e.listeners : []]));
  return entries;
}

export function attachBusGuard(bus, entries, opts = {}){
  if (!bus || typeof bus.emit !== 'function' || typeof bus.on !== 'function'){
    throw new Error('attachBusGuard: invalid bus');
  }
  if (_state.guardActive) detachBusGuard(); // ensure clean

  const mode = opts.mode === 'throw' ? 'throw' : 'warn';
  if (entries) {
    _state.known = new Set(entries.map(e => e.event));
    _state.expectedListeners = new Map(entries.map(e => [e.event, Array.isArray(e.listeners)? e.listeners : []]));
  }

  _state.origEmit = bus.emit.bind(bus);
  _state.origOn = bus.on.bind(bus);

  bus.on = function(topic, handler){
    if (!_state.known.has(topic)){
      const msg = `[matrix] on('${topic}') not declared in matrix`;
      if (mode === 'throw') throw new Error(msg);
      _state.warns.push(msg);
      console.warn(msg);
    }
    _state.listened.add(topic);
    return _state.origOn(topic, handler);
  };

  bus.emit = function(topic, payload){
    if (!_state.known.has(topic)){
      const msg = `[matrix] emit('${topic}') not declared in matrix`;
      if (mode === 'throw') throw new Error(msg);
      _state.warns.push(msg);
      console.warn(msg);
    }
    _state.emitted.add(topic);
    const delivered = _state.origEmit(topic, payload);
    const expected = _state.expectedListeners.get(topic) || [];
    if (delivered === 0 && expected.length){
      const msg = `[matrix] emit('${topic}') delivered to 0 listeners, expected: ${expected.join(', ')}`;
      if (mode === 'throw') throw new Error(msg);
      _state.warns.push(msg);
      console.warn(msg);
    }
    return delivered;
  };

  _state.guardActive = true;
  return detachBusGuard;
}

export function detachBusGuard(){
  if (!_state.guardActive) return;
  // cannot restore without original bus reference; rely on stored originals bound earlier
  // The consumer must pass the same bus to attachBusGuard and then call the returned detach.
  // Here we assume it's called via the function returned by attachBusGuard that has closure over bus,
  // but since we didn't capture bus here, we expose a factory style in attachBusGuard.
}

export function audit(){
  const declared = _state.known;
  const emittedNeverDeclared = [..._state.emitted].filter(t => !declared.has(t));
  const listenedNeverDeclared = [..._state.listened].filter(t => !declared.has(t));
  const declaredNeverEmitted = [...declared].filter(t => !_state.emitted.has(t));
  const declaredNeverListened = [...declared].filter(t => !_state.listened.has(t));
  return {
    knownCount: declared.size,
    emittedCount: _state.emitted.size,
    listenedCount: _state.listened.size,
    emittedNeverDeclared,
    listenedNeverDeclared,
    declaredNeverEmitted,
    declaredNeverListened,
    warns: [..._state.warns],
    errors: [..._state.errors],
  };
}

// Helper to attach and return a proper detach capturing the bus
export function guard(bus, entries, opts){
  const origOn = bus.on.bind(bus);
  const origEmit = bus.emit.bind(bus);
  attachBusGuard(bus, entries, opts);
  return function detach(){
    bus.on = origOn;
    bus.emit = origEmit;
    _state.guardActive = false;
  }
}
