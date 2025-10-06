// modules/dialogs/dom-helpers.js
export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  children.forEach(c => e.appendChild(c));
  return e;
}

export function link(text, onclick) {
  return el('span', { class: 'crm-link', role: 'button', tabIndex: 0, onClick: onclick }, [document.createTextNode(text)]);
}

export function rowKV(k, v){
  const valNode = (typeof v === 'string')
    ? document.createTextNode(v)
    : (v instanceof Node ? v : document.createTextNode(String(v ?? '')));
  return el('div', { class:'kv' }, [
    el('div', { class:'kv-k', text:k }),
    el('div', { class:'kv-v' }, [ valNode ])
  ]);
}

export function wrap(labelText, inputEl) {
  return el('label', {}, [ document.createTextNode(labelText), inputEl ]);
}

export function makeReqId(){
  return 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
