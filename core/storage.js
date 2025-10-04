const KEY_ROWS="opportunities-db-v3";
const KEY_COMP="companies-db-v1";
const KEY_CONT="contacts-db-v1";
const KEY_COMP_INFO="companies-info-v1";
const KEY_CONT_INFO="contacts-info-v1";

export function loadAll(){
  const g=(k,f)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  return {
    rows: g(KEY_ROWS, []),
    companies: g(KEY_COMP, {}),
    contacts: g(KEY_CONT, {}),
    compInfo: g(KEY_COMP_INFO, {}),
    contInfo: g(KEY_CONT_INFO, {}),
  };
}

export function saveAll(ctx){
  localStorage.setItem(KEY_ROWS, JSON.stringify(ctx.rows));
  localStorage.setItem(KEY_COMP, JSON.stringify(ctx.companies));
  localStorage.setItem(KEY_CONT, JSON.stringify(ctx.contacts));
  localStorage.setItem(KEY_COMP_INFO, JSON.stringify(ctx.compInfo));
  localStorage.setItem(KEY_CONT_INFO, JSON.stringify(ctx.contInfo));
}

export function resetAll(ctx){
  localStorage.removeItem(KEY_ROWS);
  localStorage.removeItem(KEY_COMP);
  localStorage.removeItem(KEY_CONT);
  localStorage.removeItem(KEY_COMP_INFO);
  localStorage.removeItem(KEY_CONT_INFO);
  ctx.rows=[]; ctx.companies={}; ctx.contacts={}; ctx.compInfo={}; ctx.contInfo={};
}
