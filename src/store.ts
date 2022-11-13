import {
  HTMLElementEventType, MyHistoryItem, Options, PromiseInitTabs, State, StoredElements,
} from './types';
import { $, $byClass, $byTag } from './client';
import {
  HeaderTabs, OpenTab, Tabs, Window, WindowHeader,
} from './tabs';
import { FormSearch } from './search';
import { HeaderHistory, History } from './history';
import { HeaderLeafs, Leaf, Leafs } from './bookmarks';
import { Folders } from './folders';
import { AppMain } from './app-main';

type Action<
  A extends keyof HTMLElementEventType,
  R extends any,
  S extends boolean,
  T extends boolean,
  U extends boolean,
> = {
  initValue?: R;
  target?: HTMLElement;
  eventType?: A;
  eventProcesser?: (e: HTMLElementEventType[A], value: R) => R;
  force?: S,
  persistent?: T,
  needState?: U,
};

export function makeAction<
  U extends any,
  T extends keyof HTMLElementEventType = any,
  S extends boolean = false,
  V extends boolean = false,
  W extends boolean = false,
>(
  action: Action<T, U, S, V, W>,
) {
  return { force: false, persistent: false, ...action };
}

type ActionValue<T> = T extends Action<any, infer R, any, any, any> ? R : never;

