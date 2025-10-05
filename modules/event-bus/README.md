# 01 — Event Bus (Module)
Responsibility: Provide a simple synchronous pub/sub to decouple modules.
Out-of-scope: Business logic, persistence, async queues.

## API
- `bus.on(topic: string, handler: (payload:any) => void): () => void` — returns unsubscribe.
- `bus.emit(topic: string, payload?: any): void`
- `bus.count(topic?: string): number` — number of handlers (for debug)
- `bus.clear(topic?: string): void` — remove listeners (for tests/dev only)

## Reserved Topic Prefixes
- `ui.*` (raw UI actions)
- `filters.*` (criteria change)
- `data.*` (load/save/import/export)
- `opps.*` (CRUD opportunities)
- `dialogs.*` (open/close dialogs)
- `debug.*`

## Usage
```html
<script type="module">
  import { bus } from './modules/event-bus/bus.js';
  const off = bus.on('ui.banner.save', p => console.log('save', p));
  bus.emit('ui.banner.save', { ts: Date.now() });
  off(); // unsubscribe
</script>
```

## Notes
- Synchronous delivery, FIFO per-topic (handlers are called in the order they were registered).
- No wildcard matching; topics must match exactly (e.g., `ui.banner.save`). You may implement fan-out in your own code by emitting multiple topics.
- `bus.clear()` is intended for tests; do not call it from application code.
