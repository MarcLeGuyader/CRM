# Module 1 — Top Banner (with Event Bus harness)

This package contains a self-contained test page for the **Top Banner** module, wired to a minimal `bus.js` pub/sub.

## Files
- `index.html` — open in a browser to test.
- `styles.css` — minimal style tokens (same brand color).
- `bus.js` — synchronous pub/sub (`on`, `once`, `off`, `emit`, `clearAll`, `count`).
- `top-banner.js` — the module implementation. Exports `mountTopBanner(container, opts)`.
- `test-harness.js` — mounts the banner, subscribes to `ui.banner.*` topics, and logs events.
- `README.md` — this file.

## How to run
1. Unzip.
2. Open `index.html` directly in your browser (double click) or via a static server.
3. Click buttons in the banner:
   - You should see lines like:
     ```text
     [{ts}] ui.banner.filter {"ts": 1730000000000}
     ```
4. Use **Clear listeners** to remove all subscriptions (for testing).

## Event topics emitted
- `ui.banner.filter`
- `ui.banner.new`
- `ui.banner.debug`
- `ui.banner.reset`
- `ui.banner.upload`
- `ui.banner.export`
- `ui.banner.save`

Payload: `{ "ts": number }` (epoch ms).

---
Generated: 2025-10-05T01:52:59.667916Z
