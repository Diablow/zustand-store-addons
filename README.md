## Zustand Store Addons

Create [zustand](https://github.com/react-spring/zustand) stores with the leverage of powerful features inspired by [Vue.js](https://vuejs.org/) component's state management.

## Included Features

* **Computed properties**.

* **Watchers**.

* **Simplified fetch syntax**.

* **Middleware chaining**.

* **Automatic logs** for operations.

## Installation

```bash
npm install zustand zustand-store-addons
```

or

```bash
yarn add zustand zustand-store-addons
```

**Note: *Requires zustand version >= 3.0.0*

## But... Why not a middleware?

Although middleware can help you add extra functionality *it scope is limited to what is being passed to the create function and attached once the initial state setup has completed*. Some of the included features can't be possible because of this.

---

# Addons Object

When we setup a store using this package we can pass an object as a second parameter to the create function with the following properties: [computed](#computed-properties-addonscomputed), [watchers](#watchers-addonswatchers), [middleware](#middleware-chaining-addonsmiddleware) and [settings](#log-settings-addonssettings).

```jsx
const useStore = create((set, get) => ({
    welcomeMessage: 'Hello there!'
  }),
  // Addons object
  {
    computed: {},
    watchers: {},
    middleware: [],
    settings: {}
  }
)
```

If the addons object is not provided the only feature we can still use would be the [simplified fetch syntax](#simplified-fetch-syntax).

# How to use it, and why use it

We're going to start with a conventional zustand store

```jsx
import create from 'zustand-store-addons';

const useStore = create((set, get) => ({
  count: 0,
  increment: set({ count: get().count + 1 }),
});

export default AnotherCounterComponent() {
  const count = useStore(state => state.count);
  const increment = useStore(state => state.increment);

  return (
    <div>
      <p>Count: {count}</p>
      <button type="button" onClick={increment}>
        Increment
      </button>
    </div>
  )
}
```

Ok, at this point we feel the need to display **count multiplied by 2** and a **total** representing the sum of both values, so we do the following:

```jsx
export default AnotherCounterComponent() {
  const count = useStore(state => state.count);
  const increment = useStore(state => state.increment);
  const doubleCount = count * 2; // <--
  const total = count + doubleCount; // <--

  return (
    <div>
      <p>Count: {count}</p>
      <p>Count*2: {doubleCount}</p>
      <hr />
      <p>Total: {total}</p>
      <button type="button" onClick={increment}>
        Increment
      </button>
    </div>
  )
}
```

We are now calculating the `doubleCount` and `total` values **inside the component**.
Everything looks good until we realize that we need to **have access to these values from other components too** –that's the whole idea of using a "global/context" state management– and they are not descendants of this component (*prop drilling* is not a practical solution).

Wouldn't be great if we could calculate `doubleCount` and `total` in the store? Now we can!

Let's pass an object ([addons object](#addons-object)) as a second argument to the create store function with a `computed` key in order to list our **computed properties**

## Computed properties (addons.computed)

```jsx
import create from 'zustand-store-addons';

const useStore = create((set, get) => ({
  count: 0,
  increment: set({ count: get().count + 1 }),
}), {
  computed: {
    doubleCount: function() {
      // `this` points to the state object
      return this.count * 2
    },
    // Shorthand method definition
    total() {
      return this.count + this.doubleCount;
    }
  }
};
```

The above will result in the following state:

```jsx
{
  count: 0,
  increment: function () { /* Increment fn logic */ },
  doubleCount: 0,
  total: 0,
}
```

For each key contained in the computed object, a property –named after the key– will be added to the state, and the provided function will be used as the getter function.

***Inside the getter functions we use the `this` keyword which points to the state, for this reason we should not use arrow functions to define them***.

Now we need to update our component

```jsx
export default AnotherCounterComponent() {
  // This is getting crowded... Is this the best way?
  const count = useStore(state => state.count);
  const increment = useStore(state => state.increment);
  const doubleCount = useStore(state => state.doubleCount);
  const total = useStore(state => state.total);

  return (
    <div>
      <p>Count: {count}</p>
      <p>Count*2: {doubleCount}</p>
      <hr />
      <p>Total: {total}</p>
      <button type="button" onClick={increment}>
        Increment
      </button>
    </div>
  )
}
```

In the code above we are *selecting* properties from the store individually, what are our options to save space or typing fatigue 😆?

Perhaps use an array:

```jsx
const [count, increment, doubleCount, total] = useStore(
  state => [state.count, state.increment, state.doubleCount, state.total]
)
```

If we leave the code above as it is right now with any change in the store –even not selected properties– our component will re-render in order to keep the pace. We don't want that behavior, let's add zustand's **shallow** function to prevent it:

```jsx
const [count, increment, doubleCount, total] = useStore(
  state => [state.count, state.increment, state.doubleCount, state.total]
, shallow)
```

Is this better? It seems repetitive. Let's take a look at a different approach **simplified fetch syntax**.

## Simplified fetch syntax

We can use a string to list our selection separating each property with commas. It is case-sensitive, white space is ignored and uses the **shallow** function internally.

```jsx
const [count, increment, doubleCount, total] = useStore(
  'count, increment, doubleCount, total'
)

// or use template literals/strings if you need
const times = 'double';
const [count, increment, doubleCount, total] = useStore(
  `count, increment, ${times}Count, total`
)
```

So, let's go back to our example and apply this to clean our component's code a little bit.

```jsx
export default AnotherCounterComponent() {
  const [count, increment, doubleCount, total] = useStore(
    'count, increment, doubleCount, total'
  )

  return (
    <div>
      <p>Count: {count}</p>
      <p>Count x 2: {doubleCount}</p>
      <hr />
      <p>Total: {total}</p>
      <button type="button" onClick={increment}>
        Increment
      </button>
    </div>
  )
}
```

This is looking good! It's time to add logs to our store in order to see how the state is being *mutated*. We're going to use a middleware function.

If we were implementing a middleware function with a standard zustand store we would need to wrap the *create* function parameters with it. If we wanted to use another one we would wrap the previous one and so on e.g., `useStore(mw2(mw1((set, get) => ({...}))))` but this is not a standard store, so we can use **middleware chaining**.

## Middleware chaining (addons.middleware)

Easy way to add middleware to our stores using an array. This will apply the functions using the element's order so you don't need to worry about the wrapping.

```jsx
import create from 'zustand-store-addons';

const log = config => (set, get, api) => config(args => {
  console.log("  applying", args)
  set(args)
  console.log("  new state", get())
}, get, api)

const useStore = create((set, get) => ({
  count: 0,
  increment: set({ count: get().count + 1 }),
}), {
  computed: {
    doubleCount: function() {
      return this.count * 2
    },
    total() {
      return this.count + this.doubleCount;
    }
  },
  middleware: [log] // <- This is it
};

```

Great, now we're outputting the changes to the console. But we need a way to identify the logs when using multiple stores, we could modify the middleware, but... there is another way. 😎

## Log settings (addons.settings)

In order to turn the logs on we need to add the settings property to the addons object. In the settings object we can set the `name` for the store and `logLevel` to `'diff'` if we want to display only the changes. Or we can use `'all'` in case we want to see the previous state, the changes and the new state. The default value for `logLevel` is `'none'`.

```jsx
import create from 'zustand-store-addons';

const useStore = create((set, get) => ({
  count: 0,
  increment: set({ count: get().count + 1 }),
}), {
  computed: {
    doubleCount: function() {
      return this.count * 2
    },
    total() {
      return this.count + this.doubleCount;
    }
  },
  settings: {
    name: 'CounterStore',
    logLevel: 'diff'
  }
};

```

### Frequently updated properties

Sometimes there are properties that need to be updated very often and logging them constantly can be annoying and potentially fill the console view very quickly. For this cases we can pass a configuration object as a second argument to the `set` and `setState` functions to exclude the operation in the logs.

```jsx
set({ tickerSeconds: 20 }, { excludeInLogs: true });

useStore.setState({
  tickerSeconds: 20,
  foo: 'bar'
}, {
  excludeInLogs: true
});

```

## Watchers (addons.watchers)

This feature allow us to add callbacks directly in our store that will be triggered when a certain property change. In the watchers object we add method definitions matching the method's name to the property we want to watch. The callback will be called passing the `newValue` and `prevValue` as arguments.

Let's return to the example code we've been using.
We might want to do something when `total` goes above 20.

```jsx
import create from 'zustand-store-addons';

const useStore = create(
  // First argument remains the same as zustand's create function
  (set, get) => ({
    count: 0,
    increment: set({ count: get().count + 1 }),
    above20: false, // <-- We add this property
  }),
  // Second argument is were you put the addons
  {
    computed: {
      doubleCount() {
        return this.count * 2
      },
      total() {
        return this.count + this.doubleCount;
      }
    },
    watchers: {
      // Will trigger every time "total" changes
      total(newTotal, prevTotal) {
        // `this` keyword gives us access to set, get and api.
        if (newTotal > 20 && prevTotal <= 20) {
          this.set({ above20: true })
        }
      }
    },
    settings: {
      name: 'CounterStore',
      logLevel: 'diff'
    }
  }
)

```

The ***total watcher*** will be trigger every time that `total` property changes and will set `above20` to `true` the first time the value is greater than 20.

Inside any watcher function we get access to the `this` keywords which in this case points to an object that contains zustand's  `set` and `get` methods and `api` object.
