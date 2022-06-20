import { Options, State, storedElements } from './types';
import { OpenTab, Window } from './tabs';
import { $, $byClass, $byTag } from './client';
import { FormSearch } from './search';

// eslint-disable-next-line no-undef
type Action<A extends keyof HTMLElementEventMap, R extends any> = {
  initValue?: R;
  target?: HTMLElement;
  eventType?: A;
  // eslint-disable-next-line no-undef
  eventProcesser?: (e: HTMLElementEventMap[A], value: R) => R;
};

// eslint-disable-next-line no-undef
export function makeAction<U extends any, T extends keyof HTMLElementEventMap = any>(
  action: Action<T, U>,
) {
  return action;
}

type ActionValue<T> = T extends Action<any, infer R> ? R : never;

type Actions<T> = {
  [K in keyof T]: T[K] extends Action<any, any> ? T : never;
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
        const actionNewValue = makeActionValue(newValue, currentValue.forced);
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
      initPromise.then(() => {
        chrome.storage.onChanged.addListener(({ [prefixedAction(name)]: result }, areaName) => {
          if (!result || areaName !== 'local') {
            return;
          }
          const oldValue = (result.oldValue as ActionResult).value;
          const newValue = (result.newValue as ActionResult).value;
          cb({ oldValue, newValue } as { oldValue: V, newValue: V });
        });
      });
    },
    dispatch<U extends keyof T>(
      name: U,
      newValue: ActionValue<T[U]>,
      force = false,
    ) {
      const actionName = prefixedAction(name);
      chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
        const actionNewValue = makeActionValue(newValue, currentValue.forced + Number(force));
        chrome.storage.local.set({ [actionName]: actionNewValue });
      });
    },
  };
}

export function initStore(compos: storedElements, options: Options, settings: State['settings']) {
  // Initialize component (Custom element)
  const $template = $byTag<HTMLTemplateElement>('template').content;
  const $headerTabs = compos['header-tabs'];
  const $tabs = compos['body-tabs'];
  $headerTabs.init(options.collapseTabs);
  const $tmplOpenTab = $('open-tab', $template) as OpenTab;
  const $tmplWindow = $('open-window', $template) as Window;
  $tabs.init($tmplOpenTab, $tmplWindow, options.collapseTabs);
  const $headerHistory = compos['header-history'];
  const $history = compos['body-history'];
  $history.init(options);
  const $formSearch = $byClass('form-query') as FormSearch;
  $formSearch.init(settings.includeUrl, options.exclusiveOpenBmFolderTree);
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
  $headerTabs.connect(store);
  $tabs.connect(store);
  $headerHistory.connect(store);
  $history.connect(store);
  $formSearch.connect(store);
  return store;
}

export type Store = ReturnType<typeof initStore>;

export interface IPublishElement {
  provideActions(): Actions<any>;
}

export interface ISubscribeElement {
  connect(store: Store): void;
}

export interface IPubSubElement extends IPublishElement {
  connect(store: Store): void;
}
