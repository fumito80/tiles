import { Model, Options } from './types';
import { HeaderTabs, Tabs } from './tabs';

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
  Object.entries(actions).forEach(([name, {
    target, eventType, eventProcesser, initValue,
  }]) => {
    const actionName = prefixedAction(name);
    chrome.storage.local.remove(actionName, () => {
      chrome.storage.local.set({ [actionName]: initValue ?? null });
    });
    const valueProcesser = eventProcesser || ((_: any, currentValue: any) => currentValue);
    if (!target) {
      chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
        const newValue = valueProcesser(null, currentValue);
        chrome.storage.local.set({ [actionName]: newValue });
      });
      return;
    }
    target.addEventListener(eventType, (e: any) => {
      chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
        const newValue = valueProcesser(e, currentValue);
        chrome.storage.local.set({ [actionName]: newValue });
      });
    });
  });
  return {
    subscribe<U extends keyof T, V extends ActionValue<T[U]>>(
      name: U,
      cb: (changes: { oldValue: V, newValue: V }) => void,
    ) {
      chrome.storage.onChanged.addListener(({ [prefixedAction(name)]: result }, areaName) => {
        if (areaName !== 'local' || result === undefined) {
          return;
        }
        cb(result as { oldValue: V, newValue: V });
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
          chrome.storage.local.set({ [actionName]: newValue ?? null });
        });
        return;
      }
      chrome.storage.local.set({ [actionName]: newValue ?? null });
    },
  };
}

export function initStore(compos: Model, options: Options) {
  const headerTabs = compos['header-tabs'] as HeaderTabs;
  const tabs = compos['body-tabs'] as Tabs;
  headerTabs.init(options.collapseTabs);
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
