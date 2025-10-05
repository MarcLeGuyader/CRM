// tests/dialogs/bus.js - minimal event bus (same contract as your existing one)
export const bus = (() => {
  const map = new Map();
  function on(topic, handler){
    if (typeof topic!=='string'||!topic) throw new TypeError('on(topic) requires string');
    if (typeof handler!=='function') throw new TypeError('on(handler) requires function');
    let s = map.get(topic); if (!s){ s=new Set(); map.set(topic,s); }
    s.add(handler);
    let active=true;
    return () => { if(!active) return; active=false; const set=map.get(topic); if(set){ set.delete(handler); if(set.size===0) map.delete(topic);} };
  }
  function emit(topic, payload){
    const s = map.get(topic); if(!s) return 0;
    const arr = Array.from(s);
    for (const fn of arr){ try{ fn(payload); }catch(e){ console.error('[bus.emit]', topic, e); } }
    return arr.length;
  }
  function count(topic){ if(!topic){ let c=0; map.forEach(s=>c+=s.size); return c; } const s=map.get(topic); return s?s.size:0; }
  function clear(topic){ if(!topic){ map.clear(); return; } map.delete(topic); }
  return Object.freeze({ on, emit, count, clear });
})();
