import {
  EventListenerOptions,
  HTMLElementEventType, MyHistoryItem, Options, PromiseInitTabs, State, StoredElements,
} from './types';
import { $, $byClass, $byTag } from './client';
import { OpenTab, Window } from './tabs';
import { FormSearch } from './search';
import DragAndDropEvents from './drag-drop';
import { MultiSelPane } from './multi-sel-pane';
import { IPubSubElement, ISubscribeElement } from './popup';

type Action<
  A extends keyof HTMLElementEventType,
  R extends any,
  S extends boolean,
  T extends boolean,
  U extends EventListenerOptions,
  V extends boolean = false,
  W extends boolean = false,
> = {
  initValue?: R;
  target?: HTMLElement;
  eventType?: A;
  eventProcesser?: (e: HTMLElementEventType[A], value: R) => R;
  force?: S,
  persistent?: T,
  listenerOptions?: U,
  eventOnly?: V,
  noStates?: W,
};

export function makeAction<
  U extends any,
  T extends keyof HTMLElementEventType = any,
  S extends boolean = false,
  V extends boolean = false,
  W extends EventListenerOptions = any,
  X extends boolean = false,
  Y extends boolean = false,
>(
  action: Action<T, U, S, V, W, X, Y> = {},
) {
  return {
    force: false, persistent: false, noStates: false, ...action,
  };
}

export type ActionValue<T> = T extends Action<any, infer R, any, any, any, any, any> ? R : never;

type ActionEventType<T> = T extends Action<infer R, any, any, any, any, any, any> ? R : never;

type Actions<T> = {
  [K in keyof T]: T[K] extends Action<any, any, any, any, any, any, any> ? T : never;
}

const actionPrefix = 'action-';

function prefixedAction(name: string | number | symbol) {
  return actionPrefix + (name as string);
}

function getActionName(prefixedActionName: string) {
  const [, actionName] = prefixedActionName.split(actionPrefix);
  return actionName;
}

function makeActionValue<T>(value: T, forced = 0) {
  return { forced, value };
}

function dispatch(name: string | number | symbol, newValue: any, force = false) {
  const actionName = prefixedAction(name);
  chrome.storage.session.get(actionName, ({ [actionName]: currentValue }) => {
    const forced = (currentValue?.forced || 0) + Number(force || newValue === undefined);
    const actionNewValue = makeActionValue(newValue, forced);
    chrome.storage.session.set({ [actionName]: actionNewValue });
  });
}

async function getStates(name?: string | number | symbol, cb: (a: any) => void = (a) => a) {
  const actionName = name ? prefixedAction(name as string) : undefined;
  return chrome.storage.session.get(actionName)
    .then((values) => {
      if (actionName) {
        const { [actionName]: { value } } = values;
        return value;
      }
      return Object.entries(values).reduce(
        (acc, [key, { value }]) => ({ ...acc, [getActionName(key)]: value }),
        {},
      );
    })
    .then(cb);
}

type ActionResult = ReturnType<typeof makeActionValue>;

