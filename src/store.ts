import { Model, Options } from './types';
import { HeaderTabs } from './tabs';

// eslint-disable-next-line no-undef
export type Action<A extends keyof HTMLElementEventMap, R> = {
  initValue?: R;
  target: HTMLElement;
  eventType: A;
  // eslint-disable-next-line no-undef
  valueProcesser: (e: HTMLElementEventMap[A], currentValue: R) => R;
};

// eslint-disable-next-line no-undef
export type Actions<T extends keyof HTMLElementEventMap = any, U = any> = {
  [name: string]: Action<T, U>;
}

function preFixAction(name: string | number | symbol) {
  return `action-${name as string}`;
}

export function registerEvents<T extends Actions>(
  actions: T,
) {
  Object.entries(actions).forEach(([name, {
    target, eventType, valueProcesser, initValue,
  }]) => {
    const actionName = preFixAction(name);
    chrome.storage.local.set({ [actionName]: initValue });
    target.addEventListener(eventType, (e) => {
      chrome.storage.local.get(actionName, ({ [actionName]: currentValue }) => {
        const newValue = valueProcesser(e, currentValue);
        chrome.storage.local.set({ [actionName]: newValue });
      });
    });
  });
  return {
    subscribe(
      name: keyof typeof actions,
      cb: (changes: chrome.storage.StorageChange) => void,
    ) {
      chrome.storage.onChanged.addListener(({ [preFixAction(name)]: result }, areaName) => {
        if (areaName !== 'local' || result === undefined) {
          return;
        }
        cb(result);
      });
    },
    dispatch(name: keyof typeof actions, value: any) {
      chrome.storage.local.set({ [preFixAction(name)]: value });
    },
  };
}

// eslint-disable-next-line no-undef
export function makeAction<T extends keyof HTMLElementEventMap, U>(action: Action<T, U>) {
  return action;
}

// const store = registerEvents({
//   test: makeAction({
//     initValue: true,
//     srcElement: $('test'),
//     action: 'click',
//     valueProcesser: (e, currentValue) => (e.target as HTMLInputElement).value,
//   }),
// });

// store.subscribe('test', ({ oldValue, newValue }) => console.log(oldValue, newValue));
// store.dispatch('test', 1);

export function initStore(panes: Model, options: Options) {
  const headerTabs = panes['header-tabs'] as HeaderTabs;
  headerTabs.init(options.collapseTabs);
  const store = registerEvents(headerTabs.provideActions());
  headerTabs.setStore(store);
  return store;
}

export type Store = ReturnType<typeof initStore>;

export interface IPublishElement {
  provideActions(): Actions;
}

export interface ISubscribeElement {
  setStore(store: Store): void;
}

export interface IPubSubElement extends IPublishElement {
  setStore(store: Store): void;
}
