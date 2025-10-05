# CRM – Module 0: Event Bus (Spec 00 → Implementation)

This package provides a tiny synchronous pub/sub bus that matches **Spec 00 — Event Bus (infrastructure)**.

## API

```js
import { bus } from './bus.js';

const unsubscribe = bus.on('ui.banner.filter', (payload) => {
  console.log('filter clicked', payload);
});

bus.emit('ui.banner.filter', { ts: Date.now() });
unsubscribe();
```

### Methods
- `bus.on(topic: string, handler: (payload:any)=>void): () => void` — subscribe; returns an unsubscribe function.
- `bus.emit(topic: string, payload?: any): void` — publish synchronously.
- `bus.off(topic: string, handler: Function): boolean` — remove a specific handler.
- `bus.clear(topic?: string): void` — remove all handlers (global or by topic).
- `bus.topics(): string[]` — list current topics with handlers.

### Topics (recommended prefixes)
- `ui.*`, `filters.*`, `data.*`, `opps.*`, `dialogs.*`, `debug.*`

## Demo
Open `src/index.html` in a browser and use the buttons to see events in the console and on the page.
