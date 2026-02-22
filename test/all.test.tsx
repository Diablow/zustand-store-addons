import { describe, it, expect } from 'vitest';
import create, { SetState, WatcherThis } from '../src';
import { StoreApi } from 'zustand';
import React from 'react';
import { render } from '@testing-library/react';

describe('create', () => {
  it('creates a store hook and api object', () => {
    let params: any;
    const result = create((...args) => {
      params = args;
      return { value: null };
    });
    expect(params).toHaveLength(3);
    expect(typeof params[0]).toBe('function'); // set
    expect(typeof params[1]).toBe('function'); // get
    expect(typeof params[2]).toBe('object'); // api
    expect(typeof params[2].getState).toBe('function');
    expect(typeof params[2].setState).toBe('function');
    expect(typeof params[2].subscribe).toBe('function');
    expect(typeof result).toBe('function');
    expect(typeof result.getState).toBe('function');
    expect(typeof result.setState).toBe('function');
  });

  it('creates a store hook and api object passing empty addons', () => {
    let params: any;
    const result = create((...args) => {
      params = args;
      return { value: null };
    }, {});
    expect(params).toHaveLength(3);
    expect(typeof params[0]).toBe('function');
    expect(typeof params[1]).toBe('function');
    expect(typeof params[2]).toBe('object');
    expect(typeof result).toBe('function');
    expect(typeof result.getState).toBe('function');
    expect(typeof result.setState).toBe('function');
  });

  it('creates a store hook and api object passing addons obj', () => {
    let params: any;
    const result = create(
      (...args) => {
        params = args;
        return { count: 0 };
      },
      {
        computed: {
          // Explicit return type: escape hatch when `this` context is ambiguous
          doubleCount(): number {
            return (this as any).count * 2;
          },
        },
        watchers: {
          count(newValue: number, oldValue: number) {
            console.log(newValue, oldValue);
          },
        },
        middleware: [],
        settings: {
          name: 'TestingStore',
          logLevel: 'diff',
        },
      }
    );
    expect(params).toHaveLength(3);
    expect(typeof params[0]).toBe('function');
    expect(typeof params[1]).toBe('function');
    expect(typeof params[2]).toBe('object');
    expect(typeof result).toBe('function');
  });

  it('uses the store with no args', async () => {
    const useStore = create(
      (set) => ({
        count: 1,
        inc: () => set((state: any) => ({ count: state.count + 1 })),
      }),
      {
        computed: {
          doubleCount(): number {
            return (this as any).count * 2;
          },
        },
      }
    );

    function Counter() {
      const { count, doubleCount, inc } = useStore();
      React.useEffect(inc, []);
      return (
        <div>
          <p>count: {count}</p>
          <p>doubleCount: {doubleCount}</p>
        </div>
      );
    }

    const { findByText } = render(<Counter />);

    await findByText('count: 2');
    await findByText('doubleCount: 4');
  });

  it('uses the store with selectors', async () => {
    const useStore = create(
      (set, get) => ({
        count: 1,
        inc: () => set({ count: get().count + 1 }),
      }),
      {
        computed: {
          doubleCount(): number {
            return (this as any).count * 2;
          },
        },
      }
    );

    function Counter() {
      const count = useStore((s) => s.count);
      const doubleCount = useStore((s) => s.doubleCount);
      const inc = useStore((s) => s.inc);
      React.useEffect(inc, []);
      return (
        <div>
          <p>count: {count}</p>
          <p>doubleCount: {doubleCount}</p>
        </div>
      );
    }

    const { findByText } = render(<Counter />);

    await findByText('count: 2');
    await findByText('doubleCount: 4');
  });

  it('uses the store with simplified fetch', async () => {
    type CounterStore = {
      count: number;
      inc: () => void;
      doubleCount: number;
    };
    const useStore = create<CounterStore>(
      (set, get) => ({
        count: 1,
        inc: () => set((state: any) => ({ count: state.count + 1 })),
        doubleCount: 0,
      }),
      {
        computed: {
          doubleCount(): number {
            return (this as any).count * 2;
          },
        },
      }
    );

    function Counter() {
      const [count, doubleCount, inc] = useStore('count, doubleCount, inc');

      React.useEffect(inc, []);
      return (
        <div>
          <p>count: {count}</p>
          <p>doubleCount: {doubleCount}</p>
        </div>
      );
    }

    const { findByText } = render(<Counter />);

    await findByText('count: 2');
    await findByText('doubleCount: 4');
  });

  it('uses the store with simplified fetch and watchers', async () => {
    // When passing explicit TState, also use explicit return types on computed
    // so TComputedFns is correctly inferred.
    const useStore = create(
      (set) => ({
        count: 1 as number,
        inc: () => set((state: any) => ({ count: state.count + 1 })),
        moreThan5: false,
      }),
      {
        computed: {
          doubleCount(): number {
            return (this as any).count * 2;
          },
          total(): number {
            return (this as any).count + (this as any).doubleCount;
          },
        },
        watchers: {
          total(newValue: number, oldValue: number) {
            if (newValue > 5 && oldValue <= 5) {
              this.set({ moreThan5: true });
            }
          },
        },
      }
    );

    function Counter() {
      const [count, doubleCount, total, moreThan5, inc] = useStore(
        'count, doubleCount, total, moreThan5, inc'
      );
      React.useEffect(inc, []);
      return (
        <div>
          <p>count: {count}</p>
          <p>doubleCount: {doubleCount}</p>
          <p>total: {total}</p>
          {moreThan5 && <p>More than 5</p>}
        </div>
      );
    }

    const { findByText } = render(<Counter />);

    await findByText('count: 2');
    await findByText('doubleCount: 4');
    await findByText('total: 6');
    await findByText('More than 5');
  });

  it('uses the store with simplified fetch and watchers but replacing state from watcher', async () => {
    const useStore = create(
      (set) => ({
        count: 1,
        inc: () => set((state: any) => ({ count: state.count + 1 })),
        moreThan5: false,
      }),
      {
        computed: {
          doubleCount(): number {
            return (this as any).count * 2;
          },
          total(): number {
            const count: number = (this as any).count;
            const doubleCount: number = (this as any).doubleCount;
            return count === undefined || doubleCount === undefined
              ? 0
              : count + doubleCount;
          },
        },
        watchers: {
          total(newValue: number, oldValue: number) {
            if (newValue > 5 && oldValue <= 5) {
              this.set({ moreThan5: true }, { replace: true });
            }
          },
        },
        settings: {
          name: 'rudeTest',
          logLevel: 'all',
        },
      }
    );

    function Counter() {
      const [count, doubleCount, total, moreThan5, inc] = useStore(
        'count, doubleCount, total, moreThan5, inc'
      );
      React.useEffect(inc, []);
      return (
        <div>
          <p>count: {count}</p>
          <p>doubleCount: {doubleCount}</p>
          <p>total: {total}</p>
          {moreThan5 && <p>More than 5</p>}
        </div>
      );
    }

    const { findByText } = render(<Counter />);

    await findByText('More than 5');
    expect(useStore.getState()).toEqual({ moreThan5: true });
  });

  it('getState returns computed properties', () => {
    interface CounterAndDouble {
      count: number;
      doubled: number;
    }
    const useStore = create<CounterAndDouble>(
      () => ({ count: 3, doubled: 0 }),
      {
        computed: {
          // Explicit cast only needed
          // if TypeScript's strict mode can't resolve it in your editor.
          doubled(this: CounterAndDouble) {
            return this.count * 2;
          },
        },
      }
    );

    // No `as any` needed — doubled is now typed as number ✅
    const state = useStore.getState();
    expect(state.count).toBe(3);
    expect(state.doubled).toBe(6);
  });

  it('watchers receive correct newValue and oldValue', () => {
    const calls: Array<[number, number]> = [];

    interface CounterState {
      count: number;
      inc: () => void;
    }
    const useStore = create<CounterState>(
      (set) => ({
        count: 0,
        inc: () => set((state) => ({ count: state.count + 1 })),
      }),
      {
        watchers: {
          count(this: WatcherThis<CounterState>, newVal: number, oldVal: number) {
            calls.push([newVal, oldVal]);
            // Now this.set, this.get, this.api are all fully typed ✅
          },
        },
      }
    );

    useStore.getState().inc();
    useStore.getState().inc();

    expect(calls).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
});
