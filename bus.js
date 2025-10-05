// bus.js — minimal synchronous pub/sub with off/clear
export const bus = (function(){
  const map = new Map(); // topic => Set<handler>
  function on(topic, handler){
    if(!map.has(topic)) map.set(topic, new Set());
    map.get(topic).add(handler);
    return () => off(topic, handler);
  }
  function once(topic, handler){
    const offFn = on(topic, (p)=>{ try{ handler(p); } finally { offFn(); } });
    return offFn;
  }
  function off(topic, handler){
    const set = map.get(topic);
    if(set){ set.delete(handler); if(set.size===0) map.delete(topic); }
  }
  function emit(topic, payload){
    const set = map.get(topic);
    if(!set) return 0;
    let n=0;
    for(const h of Array.from(set)){ try{ h(payload); } catch(e){ console.error('[bus handler error]', e); } n++; }
    return n;
  }
  function clearAll(){
    map.clear();
    console.log('[bus] Cleared all listeners');
  }
  function count(topic){ return map.get(topic)?.size || 0; }
  return { on, once, off, emit, clearAll, count };
})();