export function registerActions<T extends Actions<any>>(actions: T, options: Options) {
  const subscribers = {} as { [actionName: string]: Function[] };
  const initPromises = Object.entries(actions)
    .filter(([name]) => {
      if (!options.bmAutoFindTabs || !options.findTabsFirst) {
        return !['mouseoverLeafs', 'mouseoutLeafs', 'mouseoverFolders', 'mouseoutFolders'].includes(name);
      }
      return true;
    })
    .map(([name, {
      target, eventType, eventProcesser, initValue,
      persistent, listenerOptions, eventOnly, noStates,
    }]) => {
      const actionName = prefixedAction(name);
      if (target) {
        const valueProcesser = eventProcesser || ((_: any, currentValue: any) => currentValue);
        target.addEventListener(eventType, async (e: any) => {
          if (eventOnly) {
            const states = noStates ? undefined : await getStates();
            subscribers[actionName]?.forEach(
              (cb) => cb(undefined, e, states, { getStates, dispatch }),
            );
            return true;
          }
          chrome.storage.session.get(actionName, ({ [actionName]: currentValue }) => {
            const newValue = valueProcesser(e, (currentValue as ActionResult).value);
            const forced = currentValue.forced + Number(actions[name].force);
            const actionNewValue = makeActionValue(newValue, forced);
            chrome.storage.session.set({ [actionName]: actionNewValue });
          });
          return true;
        }, listenerOptions);
      }
      return new Promise<
        { [key: string]: { persistent: boolean, eventOnly: boolean, noStates: boolean } }
      >(
        (resolve) => {
          chrome.storage.session.remove(actionName, () => {
            if (persistent) {
              chrome.storage.local.get(actionName, ({ [actionName]: value }) => {
                const actionValue = makeActionValue(value ?? initValue);
                chrome.storage.session.set({ [actionName]: actionValue }, () => {
                  setTimeout(
                    () => resolve({ [actionName]: { persistent, eventOnly, noStates } }),
                    0,
                  );
                });
              });
              return;
            }
            const actionValue = makeActionValue(initValue);
            chrome.storage.session.set({ [actionName]: actionValue }, () => {
              resolve({ [actionName]: { persistent, eventOnly, noStates } });
            });
          });
        },
      );
    });
  type StoreActions = typeof actions;
  type ActionNames = keyof StoreActions;
  type InitValue<X extends ActionNames> = ActionValue<StoreActions[X]>;
  type Changes<X extends ActionNames> = {
    newValue: InitValue<X>, oldValue: InitValue<X>, isInit: boolean
  };
  const initPromise = Promise.all(initPromises).then(async (actionProps) => {
    const persistentsAction = actionProps
      .reduce((acc, currentValue) => ({ ...acc, ...currentValue }), {});
    chrome.storage.onChanged.addListener((storage, areaName) => {
      if (areaName !== 'session') {
        return;
      }
      Object.entries(storage).forEach(async ([actionName, changes]) => {
        const { persistent, eventOnly, noStates } = persistentsAction[actionName];
        if (eventOnly) {
          return;
        }
        const oldValue = (changes.oldValue as ActionResult)?.value;
        const newValue = (changes.newValue as ActionResult)?.value;
        if (persistent) {
          chrome.storage.local.set({ [actionName]: newValue });
        }
        const states = noStates ? undefined : await getStates();
        subscribers[actionName]?.forEach(
          (cb) => cb(
            { oldValue, newValue },
            undefined,
            states,
            { getStates, dispatch },
          ),
        );
      });
    });
    const states = await getStates();
    Object.entries(actions)
      .filter(([, { persistent }]) => persistent)
      .map(async ([name]) => {
        const actionName = prefixedAction(name);
        chrome.storage.session.get(actionName)
          .then(({ [actionName]: { value } }) => {
            subscribers[actionName]?.forEach(
              (cb) => cb(
                { oldValue: null, newValue: value, isInit: true },
                undefined,
                states,
                { getStates, dispatch },
              ),
            );
          });
      });
  });
  return {
    actions,
    subscribe<
      U extends keyof T,
      V extends ActionValue<T[U]>,
      W extends ActionEventType<T[U]>,
    >(
      name: U,
      cb: (
        changes: { oldValue: V, newValue: V, isInit: boolean },
        e: W extends keyof HTMLElementEventType ? HTMLElementEventType[W] : never,
        states: { [key in keyof T]: T[key]['initValue'] },
        store: {
          getStates: <X extends keyof T | undefined = undefined>(
            stateName?: X,
            cbState?: (value: X extends keyof T ? ActionValue<T[X]> : never) => void,
          ) => X extends keyof T? Promise<ActionValue<T[X]>> : Promise<{ [key in keyof T]: T[key]['initValue'] }>,
          dispatch: <Y extends keyof T>(
            dispatchName: Y, newValue?: ActionValue<T[Y]>, force?: boolean,
          ) => void,
        },
      ) => void,
    ) {
      const actionName = prefixedAction(name);
      subscribers[actionName] = [...(subscribers[actionName] || []), cb];
    },
    dispatch<U extends keyof T>(
      name: U,
      newValue?: ActionValue<T[U]>,
      force = false,
    ) {
      initPromise.then(() => dispatch(name, newValue, force));
    },
    getStates<U extends keyof T | undefined = undefined>(
      name?: U,
      cb?: (value: U extends keyof T ? ActionValue<T[U]> : never) => void,
    ): U extends keyof T ? Promise<ActionValue<T[U]>> : Promise<{ [key in keyof T]: T[key]['initValue'] }> {
      return getStates(name, cb) as any;
    },
    // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-unused-vars
    context<A extends IPubSubElement>(source: A) {
      const map = <B extends keyof ReturnType<A['actions']>>(
        actionName: B,
        ...subscribeMethods: ((
          changes: Changes<B>,
          e: HTMLElementEventType[ActionEventType<ReturnType<A['actions']>[B]>],
          states: { [key in keyof T]: T[key]['initValue'] },
          store: {
            getStates: <X extends keyof T | undefined = undefined>(
              stateName?: X,
              cbState?: (value: X extends keyof T ? ActionValue<T[X]> : never) => void,
            ) => X extends keyof T? Promise<ActionValue<T[X]>> : Promise<{ [key in keyof T]: T[key]['initValue'] }>,
            dispatch: <Y extends keyof T>(
              dispatchName: Y, newValue?: ActionValue<T[Y]>, force?: boolean,
            ) => void,
          },
        ) => any)[]
      ) => {
        subscribeMethods.forEach(
          (subscribeMethod) => this.subscribe(actionName, subscribeMethod.bind(source)),
        );
        return { map };
      };
      return { map };
    },
    // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-unused-vars
    actionContext<A extends IPublishElement, B extends keyof ReturnType<A['actions']>>(source: A, actionName: B) {
      const map = (
        ...subscribeMethods: ((
          changes: Changes<B>,
          e: HTMLElementEventType[ActionEventType<ReturnType<A['actions']>[B]>],
          states: { [key in keyof T]: T[key]['initValue'] },
          store: {
            getStates: <X extends keyof T | undefined = undefined>(
              stateName?: X,
              cbState?: (value: X extends keyof T ? ActionValue<T[X]> : never) => void,
            ) => X extends keyof T? Promise<ActionValue<T[X]>> : Promise<{ [key in keyof T]: T[key]['initValue'] }>,
            dispatch: <Y extends keyof T>(
              dispatchName: Y, newValue?: ActionValue<T[Y]>, force?: boolean,
            ) => void,
          },
        ) => any)[]
      ) => {
        subscribeMethods.forEach(
          (subscribeMethod) => this.subscribe(actionName, subscribeMethod),
        );
      };
      return { map };
    },
    subscribeContext(source?: ISubscribeElement) {
      // eslint-disable-next-line no-use-before-define
      const map = <A extends IPublishElement | IPubSubElement, B extends keyof ReturnType<A['actions']>>(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        [srcElement, actionName]: [A, B],
        ...subscribeMethods: ((
          changes: Changes<B>,
          e: HTMLElementEventType[ActionEventType<ReturnType<A['actions']>[B]>],
          states: { [key in keyof T]: T[key]['initValue'] },
          store: {
            getStates: <X extends keyof T | undefined = undefined>(
              stateName?: X,
              cbState?: (value: X extends keyof T ? ActionValue<T[X]> : never) => void,
            ) => X extends keyof T? Promise<ActionValue<T[X]>> : Promise<{ [key in keyof T]: T[key]['initValue'] }>,
            dispatch: <Y extends keyof T>(
              dispatchName: Y, newValue?: ActionValue<T[Y]>, force?: boolean,
            ) => void,
          },
        ) => any)[]
      ) => {
        subscribeMethods.forEach(
          (subscribeMethod) => this.subscribe(actionName, subscribeMethod.bind(source)),
        );
        return { map };
      };
      return { map };
    },
  };
}

