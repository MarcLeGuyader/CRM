export function normalizeHeader(h){
  if (h == null) return "";
  let w=String(h).trim().toLowerCase();
  const parts=w.split(".");
  const known=new Set(["opportunities","opportunity","companies","contacts","validationlists"]);
  if (parts.length>1 && known.has(parts[0])) w=parts.slice(1).join(".");
  w=w.replace(/[.\-_]/g," ").replace(/\s+/g," ").trim();
  const map={
    "opportunity id":"Opportunity.ID","opportunityid":"Opportunity.ID","id":"Opportunity.ID",
    "name":"Opportunity.Name","owner":"Opportunity.Owner",
    "next action date":"Opportunity.NextActionDate","nextactiondate":"Opportunity.NextActionDate",
    "next action":"Opportunity.NextAction","nextaction":"Opportunity.NextAction",
    "notes":"Opportunity.Notes",
    "company id":"Opportunity.CompanyID","companyid":"Opportunity.CompanyID",
    "lead source":"Opportunity.LeadSource","leadsource":"Opportunity.LeadSource",
    "client":"Opportunity.Client",
    "contact id":"Opportunity.ContactID","contactid":"Opportunity.ContactID",
    "sales step":"Opportunity.SalesStep","salesstep":"Opportunity.SalesStep",
    "closing date":"Opportunity.ClosingDate","closingdate":"Opportunity.ClosingDate",
    "closing value":"Opportunity.ClosingValue","closingvalue":"Opportunity.ClosingValue",
    "sales cycle last change date":"Opportunity.SalesCycleLastChangeDate","salescyclelastchangedate":"Opportunity.SalesCycleLastChangeDate"
  };
  if (map[w]) return map[w];
  if (/^opportunity[a-z]/.test(w)){
    const tail=w.replace(/^opportunity/,"").trim();
    return map[tail] || map[tail.replace(/\s+/g,"")] || (tail==="id" ? "Opportunity.ID" : "");
  }
  return "";
}