type Actions<T> = {
  [K in keyof T]: T[K] extends Action<any, any, any, any, any> ? T : never;
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

type ActionResult = ReturnType<typeof makeActionValue>;

export function registerActions<T extends Actions<any>>(actions: T) {
  const subscribers = {} as { [actionName: string]: Function[] };
  const initPromises = Object.entries(actions).map(([name, {
    target, eventType, eventProcesser, initValue, persistent, needState,
  }]) => {
    const actionName = prefixedAction(name);
    if (target) {
      const valueProcesser = eventProcesser || ((_: any, currentValue: any) => currentValue);
      target.addEventListener(eventType, (e: any) => {
        chrome.storage.session.get(actionName, ({ [actionName]: currentValue }) => {
          const newValue = valueProcesser(e, (currentValue as ActionResult).value);
          const forced = currentValue.forced + Number(actions[name].force);
          const actionNewValue = makeActionValue(newValue, forced);
          chrome.storage.session.set({ [actionName]: actionNewValue });
        });
      });
    }
    return new Promise<{ [key: string]: { persistent: boolean, needState: boolean } }>(
      (resolve) => {
        chrome.storage.session.remove(actionName, () => {
          if (persistent) {
            chrome.storage.local.get(actionName, ({ [actionName]: value }) => {
              const actionValue = makeActionValue(value ?? initValue);
              chrome.storage.session.set({ [actionName]: actionValue }, () => {
                setTimeout(() => resolve({ [actionName]: persistent }), 0);
              });
            });
            return;
          }
          const actionValue = makeActionValue(initValue);
          chrome.storage.session.set({ [actionName]: actionValue }, () => {
            resolve({ [actionName]: { persistent, needState } });
          });
        });
      },
    );
  });
  const initPromise = Promise.all(initPromises).then((actionProps) => {
    const persistentsAction = actionProps
      .reduce((acc, currentValue) => ({ ...acc, ...currentValue }), {});
    chrome.storage.onChanged.addListener((storage, areaName) => {
      if (areaName !== 'session') {
        return;
      }
      Object.entries(storage).forEach(async ([actionName, changes]) => {
        const oldValue = (changes.oldValue as ActionResult)?.value;
        const newValue = (changes.newValue as ActionResult)?.value;
        const { persistent, needState } = persistentsAction[actionName];
        if (persistent) {
          chrome.storage.local.set({ [actionName]: newValue });
        }
        let states = {};
        if (needState) {
          states = await chrome.storage.session.get().then(
            (values) => Object.entries(values).reduce((acc, [key, { value }]) => {
              const name = getActionName(key);
              return { ...acc, [name]: value };
            }, {}),
          );
        }
        subscribers[actionName]?.forEach((cb) => cb({ oldValue, newValue, states }));
      });
    });
    Object.entries(actions)
      .filter(([, { persistent }]) => persistent)
      .map(async ([name]) => {
        const actionName = prefixedAction(name);
        chrome.storage.session.get(actionName, ({ [actionName]: { value } }) => {
          subscribers[actionName]?.forEach((cb) => cb({ oldValue: null, newValue: value }, true));
        });
      });
  });
  return {
    subscribe<U extends keyof T, V extends ActionValue<T[U]>>(
      name: U,
      cb: (
        changes: { oldValue: V, newValue: V, states: { [key in keyof T]: T[key]['initValue'] } },
        isInit: boolean,
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
      const actionName = prefixedAction(name);
      initPromise.then(() => {
        chrome.storage.session.get(actionName, ({ [actionName]: currentValue }) => {
          const forced = (currentValue?.forced || 0) + Number(force || newValue === undefined);
          const actionNewValue = makeActionValue(newValue, forced);
          chrome.storage.session.set({ [actionName]: actionNewValue });
        });
      });
    },
    getState<U extends keyof T, V extends ActionValue<T[U]>>(name: U, cb: (value: V) => void) {
      const actionName = prefixedAction(name);
      chrome.storage.session.get(actionName, ({ [actionName]: { value } }) => cb(value));
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
  $tabs.init(
    $tmplOpenTab,
    $tmplWindow,
    options.collapseTabs,
    isSearching,
    promiseInitTabs,
  );
  $leafs.init(options);
  $folders.init(options);
  $headerLeafs.init(settings);
  $headerTabs.init(settings, options.collapseTabs);
  $headerHistory.init(settings);
  $history.init(promiseInitHistory, options, htmlHistory, isSearching);
  $formSearch.init([$leafs, $tabs, $history], settings.includeUrl, options, lastSearchWord);
  // Register actions
  const actions = {
    ...$leafs.actions(),
    ...$headerLeafs.actions(),
    ...$headerTabs.actions(),
    ...$tabs.actions(),
    ...$formSearch.actions(),
    ...$history.actions(),
    ...$headerHistory.actions(),
  };
  const store = registerActions(actions);
  // Coonect store
  $appMain.connect(store);
  $leafs.connect(store);
  $folders.connect(store);
  $headerTabs.connect(store);
  $tabs.connect(store);
  $headerHistory.connect(store);
  $history.connect(store);
  $formSearch.connect(store);
  // v-scroll initialize
  store.dispatch('resetHistory', { initialize: true });
  return store;
}

export type Store = ReturnType<typeof initComponents>;
export type StoreStates = Parameters<Parameters<Store['subscribe']>[1]>[0]['states'];
// type Head<U> = U extends [any, ...any[]]
//   ? ((...args: U) => any) extends (head: infer H, ...args: any) => any
//     ? H
//     : never
//   : never;

// type Second<U> = U extends [any, ...any[]]
//   ? ((...args: U) => any) extends (head: any, second: infer H, ...args: any) => any
//     ? H
//     : never
//   : never;

// // export type StoreStates = Parameters<Parameters<Store['subscribe']>[1]>[0]['states'];

// type DeepPath<T extends any[]> = {
//   0: never,
//   1: T[1],
// };

// const test = [1, 's'] as [number, string];

// type Test = Head<typeof test>;
// type Test2 = (typeof test)[1];

// const w: Test = '1';

export interface IPublishElement {
  actions(): Actions<any>;
}

export interface ISubscribeElement {
  connect(store: Store): void;
}

export interface IPubSubElement extends IPublishElement {
  connect(store: Store): void;
}

customElements.define('app-main', AppMain);
customElements.define('header-leafs', HeaderLeafs, { extends: 'div' });
customElements.define('body-leafs', Leafs, { extends: 'div' });
customElements.define('body-folders', Folders, { extends: 'div' });
customElements.define('open-tab', OpenTab);
customElements.define('open-window', Window);
customElements.define('window-header', WindowHeader);
customElements.define('body-tabs', Tabs, { extends: 'div' });
customElements.define('header-tabs', HeaderTabs, { extends: 'div' });
customElements.define('form-search', FormSearch, { extends: 'form' });
customElements.define('body-history', History, { extends: 'div' });
customElements.define('header-history', HeaderHistory, { extends: 'div' });
customElements.define('bm-leaf', Leaf);
