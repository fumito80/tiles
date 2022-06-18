import { Options, storedElements } from './types';
import { OpenTab, Window } from './tabs';
import { $, $byTag } from './client';

// eslint-disable-next-line no-undef
type Action<A extends keyof HTMLElementEventMap, R extends any> = {
  initValue?: R;
  target?: HTMLElement;
  eventType?: A;
  // eslint-disable-next-line no-undef
  eventProcesser?: (e: HTMLElementEventMap[A], value: R) => R;
};

// eslint-disable-next-line no-undef
export function makeAction<U extends any, T extends keyof HTMLElementEventMap>(
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

export function registerActions<T extends Actions<any>>(actions: T) {
  let initPromise: Promise<void> | null = null;
  Object.entries(actions).forEach(async ([name, {
    target, eventType, eventProcesser, initValue,
  }]) => {
    const actionName = prefixedAction(name);
    initPromise = new Promise((resolve) => {
      chrome.storage.local.remove(actionName, () => {
        chrome.storage.local.set({ [actionName]: initValue ?? null }, resolve);
      });
    });
    if (!target) {
      return;
    }
    const valueProcesser = eventProcesser || ((_: any, currentValue: any) => currentValue);
    target.addEventListener(eventType, (e: any) => {
      chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
        const newValue = valueProcesser(e, currentValue);
        chrome.storage.local.set({ [actionName]: newValue || null });
      });
    });
  });
  return {
    subscribe<U extends keyof T, V extends ActionValue<T[U]>>(
      name: U,
      cb: (changes: { oldValue: V, newValue: V }) => void,
    ) {
      initPromise!.then(() => {
        chrome.storage.onChanged.addListener(({ [prefixedAction(name)]: result }, areaName) => {
          if (areaName !== 'local' || result === undefined) {
            return;
          }
          cb(result as { oldValue: V, newValue: V });
        });
      });
    },
    dispatch<U extends keyof T>(
      name: U,
      newValue: ActionValue<T[U]>,
      force = false,
    ) {
      const actionName = prefixedAction(name);
      if (force) {
        chrome.storage.local.remove(actionName, () => {
          chrome.storage.local.set({ [actionName]: newValue || null });
        });
        return;
      }
      chrome.storage.local.set({ [actionName]: newValue || null });
    },
  };
}

export function initStore(compos: storedElements, options: Options) {
  const $template = $byTag<HTMLTemplateElement>('template').content;
  const headerTabs = compos['header-tabs'];
  const tabs = compos['body-tabs'];
  headerTabs.init(options.collapseTabs);
  const $tmplOpenTab = $('open-tab', $template) as OpenTab;
  const $tmplWindow = $('open-window', $template) as Window;
  tabs.init($tmplOpenTab, $tmplWindow, options.collapseTabs);
  const headerTabsActions = headerTabs.provideActions();
  const tabsActions = tabs.provideActions();
  const actions = { ...headerTabsActions, ...tabsActions };
  const store = registerActions(actions);
  headerTabs.connect(store);
  tabs.connect(store);
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
