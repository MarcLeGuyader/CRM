
# Module: Opportunities Table

**Responsibility**: Render the opportunities list with zebra rows and clickable cells that open the appropriate dialogs.

## Interfaces

### Listens
- `filters.changed`: `{ q?, client?, closeDate?:{from?,to?}, salesStep? }`
- `filters.cleared`: `{}`
- `opps.updated`: `{ id:string }`
- `data.loaded`: `{ rows: Opportunity[] }`

### Emits
- `dialogs.open.opportunity`: `{ id?:string }`
- `dialogs.open.company`: `{ companyId:string }`
- `dialogs.open.contact`: `{ contactId:string }`

### API
```js
const api = OpportunityTable.mount(container, bus, {
  zebraRGB?: string,
  currency?: string, // default 'EUR'
  resolveCompanyName?: (id)=>string|undefined,
  resolveContactName?: (id)=>string|undefined
});
api.render(rows, filters);
api.destroy();
```

## Columns
1. Edit icon (✏️) → opens opportunity dialog
2. Name
3. Sales step
4. Client
5. Owner
6. Company (resolved from `companyId`, clickable)
7. Contact name (resolved from `contactId`, clickable)
8. Notes
9. Next actions
10. Next action date
11. Closing date
12. Closing value (currency formatted)
