// ui/render-table.js
// Adjust company and contact display inside the opportunities list.
// Assumptions:
// - Each row item has: item.CompanyID, item.Contact or ContactID
// - ctx.compById maps id -> { Name }
// - ctx.contactById maps id -> { FirstName, LastName } (fallback if item.Contact missing)
// This file only changes cell formatting; it does not alter data shape.

(function(){
  function getCompanyName(item, ctx){
    try{
      if (!item) return "";
      const id = item.CompanyID || item.companyId || item.companyID;
      if (id && ctx && ctx.compById && ctx.compById[id]) return ctx.compById[id].Name || ctx.compById[id].name || "";
      return item.Company || item.company || "";
    }catch(e){ return ""; }
  }
  function getContactFullName(item, ctx){
    try{
      // Prefer inline Contact object
      const c = item.Contact || item.contact;
      if (c && (c.FirstName || c.LastName)){
        return [c.FirstName || c.firstName || "", c.LastName || c.lastName || ""].filter(Boolean).join(" ").trim();
      }
      // Fallback: lookup by ContactID
      const cid = item.ContactID || item.contactId || item.contactID;
      if (cid && ctx && ctx.contactById && ctx.contactById[cid]){
        const cc = ctx.contactById[cid];
        return [cc.FirstName || cc.firstName || "", cc.LastName || cc.lastName || ""].filter(Boolean).join(" ").trim();
      }
      return item.ContactName || item.contactName || "";
    }catch(e){ return ""; }
  }

  // If your table renderer exposes hooks, patch them here.
  // Expose helpers on global so existing renderer can call them.
  window.CRM = window.CRM || {};
  window.CRM.formatCompanyName = getCompanyName;
  window.CRM.formatContactName = getContactFullName;
})();