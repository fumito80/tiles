import {
  HTMLElementEventType, Options, State, StoredElements,
} from './types';
import { $, $byClass, $byTag } from './client';
import {
  HeaderTabs, OpenTab, Tabs, Window, WindowHeader,
} from './tabs';
import { FormSearch } from './search';
import { HeaderHistory, History } from './history';
import { HeaderLeafs, Leaf, Leafs } from './bookmarks';
import { Folders } from './folders';

type Action<A extends keyof HTMLElementEventType, R extends any, S extends boolean> = {
  initValue?: R;
  target?: HTMLElement;
  eventType?: A;
  eventProcesser?: (e: HTMLElementEventType[A], value: R) => R;
  force?: S,
};

export function makeAction<
  U extends any, T extends keyof HTMLElementEventType = any, S extends boolean = false,
>(
  action: Action<T, U, S>,
) {
  return { force: false, ...action };
}

type ActionValue<T> = T extends Action<any, infer R, any> ? R : never;

type Actions<T> = {
  [K in keyof T]: T[K] extends Action<any, any, any> ? T : never;
}

function prefixedAction(name: string | number | symbol) {
  return `action-${name as string}`;
}

function makeActionValue<T>(value: T, forced = 0) {
  return { forced, value };
}

type ActionResult = ReturnType<typeof makeActionValue>;

export function registerActions<T extends Actions<any>>(actions: T) {
  const initPromises = Object.entries(actions).map(async ([name, {
    target, eventType, eventProcesser, initValue,
  }]) => {
    const actionName = prefixedAction(name);
    const actionValue = makeActionValue(initValue);
    const initPromise = new Promise<void>((resolve) => {
      chrome.storage.local.remove(actionName, () => {
        chrome.storage.local.set({ [actionName]: actionValue }, resolve);
      });
    });
    if (!target) {
      return initPromise;
    }
    const valueProcesser = eventProcesser || ((_: any, currentValue: any) => currentValue);
    target.addEventListener(eventType, (e: any) => {
      chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
        const newValue = valueProcesser(e, (currentValue as ActionResult).value);
        const forced = currentValue.forced + Number(actions[name].force);
        const actionNewValue = makeActionValue(newValue, forced);
        chrome.storage.local.set({ [actionName]: actionNewValue });
      });
    });
    return initPromise;
  });
  const initPromise = new Promise((resolve) => {
    Promise.all(initPromises).then(resolve);
  });
  return {
    subscribe<U extends keyof T, V extends ActionValue<T[U]>>(
      name: U,
      cb: (changes: { oldValue: V, newValue: V }) => void,
    ) {
      const actionName = prefixedAction(name);
      initPromise.then(() => {
        chrome.storage.onChanged.addListener(({ [actionName]: result }, areaName) => {
          if (!result || areaName !== 'local') {
            return;
          }
          const oldValue = (result.oldValue as ActionResult)?.value;
          const newValue = (result.newValue as ActionResult)?.value;
          cb({ oldValue, newValue } as { oldValue: V, newValue: V });
        });
      });
    },
    dispatch<U extends keyof T>(
      name: U,
      newValue?: ActionValue<T[U]>,
      force = false,
    ) {
      const actionName = prefixedAction(name);
      initPromise.then(() => {
        chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
          const forced = (currentValue?.forced || 0) + Number(force || newValue === undefined);
          const actionNewValue = makeActionValue(newValue, forced);
          chrome.storage.local.set({ [actionName]: actionNewValue });
        });
      });
    },
    getState<U extends keyof T, V extends ActionValue<T[U]>>(name: U, cb: (value: V) => void) {
      const actionName = prefixedAction(name);
      chrome.storage.local.get(actionName, ({ [actionName]: { value } }) => cb(value));
    },
  };
}

export function initComponents(
  compos: StoredElements,
  options: Options,
  settings: State['settings'],
  htmlHistory: string,
) {
  // Template
  const $template = $byTag<HTMLTemplateElement>('template').content;
  const $tmplOpenTab = $('open-tab', $template) as OpenTab;
  const $tmplWindow = $('open-window', $template) as Window;
  // Define component (Custom element)
  const $formSearch = $byClass('form-query') as FormSearch;
  const $tabs = compos['body-tabs'];
  const $leafs = compos['body-leafs'];
  const $folders = compos['body-folders'];
  const $headerLeafs = compos['header-leafs'];
  const $headerTabs = compos['header-tabs'];
  const $headerHistory = compos['header-history'];
  const $history = compos['body-history'];
  // Initialize component
  $leafs.init(options);
  $folders.init(options);
  $tabs.init($tmplOpenTab, $tmplWindow, options.collapseTabs);
  $headerLeafs.init();
  $headerTabs.init(options.collapseTabs);
  $history.init(options, htmlHistory);
  $formSearch.init([$leafs, $tabs, $history], settings.includeUrl, options);
  // Register actions
  const actions = {
    ...$headerTabs.provideActions(),
    ...$tabs.provideActions(),
    ...$formSearch.provideActions(),
    ...$history.provideActions(),
    ...$headerHistory.provideActions(),
  };
  const store = registerActions(actions);
  // Coonect store
  $headerLeafs.connect(store);
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

export interface IPublishElement {
  provideActions(): Actions<any>;
}

export interface ISubscribeElement {
  connect(store: Store): void;
}

export interface IPubSubElement extends IPublishElement {
  connect(store: Store): void;
}

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
customElements.define('bm-leaf', Leaf, { extends: 'div' });
