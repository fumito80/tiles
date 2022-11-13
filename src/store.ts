import {
  EventListenerOptions,
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
  U extends EventListenerOptions,
  V extends boolean = false,
> = {
  initValue?: R;
  target?: HTMLElement;
  eventType?: A;
  eventProcesser?: (e: HTMLElementEventType[A], value: R) => R;
  force?: S,
  persistent?: T,
  listenerOptions?: U,
  eventOnly?: V,
};

export function makeAction<
  U extends any,
  T extends keyof HTMLElementEventType = any,
  S extends boolean = false,
  V extends boolean = false,
  W extends EventListenerOptions = any,
  X extends boolean = false,
>(
  action: Action<T, U, S, V, W, X>,
) {
  return { force: false, persistent: false, ...action };
}

type ActionValue<T> = T extends Action<any, infer R, any, any, any, any> ? R : never;

type ActionEventType<T> = T extends Action<infer R, any, any, any, any, any> ? R : never;

type ActionEventOnly<T> = T extends Action<any, any, any, any, any, infer R> ? R : never;

type Actions<T> = {
  [K in keyof T]: T[K] extends Action<any, any, any, any, any, any> ? T : never;
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
    target, eventType, eventProcesser, initValue, persistent, listenerOptions, eventOnly,
  }]) => {
    const actionName = prefixedAction(name);
    if (target) {
      const valueProcesser = eventProcesser || ((_: any, currentValue: any) => currentValue);
      target.addEventListener(eventType, async (e: any) => {
        if (eventOnly) {
          const states = await chrome.storage.session.get().then(
            (values) => Object.entries(values).reduce(
              (acc, [key, { value }]) => ({ ...acc, [getActionName(key)]: value }),
              {},
            ),
          );
          subscribers[actionName]?.forEach((cb) => cb(undefined, undefined, e, states));
          return;
        }
        chrome.storage.session.get(actionName, ({ [actionName]: currentValue }) => {
          const newValue = valueProcesser(e, (currentValue as ActionResult).value);
          const forced = currentValue.forced + Number(actions[name].force);
          const actionNewValue = makeActionValue(newValue, forced);
          chrome.storage.session.set({ [actionName]: actionNewValue });
        });
      }, listenerOptions);
    }
    return new Promise<{ [key: string]: { persistent: boolean, eventOnly: boolean } }>(
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
            resolve({ [actionName]: { persistent, eventOnly } });
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
        const { persistent, eventOnly } = persistentsAction[actionName];
        if (eventOnly) {
          return;
        }
        const oldValue = (changes.oldValue as ActionResult)?.value;
        const newValue = (changes.newValue as ActionResult)?.value;
        if (persistent) {
          chrome.storage.local.set({ [actionName]: newValue });
        }
        subscribers[actionName]?.forEach((cb) => cb({ oldValue, newValue }));
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
    subscribe<
      U extends keyof T,
      V extends ActionValue<T[U]>,
      W extends ActionEventType<T[U]>,
      X extends ActionEventOnly<T[U]>,
    >(
      name: U,
      cb: (
        changes: { oldValue: V, newValue: V },
        isInit: boolean,
        e: W extends keyof HTMLElementEventType ? HTMLElementEventType[W] : never,
        states: X extends true ? { [key in keyof T]: T[key]['initValue'] } : never,
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
    getState<U extends keyof T, V extends ActionValue<T[U]>>(name: U, cb?: (value: V) => void) {
      const actionName = prefixedAction(name);
      return new Promise((resolve) => {
        chrome.storage.session.get(actionName, ({ [actionName]: { value } }) => {
          if (cb) {
            cb(value);
          }
          resolve(value);
        });
      });
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
  $headerLeafs.connect(store);
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
