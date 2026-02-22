import { StoreApi } from 'zustand';
import { createWithEqualityFn } from 'zustand/traditional';

// ---------------------------------------------------------------------------
// Inline utilities (replaces lodash dependency)
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  )
    return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
      return false;
  }
  return true;
}

function getByPath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function hasPath(obj: Record<string, any>, path: string): boolean {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || !Object.prototype.hasOwnProperty.call(current, part))
      return false;
    current = current[part];
  }
  return true;
}

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
      return false;
  }
  return true;
}

function compose(fns: Array<(arg: any) => any>): (arg: any) => any {
  if (fns.length === 0) return (x: any) => x;
  return fns.reduce((a, b) => (x: any) => a(b(x)));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type TStateRecords = Record<string | number | symbol, any>;

/**
 * A map of computed property getter functions.
 *
 * Each function uses `this` to access the current state (and other computed values).
 * Use regular functions — **not arrow functions** — so `this` is bound correctly at runtime.
 *
 * At runtime, `this` is the full merged state (base + all other computed values).
 * TypeScript types `this` as `Record<string, any>` in the constraint to allow
 * each getter's return type to be typed without coupling it to `TState`.
 *
 * @example
 * ```ts
 * const computed: ComputedDef<{ count: number }> = {
 *   doubled() { return this.count * 2; },
 *   label()   { return String(this.count); },
 * };
 * ```
 */
export type ComputedDef<// eslint-disable-next-line @typescript-eslint/no-unused-vars
_TState extends TStateRecords = TStateRecords> = Record<
  string,
  (this: Record<string, any>) => any
>;

/**
 * Extracts the return types of a {@link ComputedDef} into a plain object type.
 *
 * This is what gets merged into the store state type when computed properties
 * are defined.
 *
 * @example
 * ```ts
 * type MyComputed = InferComputed<{
 *   doubled: (this: any) => number;
 *   label:   (this: any) => string;
 * }>;
 * // → { doubled: number; label: string }
 * ```
 *
 * @example Escape hatch — annotate the return type explicitly on the method:
 * ```ts
 * computed: {
 *   // When inference falls back to `any`, add an explicit return type:
 *   doubled(): number { return this.count * 2; }
 * }
 * ```
 */
export type InferComputed<
  TFns extends Record<string, (...args: any[]) => any>,
> = {
  [K in keyof TFns]: ReturnType<TFns[K]>;
};

/**
 * Controls how much detail is logged when state changes occur.
 *
 * - `'none'` — No logging (default)
 * - `'diff'` — Logs only the applied changes and computed updates
 * - `'all'`  — Logs previous state, applied changes, computed updates, and new state
 *
 * @example
 * ```js
 * { settings: { name: 'MyStore', logLevel: 'diff' } }
 * ```
 */
export enum LogLevel {
  None = 'none',
  Diff = 'diff',
  All = 'all',
}

/**
 * Configuration for store logging and identification.
 *
 * @example
 * ```js
 * {
 *   settings: {
 *     name: 'CounterStore',  // Shown in console log groups
 *     logLevel: 'diff'       // 'none' | 'diff' | 'all'
 *   }
 * }
 * ```
 */
export interface AddonsSettings {
  /** Display name for the store, shown in console log group headers. @default 'MyStore' */
  name?: string;
  /** How much detail to log on state changes. @default 'none' */
  logLevel?: LogLevel | string;
}

/**
 * Options passed as the second argument to `set()` or `setState()` for fine-grained control.
 *
 * @example
 * ```js
 * // Exclude a frequently-updated property from logs
 * set({ ticker: value }, { excludeFromLogs: true });
 *
 * // Replace the entire state (instead of merging)
 * set({ count: 0 }, { replace: true });
 *
 * // Combine both
 * set({ count: 0 }, { replace: true, excludeFromLogs: true });
 * ```
 */
export interface SetStateSettings {
  /** When `true`, this state update will not appear in console logs. @default false */
  excludeFromLogs?: boolean | undefined;
  /** When `true`, replaces the entire state instead of merging. @default false */
  replace?: boolean | undefined;
}

/**
 * The value passed to `set()` — either a partial state object or an updater function.
 *
 * The `void` return type in the function form enables compatibility with
 * **immer middleware**, where you mutate the draft state in-place instead of returning.
 *
 * @example
 * ```js
 * // Object form — merged into current state
 * set({ count: 1 });
 *
 * // Function form — receives current state, returns partial
 * set(state => ({ count: state.count + 1 }));
 *
 * // Function form with immer — mutate in place, return nothing
 * set(state => { state.count++; });
 * ```
 */
export type PartialState<T extends unknown> =
  | Partial<T>
  | ((state: T) => Partial<T> | void);

/**
 * Updates the store state. Accepts a partial state object or an updater function.
 *
 * @param partial - A partial state object to merge, or a function `(state) => partialState`.
 * @param replace - When `true`, replaces the entire state instead of merging. You can also
 *                  pass a {@link SetStateSettings} object for additional options.
 *
 * @example
 * ```js
 * // Inside a store action
 * set({ count: 1 });
 * set(state => ({ count: state.count + 1 }));
 *
 * // Outside a component
 * useStore.setState({ count: 0 });
 * useStore.setState({ count: 0 }, { replace: true, excludeFromLogs: true });
 * ```
 */
export type SetState<T extends unknown> = (
  partial: PartialState<T>,
  replace?: boolean
) => void;

export type SetStateAddons<T extends unknown> = (
  partial: PartialState<T>,
  setSettings?: SetStateSettings
) => void;

type StateCreatorFn<
  T extends unknown,
  CustomSetState = SetState<T> | SetStateAddons<T>,
> = (
  set: CustomSetState,
  get: StoreApi<T>['getState'],
  api: StoreApi<T>
) => T;

type SetStateExtraParam = boolean | undefined | SetStateSettings;

/**
 * The `this` context available inside watcher functions.
 *
 * @example
 * ```js
 * watchers: {
 *   total(newValue, oldValue) {
 *     // `this.set` updates the store
 *     this.set({ lastTotal: newValue });
 *     // `this.get` reads the current state
 *     console.log(this.get().count);
 *   }
 * }
 * ```
 */
export interface WatcherThis<TState> {
  /** Update the store state (same as the `set` function in store actions). */
  set: SetState<TState>;
  /** Read the current store state. */
  get: StoreApi<TState>['getState'];
  /** The full zustand store API object. */
  api: StoreApi<TState>;
}

/**
 * The addons configuration object — passed as the second argument to `createStore()`.
 *
 * @example
 * ```js
 * const useStore = createStore(
 *   (set, get) => ({ count: 0 }),
 *   {
 *     computed: {
 *       doubled() { return this.count * 2; }
 *     },
 *     watchers: {
 *       count(newVal, oldVal) { console.log('count changed:', newVal); }
 *     },
 *     middleware: [myMiddleware],
 *     settings: { name: 'CounterStore', logLevel: 'diff' }
 *   }
 * );
 * ```
 */
export interface Addons {
  /**
   * Computed properties derived from state. Each key becomes a state property
   * whose value is automatically recalculated when its dependencies change.
   *
   * Use regular functions (not arrow functions) — `this` refers to the current state.
   *
   * @example
   * ```js
   * computed: {
   *   doubleCount() { return this.count * 2; },
   *   total()       { return this.count + this.doubleCount; }
   * }
   * ```
   */
  computed?: TStateRecords;
  /**
   * Watcher callbacks triggered when a specific state property changes.
   * The key must match the property name to watch.
   *
   * Inside watchers, `this` provides `{ set, get, api }` for reading/writing state.
   *
   * @example
   * ```js
   * watchers: {
   *   total(newValue, oldValue) {
   *     if (newValue > 100) {
   *       this.set({ overflow: true });
   *     }
   *   }
   * }
   * ```
   */
  watchers?: TStateRecords;
  /**
   * An array of zustand middleware functions applied in order.
   * Eliminates the need for manual wrapping/nesting.
   *
   * @example
   * ```js
   * const logger = (config) => (set, get, api) =>
   *   config((args) => { console.log(args); set(args); }, get, api);
   *
   * { middleware: [logger] }
   * ```
   */
  middleware?: Array<any>;
  /**
   * Store identification and logging settings.
   * @see {@link AddonsSettings}
   */
  settings?: AddonsSettings;
}

// ---------------------------------------------------------------------------
// Template literal parsing — powers typed string selectors
// ---------------------------------------------------------------------------

/** Trim leading/trailing whitespace from a string type. */
type Trim<S extends string> =
  S extends ` ${infer R}` ? Trim<R> :
  S extends `${infer R} ` ? Trim<R> : S;

/** Split a comma-separated string into a tuple of trimmed keys. */
type Split<S extends string> =
  S extends `${infer Head},${infer Tail}`
    ? [Trim<Head>, ...Split<Tail>]
    : [Trim<S>];

/** Map a tuple of string keys to their corresponding value types from T. */
type LookupTuple<T, Keys extends string[]> =
  Keys extends [infer K extends string, ...infer Rest extends string[]]
    ? [K extends keyof T ? T[K] : unknown, ...LookupTuple<T, Rest>]
    : [];

/**
 * The store hook returned by `createStore()`. Can be used as:
 *
 * - **React hook** — call inside components to subscribe to state
 * - **Store API** — use `.getState()`, `.setState()`, `.subscribe()` outside React
 *
 * @template T The state type of the store (base state + computed properties).
 *
 * @example
 * ```ts
 * // Get entire state (re-renders on any change)
 * const state = useStore();
 *
 * // Function selector — full type inference
 * const count = useStore(s => s.count);  // number
 *
 * // Single-key string selector — full autocomplete + typed return
 * const count = useStore('count');  // number
 *
 * // Multi-key string selector — returns typed tuple
 * const [count, name] = useStore('count, name');  // [number, string]
 *
 * // Array selector — full autocomplete per element + typed tuple
 * const [count, name] = useStore(['count', 'name']);  // [number, string]
 *
 * // Outside React
 * useStore.getState().count;
 * useStore.setState({ count: 1 });
 * const unsub = useStore.subscribe(state => console.log(state));
 * ```
 */
export interface UseStore<T extends unknown> {
  /** Subscribe to the entire state. Re-renders on any state change. */
  (): T;
  /**
   * Select a slice of state with a selector function.
   * @param selector - Function that receives state and returns a derived value.
   * @param equalityFn - Optional custom equality function to prevent unnecessary re-renders.
   */
  <U>(selector: (s: T) => U, equalityFn?: (a: U, b: U) => boolean): U;
  /**
   * Select a single property by key name. Full autocomplete is provided.
   *
   * @param key - A single property name from the store state.
   * @param equalityFn - Optional custom equality function.
   * @returns The value of that property.
   *
   * @example
   * ```ts
   * const count = useStore('count');  // number ✅
   * ```
   */
  <K extends string & keyof T>(key: K, equalityFn?: (a: T[K], b: T[K]) => boolean): T[K];
  /**
   * Select multiple properties by passing an array of key names.
   * Full autocomplete is provided for each element.
   *
   * @param keys - An array of property names from the store state.
   * @returns A typed tuple matching the order of keys.
   *
   * @example
   * ```ts
   * const [count, name] = useStore(['count', 'name']);  // [number, string] ✅
   * ```
   */
  <K extends (string & keyof T)[]>(
    keys: [...K]
  ): { [I in keyof K]: K[I] extends keyof T ? T[K[I]] : never };
  /**
   * Select multiple properties via a comma-separated string.
   * Returns a typed tuple inferred from the property names.
   *
   * **Note:** IDE autocomplete is not available mid-string after commas.
   * Use the array overload for full per-key autocomplete.
   *
   * @param selector - A comma-separated list of property names: `'count, name'`.
   * @returns A typed tuple matching the listed keys.
   *
   * @example
   * ```ts
   * const [count, name] = useStore('count, name');  // [number, string] ✅
   * ```
   */
  <S extends string>(selector: S): LookupTuple<T, Split<S>>;
  /**
   * Update the store state from outside React components.
   * @see {@link SetState}
   */
  setState: SetState<T> | SetStateAddons<T>;
  /** Read the current state from outside React components. */
  getState: () => T;
  /**
   * Subscribe to state changes from outside React.
   * Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const unsub = useStore.subscribe((state, prevState) => {
   *   console.log('State changed:', state);
   * });
   * // Later: unsub();
   * ```
   */
  subscribe: StoreApi<T>['subscribe'];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDeps(fn: (state: unknown) => any) {
  const reg = /(?:this\.)([\w]+)/g;
  const reg2 = /(?:this\[')([\w]+)(?:'\])/g;
  const str = fn.toString();
  const matches = Array.from(str.matchAll(reg)).map((match) => match[1]);
  const matches2 = Array.from(str.matchAll(reg2)).map((match) => match[1]);
  return Array.from(new Set([...matches, ...matches2]));
}

function intersection(aArray: any[], bArray: any[]) {
  const intersections = [];
  for (const elem of bArray) {
    if (aArray.includes(elem)) {
      intersections.push(elem);
    }
  }
  return intersections;
}

// ---------------------------------------------------------------------------
// createStore (default export + named export)
// ---------------------------------------------------------------------------

/**
 * Creates a zustand store enhanced with computed properties, watchers,
 * middleware chaining, and simplified state selection.
 *
 * @param stateInitializer - A function `(set, get, api) => initialState` that defines
 *   the store's initial state and actions — identical to zustand's `create()`.
 * @param addons - Optional configuration for computed properties, watchers,
 *   middleware, and logging. See {@link Addons}.
 * @returns A React hook that also exposes `.getState()`, `.setState()`, and `.subscribe()`.
 *
 * @template TState The base store state.
 * @template TComputedFns The computed getter functions.
 *   Pass explicit return types on methods when inference falls back
 *   to `any`: `doubled(): number { return this.count * 2; }`
 *
 * @example
 * ```js
 * import create from 'zustand-store-addons';
 *
 * const useStore = create(
 *   (set, get) => ({
 *     count: 0,
 *     increment: () => set(state => ({ count: state.count + 1 })),
 *   }),
 *   {
 *     computed: {
 *       doubled() { return this.count * 2; },
 *     },
 *     watchers: {
 *       count(newVal, oldVal) {
 *         console.log(`count: ${oldVal} → ${newVal}`);
 *       },
 *     },
 *     settings: { name: 'CounterStore', logLevel: 'diff' },
 *   }
 * );
 *
 * // In a component:
 * function Counter() {
 *   const count = useStore(s => s.count);
 *   const doubled = useStore('doubled');   // ← fully typed as number!
 *   const [count, doubled] = useStore('count, doubled');
 *   return <p>{count} × 2 = {doubled}</p>;
 * }
 * ```
 *
 * @see {@link Addons} for the full addons configuration reference.
 * @see {@link UseStore} for the returned hook/API interface.
 * @see {@link ComputedDef} for typing the computed object explicitly.
 * @see {@link InferComputed} for extracting computed return types.
 */
export default function createStore<
  TState extends TStateRecords,
  TComputedFns extends Record<string, (...args: any[]) => any> = Record<never, never>,
>(
  stateInitializer: StateCreatorFn<TState>,
  addons?: Omit<Addons, 'computed'> & { computed?: TComputedFns }
): UseStore<TState & InferComputed<TComputedFns>> {
  let _api: StoreApi<TState> = undefined as unknown as StoreApi<TState>;
  let _originalSetState: StoreApi<TState>['setState'];
  let _computed: TStateRecords = {};
  let updatedComputed: Record<string | number | symbol, any> = {};
  let _computedMerged: boolean = false;
  let _computedPropDependencies: TStateRecords = {};
  const _watchers: TStateRecords = {};
  const _settings: AddonsSettings = {
    name: addons?.settings?.name ?? 'MyStore',
    logLevel: addons?.settings?.logLevel ?? LogLevel.None,
  };

  function attachMiddleWare(config: StateCreatorFn<TState>) {
    return (
      set: StoreApi<TState>['setState'],
      get: StoreApi<TState>['getState'],
      api: StoreApi<TState>
    ) => {
      return config(
        (args: any, setSettings: SetStateExtraParam) => {
          return setMiddleware([args, setSettings], set as any);
        },
        get,
        api
      );
    };
  }

  // Overwrites setState method
  function setState(args: any, setSettings: SetStateExtraParam) {
    setMiddleware([args, setSettings], _originalSetState as any);
  }

  function setMiddleware(args: any, set: any, recursiveOp: boolean = false) {
    const [partialState, setSettings] = args;

    let replaceState = false;
    let excludeFromLogs = false;

    if (typeof setSettings !== 'undefined') {
      if (typeof setSettings === 'boolean') {
        replaceState = setSettings;
      } else if (typeof setSettings === 'object') {
        replaceState = setSettings.replace || false;
        excludeFromLogs = setSettings.excludeFromLogs || false;
      }
    }

    const logOperations =
      !excludeFromLogs &&
      _computedMerged &&
      (_settings.logLevel as string) !== (LogLevel.None as string);

    const currentState = _api.getState();
    const changes =
      typeof partialState === 'function'
        ? partialState(currentState)
        : partialState;

    const group = `${_settings.name} state changed`;
    logOperations && !recursiveOp && console.group(group);
    logOperations &&
      !recursiveOp &&
      (_settings.logLevel as string) === (LogLevel.All as string) &&
      console.log('Previous State', currentState);

    logOperations && !recursiveOp && console.log('Applying', changes);

    updatedComputed = {};

    if (!replaceState) {
      for (const [compPropName, compPropDeps] of Object.entries(
        _computedPropDependencies
      )) {
        const needsRecompute = intersection(
          Object.keys(changes),
          compPropDeps
        );
        if (needsRecompute.length > 0) {
          updatedComputed[compPropName] = _computed[compPropName].apply(
            {
              ...currentState,
              ...changes,
              ...updatedComputed,
            },
            [
              {
                set: _api.setState,
                get: _api.getState,
              },
            ]
          );
        }
      }
    }

    if (Object.keys(updatedComputed).length > 0) {
      logOperations &&
        console.log('Updating computed values', updatedComputed);
    }

    const newState = { ...changes, ...updatedComputed };

    // Clean computed properties and watchers if they are no longer in the state
    if (replaceState) {
      for (const [compPropName] of Object.entries(_computed)) {
        if (!(compPropName in newState)) {
          delete _computed[compPropName];
          delete _computedPropDependencies[compPropName];
        }
      }

      for (const [watcherName] of Object.entries(_watchers)) {
        if (!(watcherName in newState)) {
          delete _watchers[watcherName];
        }
      }
    }

    set(newState, replaceState);

    for (const [propName, fn] of Object.entries(_watchers)) {
      const newVal = getByPath(newState, propName);
      const currentVal = getByPath(currentState, propName);

      if (hasPath(newState, propName) && !deepEqual(newVal, currentVal)) {
        logOperations && console.log(`Triggering watcher: ${propName}`);
        fn.apply({ set: _api.setState, get: _api.getState, api: _api }, [
          newVal,
          currentVal,
        ]);
      }
    }

    if (Object.keys(updatedComputed).length > 0 && !replaceState) {
      setMiddleware(
        [updatedComputed, setSettings],
        _originalSetState,
        true
      );
    }

    logOperations &&
      (_settings.logLevel as string) === (LogLevel.All as string) &&
      !recursiveOp &&
      console.log('New State', _api.getState());

    logOperations && !recursiveOp && console.groupEnd();
  }

  const middlewareFunctions = (
    middleware:
      | Array<<TState extends TStateRecords>() => StateCreatorFn<TState>>
      | undefined,
    store: StateCreatorFn<TState>
  ) => (middleware ? compose(middleware)(store) : store);

  function configComputed(computed: TStateRecords) {
    let computedToAdd: Record<string, any> = {};
    for (const [key, _value] of Object.entries(computed) as [
      string,
      TStateRecords[keyof TStateRecords],
    ][]) {
      const deps = getDeps(_value);
      if (deps.length > 0) {
        _computedPropDependencies[key] = deps;
        _computed[key] = _value;
      }
      computedToAdd = {
        ...computedToAdd,
        [key]: _value.apply({ ..._api.getState(), ...computedToAdd }, [
          { set: _api.setState, get: _api.getState },
        ]),
      };
    }
    if (Object.keys(computedToAdd).length > 0) {
      (_api.setState as any)(computedToAdd);
    }

    _computedMerged = true;
  }

  function configWatchers(watchers: TStateRecords) {
    for (const [propName, fn] of Object.entries(watchers)) {
      _watchers[propName] = fn;
    }
  }

  function _stateCreator(
    set: StoreApi<TState>['setState'],
    get: StoreApi<TState>['getState'],
    api: StoreApi<TState>
  ): TState {
    _api = api;
    _originalSetState = { ...api }.setState;
    (_api as any).setState = setState;
    const setStateWithAddons = addons?.settings
      ? (set as unknown as SetStateAddons<TState>)
      : set;
    return {
      ...stateInitializer(setStateWithAddons as any, get, api),
    };
  }

  const middleware = addons?.middleware;
  const wrappedStateCreator = middlewareFunctions(
    middleware,
    _stateCreator as StateCreatorFn<TState>
  );

  // Use createWithEqualityFn from zustand/traditional to support
  // custom equality functions (needed for string-selector returning arrays).
  // This is compatible with both zustand v4 and v5.
  const hook: any = createWithEqualityFn(
    attachMiddleWare(wrappedStateCreator) as any,
    Object.is,
  );

  const stateHook: any = (selector: any, equalityFn?: any) => {
    // Array selector: useStore(['count', 'name']) → [state.count, state.name]
    if (Array.isArray(selector)) {
      return hook(
        (state: any) => selector.map((key: string) => state[key]),
        shallowEqual
      );
    }
    if (typeof selector === 'string') {
      if (selector.indexOf(',') !== -1) {
        const props = selector.split(',').map((part: string) => part.trim());
        // Use our own shallow comparison for the string-selector overload
        return hook(
          (state: any) => props.map((prop: string) => state[prop]),
          shallowEqual
        );
      }
      return hook((state: any) => state[selector], equalityFn);
    }
    return hook(selector, equalityFn);
  };

  Object.assign(stateHook, _api);

  configComputed(addons?.computed ?? {});
  configWatchers(addons?.watchers ?? {});

  return stateHook;
}

/**
 * Named re-export of the default `createStore` function.
 *
 * @example
 * ```js
 * import { createStore } from 'zustand-store-addons';
 * ```
 */
export { createStore };
