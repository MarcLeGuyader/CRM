# Dialogs Module (v2) — uses external Event Bus

This module implements the **stackable dialogs** for Opportunity, Company, and Contact.

- **No event-bus is bundled here.** It expects your existing bus at:
  `./modules/event-bus/event-bus.js` exporting `{ bus }` with `on/emit/clear/count`.
- Matches the contracts defined in your V8 specs:
  - Emits: `opps.validate.request`, `opps.save.request`, `dialogs.close`
  - Listens: `dialogs.open.opportunity`, `dialogs.open.company`, `dialogs.open.contact`,
    `opps.validate.result`, `opps.save.result`

## Public API

```js
import { mountDialogs } from './modules/dialogs/dialogs.js';

const dialogs = mountDialogs({
  bus,                                // REQUIRED: your event bus
  resolveCompanyName: id => 'ACME',   // REQUIRED
  resolveContactName: id => 'Alice',  // REQUIRED
  listContactsByCompany: id => [],    // REQUIRED: [{id, displayName}]
  getOpportunityById: id => null      // REQUIRED: return { ...Opportunity } or null
});

// programmatic open (optional):
dialogs.open('opportunity', { id: 'OPP-000001' });
```

## Events & payload correlation

Dialogs emit `requestId` in `opps.validate.request` and `opps.save.request` payloads.
You **must echo the same `requestId`** in the corresponding `*.result` so the Dialogs
module can match the response to the active popup.

Payload shapes:
```ts
// requests (from Dialogs → Data/Validation)
{ requestId: string, draft: OpportunityDraft }

// results (from Data/Validation → Dialogs)
{ requestId: string, ok: boolean, errors?: FieldError[], id?: string }
```

## Test harness

Open `./tests/dialogs/index.html` in a local HTTP server (or GitHub Pages).
It imports your bus from `../../modules/event-bus/event-bus.js`. If the file is
missing, a visible error is shown.

- Click the buttons to open Opportunity / Company / Contact dialogs.
- A simple mock echoes `*.result` events with `ok:true` to demonstrate the flow.
