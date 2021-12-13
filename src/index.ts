import create, {
  State,
  StateSelector,
  EqualityChecker,
  PartialState,
  GetState,
  Subscribe,
  Destroy,
  StoreApi,
} from 'zustand';
import shallow from 'zustand/shallow';
import flow from 'lodash/flow';
// @ts-ignore
import matchAll from 'string.prototype.matchall';
import unset from 'lodash/unset';
import hasIn from 'lodash/hasIn';
import isEqual from 'lodash/isEqual';
import _get from 'lodash/get';

matchAll.shim();

type TStateRecords = Record<string | number | symbol | any, any>;

export enum LogLevel {
  None = 'none',
  Diff = 'diff',
  All = 'all',
}

interface IAddonsSettings {
  name?: string;
  logLevel?: LogLevel | string;
}

interface SetStateSettings {
  excludeFromLogs?: boolean | undefined;
  replace?: boolean | undefined;
}

type SetState<T extends State> = (
  partial: PartialState<T>,
  replace?: boolean
) => void;
type SetStateAddons<T extends State> = (
  partial: PartialState<T>,
  setSettings?: SetStateSettings
) => void;
declare type StateCreator<
  T extends State,
  CustomSetState = SetState<T> | SetStateAddons<T>
> = (set: CustomSetState, get: GetState<T>, api: StoreApi<T>) => T;

type SetStateExtraParam = boolean | undefined | SetStateSettings;

interface IAddons {
  computed?: TStateRecords;
  watchers?: TStateRecords;
  middleware?: Array<any>;
  settings?: IAddonsSettings;
}

function getDeps(fn: (state: State) => any) {
  const reg = new RegExp(/(?:this\.)(\w+)/g);
  const reg2 = new RegExp(/(?:this\[')(\w+)(?:'\])/g);
  const matches = Array.from(fn.toString().matchAll(reg)).map(
    match => match[1]
  );
  const matches2 = Array.from(fn.toString().matchAll(reg2)).map(
    match => match[1]
  );
  // @ts-ignore
  const mergedMatches = Array.from(new Set([...matches, ...matches2]));
  return mergedMatches;
}

function intersection(aArray: any[], bArray: any) {
  let intersections = [];
  for (let elem of bArray) {
    if (aArray.includes(elem)) {
      intersections.push(elem);
    }
  }
  return intersections;
}

export interface UseStore<T extends State> {
  (): T;
  <U>(
    selector: StateSelector<T, U> | string,
    equalityFn?: EqualityChecker<U>
  ): U;
  setState: SetState<T> | SetStateAddons<T>;
  getState: GetState<T>;
  subscribe: Subscribe<T>;
  destroy: Destroy;
}

export default function createStore<TState extends TStateRecords>(
  stateInitializer: StateCreator<TState>,
  addons?: IAddons
): UseStore<TState> {
  let _api: StoreApi<TState>;
  let _originalSetState: SetState<TState>;
  let _computed: TStateRecords = {};
  let updatedComputed: Record<string | number | symbol, any> = {};
  let _computedMerged: boolean = false;
  let _computedPropDependencies: TStateRecords = {};
  let _watchers: TStateRecords = {};
  let _settings: IAddonsSettings = {
    name: addons?.settings?.name ?? 'MyStore',
    logLevel: addons?.settings?.logLevel ?? LogLevel.None,
  };

  function attachMiddleWare(config: StateCreator<TState>) {
    return (
      set: SetState<TState>,
      get: GetState<TState>,
      api: StoreApi<TState>
    ) => {
      // Overwrites set method
      return config(
        (args: any, setSettings: SetStateExtraParam) => {
          return setMiddleware([args, setSettings], set);
        },
        get,
        api
      );
    };
  }

  // Overwrites setState method
  function setState(args: any, setSettings: SetStateExtraParam) {
    setMiddleware([args, setSettings], _originalSetState);
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

    let logOperations =
      (!excludeFromLogs ?? true) &&
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
        const needsRecompute = intersection(Object.keys(changes), compPropDeps);
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
      logOperations && console.log('Updating computed values', updatedComputed);
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
          unset(_watchers, watcherName); // @ttungbmt
        }
      }
    }

    set(newState, replaceState);

    for (const [propName, fn] of Object.entries(_watchers)) {
      let newVal = _get(newState, propName), currentVal = _get(currentState, propName)

      if(hasIn(newState, propName) && !isEqual(newVal, currentVal)){
        logOperations && console.log(`Triggering watcher: ${propName}`);
        fn.apply({ set: _api.setState, get: _api.getState, api: _api }, [
          newVal,
          currentVal
        ]);
      }
    }

    if (Object.keys(updatedComputed).length > 0 && !replaceState) {
      setMiddleware([updatedComputed, setSettings], _originalSetState, true);
    }

    logOperations &&
      (_settings.logLevel as string) === (LogLevel.All as string) &&
      !recursiveOp &&
      console.log('New State', _api.getState());

    logOperations && !recursiveOp && console.groupEnd();
  }

  const middlewareFunctions = (
    middleware:
      | Array<<TState extends TStateRecords>() => StateCreator<TState>>
      | undefined,
    store: StateCreator<TState>
  ) => (middleware ? flow(middleware)(store) : store);

  function configComputed(computed: TStateRecords) {
    let computedToAdd = {};
    for (const [key, value] of Object.entries(computed)) {
      const deps = getDeps(value);
      if (deps.length > 0) {
        _computedPropDependencies[key] = deps;
        _computed[key] = value;
      }
      computedToAdd = {
        ...computedToAdd,
        [key]: value.apply({ ..._api.getState(), ...computedToAdd }, [
          { set: _api.setState, get: _api.getState },
        ]),
      };
    }
    if (Object.keys(computedToAdd).length > 0) {
      _api.setState(computedToAdd);
    }

    _computedMerged = true;
  }

  function configWatchers(watchers: TStateRecords) {
    for (const [propName, fn] of Object.entries(watchers)) {
      _watchers[propName] = fn;
    }
  }

  function _stateCreator<TState extends State>(
    set: SetState<TState> | SetStateAddons<TState>,
    get: GetState<TState>,
    api: StoreApi<TState>
  ): TState {
    _api = api;
    _originalSetState = { ...api }.setState;
    _api.setState = setState;
    return {
      ...stateInitializer(
        set as SetState<TState> | SetStateAddons<TState>,
        get,
        api
      ),
    };
  }

  const hook = create(
    attachMiddleWare(middlewareFunctions(addons?.middleware, _stateCreator))
  );

  const stateHook: any = (selector: any, equalityFn?: any) => {
    if (typeof selector === 'string') {
      if (selector.indexOf(',') !== -1) {
        const props = selector.split(',').map(part => part.trim());
        return hook(state => props.map(prop => state[prop]), shallow);
      }
      return hook(state => state[selector], equalityFn);
    }
    return hook(selector, equalityFn);
  };

  // @ts-ignore
  Object.assign(stateHook, _api);

  configComputed(addons?.computed ?? {});
  configWatchers(addons?.watchers ?? {});

  return stateHook;
}