export function initComponents(
  compos: StoredElements,
  options: Options,
  settings: State['settings'],
  htmlHistory: string,
  promiseInitTabs: PromiseInitTabs,
  promiseInitHistory: Promise<MyHistoryItem[]>,
  lastSearchWord: string,
  isSearching: boolean,
) {
  // Template
  const $template = $byTag<HTMLTemplateElement>('template').content;
  const $tmplOpenTab = $('open-tab', $template) as OpenTab;
  const $tmplWindow = $('open-window', $template) as Window;
  const $tmplMultiSelPane = $('multi-sel-pane', $template) as MultiSelPane;
  // Define component (Custom element)
  const $formSearch = $byClass('form-query') as FormSearch;
  const $appMain = compos['app-main'];
  const $tabs = compos['body-tabs'];
  const $leafs = compos['body-leafs'];
  const $folders = compos['body-folders'];
  const $headerLeafs = compos['header-leafs'];
  const $headerTabs = compos['header-tabs'];
  const $headerHistory = compos['header-history'];
  const $history = compos['body-history'];
  // Initialize component
  const dragAndDropEvents = new DragAndDropEvents($appMain);
  $tabs.init(
    $tmplOpenTab,
    $tmplWindow,
    options,
    isSearching,
    promiseInitTabs,
    settings.windowOrderAsc,
  );
  $leafs.init(options);
  $folders.init(options);
  $headerLeafs.init(settings, $tmplMultiSelPane, options);
  $headerTabs.init(settings, $tmplMultiSelPane, options.collapseTabs);
  $headerHistory.init(settings, $tmplMultiSelPane);
  $history.init(promiseInitHistory, options, htmlHistory, isSearching);
  $formSearch.init([$leafs, $tabs, $history], settings.includeUrl, options, lastSearchWord);
  return {
    // store,
    $appMain,
    $leafs,
    $headerLeafs,
    $folders,
    $headerTabs,
    $tabs,
    $formSearch,
    $history,
    $headerHistory,
    dragAndDropEvents,
  };
}

export interface IPublishElement {
  actions(): Actions<any>;
}
