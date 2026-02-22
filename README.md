# Zustand Store Addons

> Computed properties, watchers, typed selectors, middleware chaining and automatic logs for [Zustand](https://github.com/pmndrs/zustand) stores.

## Features

- **Computed properties** — derived state that auto-updates when dependencies change
- **Watchers** — callbacks triggered when specific state properties change
- **Typed selectors** — string, array, and function selectors with full TypeScript inference
- **Middleware chaining** — apply middleware via a flat array instead of nested wrapping
- **Automatic logging** — configurable console logs for state changes
- **Zero extra dependencies** — no lodash or other runtime libraries (only requires Zustand)
- **Full TypeScript support** — JSDoc-documented API with rich IntelliSense for both TS and JS users
- **Zustand v4 & v5 compatible** — works with `zustand >=4.5.0`

## Installation

```bash
npm install zustand zustand-store-addons
```

> [!NOTE]
> When using **zustand v5**, also install `use-sync-external-store`:
> ```bash
> npm install use-sync-external-store
> ```

## Quick Start

```ts
import create from 'zustand-store-addons';

interface MyStore {
  count: number;
  increment: () => void;
  above20: boolean;
  doubleCount: number;
  total: number;
}

const useStore = create<MyStore>(
  (set) => ({
    count: 0,
    increment: () => set(state => ({ count: state.count + 1 })),
    above20: false,
    doubleCount: 0,
    total: 0,
  }),
  {
    computed: {
      doubleCount(this: MyStore) { return this.count * 2; },
      total(this: MyStore) { return this.count + this.doubleCount; },
    },
    watchers: {
      total(newVal: number, oldVal: number) {
        if (newVal > 20 && oldVal <= 20) {
          this.set({ above20: true });
        }
      },
    },
    settings: { name: 'CounterStore', logLevel: 'diff' },
  }
);
```

```tsx
function Counter() {
  // Array selector — full autocomplete per element
  const [count, doubleCount, total] = useStore(['count', 'doubleCount', 'total']);

  // Or single-key selector — full autocomplete + typed return
  const increment = useStore('increment');

  return (
    <div>
      <p>Count: {count}</p>
      <p>Count × 2: {doubleCount}</p>
      <p>Total: {total}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
}
```

---

## Import

```ts
// Default import
import create from 'zustand-store-addons';

// Named import
import { createStore } from 'zustand-store-addons';
```

---

## Addons Object

The second argument to `createStore()` is an optional addons object:

```ts
const useStore = create(
  (set, get) => ({ /* ...state... */ }),
  {
    computed: {},     // Computed properties
    watchers: {},     // Watcher callbacks
    middleware: [],   // Middleware chain
    settings: {},     // Store name & log level
  }
);
```

---

## Computed Properties

Derived properties that auto-recalculate when their dependencies change. Use regular functions (not arrow functions) — `this` refers to the current state.

```ts
const useStore = create(
  (set) => ({
    count: 0,
    increment: () => set(state => ({ count: state.count + 1 })),
  }),
  {
    computed: {
      doubleCount(): number {
        return this.count * 2;
      },
      total(): number {
        return this.count + this.doubleCount;
      },
    },
  }
);

// State shape after computed merge:
// { count: 0, increment: fn, doubleCount: 0, total: 0 }
```

### Typed Computed Properties

Computed properties can be fully typed by providing an explicit state interface to `create()` and typing the `this` context inside your computed methods:

```ts
interface CounterState {
  count: number;
  doubled: number;
}

const useStore = create<CounterState>(
  () => ({ count: 3, doubled: 0 }),
  {
    computed: {
      // Annotate `this` with your state interface
      doubled(this: CounterState) {
        return this.count * 2;
      },
    },
  }
);

const state = useStore.getState();
state.doubled  // ✅ typed as number
state.count    // ✅ typed as number
```

---

## Typed Selectors

Three selector styles are available, all with TypeScript inference:

### Function selector

Standard zustand pattern — full type inference:

```ts
const count = useStore(s => s.count);  // number
```

### Single-key string selector

Full autocomplete, typed return value:

```ts
const count = useStore('count');  // number ✅
```

### Array selector

Full per-element autocomplete, returns a typed tuple:

```ts
const [count, increment] = useStore(['count', 'increment']);
// [number, () => void] ✅
```

### Comma-separated string selector

Returns a typed tuple via template literal parsing:

```ts
const [count, doubleCount, total] = useStore('count, doubleCount, total');
// [number, number, number] ✅
```

> [!NOTE]
> IDE autocomplete is not available mid-string after commas. Use the **array selector** for the best autocomplete experience.

---

## Watchers

Callbacks triggered when a specific state property changes. The method name must match the property to watch. Each callback receives `(newValue, oldValue)` as arguments.

Inside watchers, `this` provides `{ set, get, api }` for reading and writing state.

```ts
const useStore = create(
  (set) => ({
    count: 0,
    above20: false,
    increment: () => set(state => ({ count: state.count + 1 })),
  }),
  {
    watchers: {
      count(newValue: number, oldValue: number) {
        console.log(`count: ${oldValue} → ${newValue}`);
        if (newValue > 20) {
          this.set({ above20: true });
        }
      },
    },
  }
);
```

### Typed Watchers

Use the exported `WatcherThis<TState>` type for full typing of `this` inside watchers:

```ts
import type { WatcherThis } from 'zustand-store-addons';

interface MyState {
  count: number;
  above20: boolean;
}

// In the addons object:
watchers: {
  count(this: WatcherThis<MyState>, newVal: number, oldVal: number) {
    this.set({ above20: true });   // ✅ fully typed
    this.get().count;              // ✅ number
  },
}
```

---

## Middleware Chaining

Apply middleware via a flat array — no more nested wrapping:

```ts
const logger = (config) => (set, get, api) =>
  config((args) => {
    console.log('applying', args);
    set(args);
    console.log('new state', get());
  }, get, api);

const useStore = create(
  (set) => ({ count: 0 }),
  {
    middleware: [logger],
  }
);
```

---

## Logging

Configure logging via `addons.settings`:

```ts
{
  settings: {
    name: 'CounterStore',   // Shown in console group headers
    logLevel: 'diff'        // 'none' (default) | 'diff' | 'all'
  }
}
```

| Level | Output |
|-------|--------|
| `'none'` | No logging |
| `'diff'` | Applied changes + computed updates |
| `'all'` | Previous state, changes, computed updates, and new state |

### Excluding operations from logs

```ts
// Exclude frequently-updated properties from logs
set({ ticker: value }, { excludeFromLogs: true });

// Combine with state replacement
useStore.setState({ count: 0 }, { replace: true, excludeFromLogs: true });
```

### Replacing state

```ts
// Replace entire state (instead of merging)
useStore.setState({ count: 0 }, true);

// Or using the settings object
useStore.setState({ count: 0 }, { replace: true });
```

---

## API Reference

### `createStore(stateCreator, addons?)`

| Parameter | Type | Description |
|---|---|---|
| `stateCreator` | `(set, get, api) => State` | State initializer (same as zustand's `create()`) |
| `addons.computed` | `Record<string, function>` | Computed properties — `this` = current state |
| `addons.watchers` | `Record<string, function>` | Watcher callbacks — `this` = `{ set, get, api }` |
| `addons.middleware` | `Array<Function>` | Middleware functions applied in order |
| `addons.settings` | `{ name?, logLevel? }` | Store name and log level |

### Returned `useStore` hook

| Usage | Return Type | Description |
|---|---|---|
| `useStore()` | `TState` | Get entire state |
| `useStore(s => s.count)` | Inferred | Function selector |
| `useStore('count')` | `TState['count']` | Single-key selector (full autocomplete) |
| `useStore(['a', 'b'])` | `[TState['a'], TState['b']]` | Array selector (full autocomplete) |
| `useStore('a, b')` | `[TState['a'], TState['b']]` | Comma-separated selector (typed tuple) |
| `useStore.getState()` | `TState` | Read state outside React |
| `useStore.setState(partial)` | `void` | Update state outside React |
| `useStore.subscribe(fn)` | `() => void` | Subscribe to changes (returns unsubscribe) |

### Exported Types

| Type | Description |
|---|---|
| `SetState<T>` | The `set` function signature |
| `SetStateAddons<T>` | Extended `set` with `SetStateSettings` |
| `PartialState<T>` | `Partial<T> \| ((state: T) => Partial<T> \| void)` |
| `SetStateSettings` | `{ excludeFromLogs?, replace? }` |
| `AddonsSettings` | `{ name?, logLevel? }` |
| `Addons` | Full addons configuration object |
| `UseStore<T>` | The returned hook/API interface |
| `WatcherThis<T>` | `this` context inside watchers (`{ set, get, api }`) |
| `ComputedDef<T>` | Typed map of computed getter functions |
| `InferComputed<T>` | Extracts computed return types into a plain object type |
| `LogLevel` | Enum: `None`, `Diff`, `All` |

---

## What's New in v1.0.0

- **Zustand v5 support** — compatible with both v4 (4.5+) and v5 via `createWithEqualityFn`
- **Zero extra dependencies** — removed `lodash-es`, `string.prototype.matchall`, and all other extra runtime deps
- **Typed computed properties** — properly type derived state by passing explicit interfaces and binding `this` context
- **Typed selectors** — single-key, array, and comma-separated selectors with full TypeScript inference
- **JSDoc documentation** — rich IntelliSense tooltips for all exported types and functions
- **Immer middleware support** — `PartialState<T>` now accepts `void` returns for immer-style mutations
- **Modern build tooling** — dual ESM/CJS output via `tsup` with TypeScript declaration files
- **Smaller bundle** — ~8KB (down from ~25KB with lodash)

## Compatibility

| Dependency | Version |
|---|---|
| `zustand` | `>=4.5.0` |
| `react` | `>=17` (optional) |
| `use-sync-external-store` | `>=1.2.0` (optional, required for zustand v5) |

## License

MIT
