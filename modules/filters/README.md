# Filters Module

**Responsibility:** render the filter console and emit normalized filter events.

## Events
- Emits
  - `filters.changed` `{ q?, client?, closeDate?:{from?,to?}, salesStep? }`
  - `filters.cleared` `{}`
  - `filters.toggled` `{ open: boolean }`
- Listens
  - `ui.banner.filter` (toggle open/close)
  - `ui.banner.reset` (clear)

## API
```ts
mount(container: HTMLElement, initial?: Filters): {
  open(): void;
  close(): void;
  get(): Filters;
  destroy(): void;
}
```

## Demo
Open `modules/filters/index.html` in a browser. Use the header buttons to emit `ui.banner.filter` and `ui.banner.reset`. Check the “Event Log”.

