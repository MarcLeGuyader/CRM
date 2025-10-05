# Module: Top Banner

This package contains the **Top Banner** UI and a minimal **Event Bus** used for testing.

## Files
- `bus.js` — tiny synchronous pub/sub.
- `top-banner.js` — the banner module that renders the header and emits events.

## Emitted events (payload: `{ ts: number }`)
- `ui.banner.filter`
- `ui.banner.new`
- `ui.banner.debug`
- `ui.banner.reset`
- `ui.banner.upload`
- `ui.banner.export`
- `ui.banner.save`

## Usage
```html
<div id="app"></div>
<script type="module">
  import { createBus } from "./bus.js";
  import { mount as mountBanner } from "./top-banner.js";

  const bus = createBus();
  bus.on("ui.banner.new", p => console.log("new", p));

  mountBanner(document.getElementById("app"), bus, { title: "CRM" });
</script>
```
