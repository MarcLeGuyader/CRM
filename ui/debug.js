const out = document.getElementById('debug-log');
export function log(msg){
  const ts = new Date().toISOString();
  out.textContent += `[${ts}] ${msg}\n`;
  out.scrollTop = out.scrollHeight;
}
