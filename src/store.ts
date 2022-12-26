import {
  EventListenerOptions,
  HTMLElementEventType, MyHistoryItem, Options, PromiseInitTabs, State, StoredElements,
} from './types';
import {
  $, $byClass, $byTag, toggleClass,
} from './client';
import { OpenTab, Window } from './tabs';
import { FormSearch } from './search';
import DragAndDropEvents from './drag-drop';
import { MultiSelPane } from './multi-sel-pane';
import { keydownApp, keyupApp } from './app-main';

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

type ActionValue<T> = T extends Action<any, infer R, any, any, any, any, any> ? R : never;

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
      // binder?: HTMLElement,
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
    actions,
    matrix<
      // eslint-disable-next-line no-use-before-define
      A extends IPublishElement | IPubSubElement,
      B extends keyof ReturnType<A['actions']>,
      C extends ReturnType<A['actions']>[B],
    >(
      srcElement: A,
      actionName: B,
      ...subscribeMethods: ((
        changes: Changes<B>,
        e: HTMLElementEventType[ActionEventType<C>],
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
      // binder?: HTMLElement,
    ) {
      subscribeMethods.forEach((subscribeMethod) => this.subscribe(actionName, subscribeMethod));
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
  );
  $leafs.init(options);
  $folders.init(options);
  $headerLeafs.init(settings, $tmplMultiSelPane, options);
  $headerTabs.init(settings, $tmplMultiSelPane, options.collapseTabs);
  $headerHistory.init(settings, $tmplMultiSelPane);
  $history.init(promiseInitHistory, options, htmlHistory, isSearching);
  $formSearch.init([$leafs, $tabs, $history], settings.includeUrl, options, lastSearchWord);
  // Register actions
  const actions = {
    ...$appMain.actions(),
    ...$leafs.actions(),
    ...$headerLeafs.actions(),
    ...$folders.actions(),
    ...$headerTabs.actions(),
    ...$tabs.actions(),
    ...$formSearch.actions(),
    ...$history.actions(),
    ...$headerHistory.actions(),
    ...dragAndDropEvents.actions(),
  };
  // Dispatch store
  const store = registerActions(actions, options);

  // $appMain.connect(store);
  store.matrix($appMain, 'clickAppMain', $appMain.clickAppMain.bind($appMain));
  store.matrix($appMain, 'keydownMain', keydownApp);
  store.matrix($appMain, 'keyupMain', keyupApp);
  store.matrix(
    $headerLeafs,
    'setIncludeUrl',
    $appMain.setIncludeUrl.bind($appMain),
    $history.setIncludeUrl.bind($history),
  );
  store.matrix($formSearch, 'searching', (changes) => toggleClass('searching', changes.newValue)($appMain));
  store.matrix(dragAndDropEvents, 'dragging', (changes) => toggleClass('drag-start', changes.newValue)($appMain));

  $leafs.connect(store);
  store.matrix($leafs, 'clickLeafs', $leafs.clickItem.bind($leafs));
  store.matrix($leafs, 'mousedownLeafs', $leafs.mousedownItem.bind($leafs));
  store.matrix($leafs, 'mouseupLeafs', $leafs.mouseupItem.bind($leafs));
  store.matrix($leafs, 'wheelLeafs', $leafs.wheelHighlightTab.bind($leafs));
  store.matrix(
    $formSearch,
    'clearSearch',
    $leafs.clearSearch.bind($leafs),
    $headerTabs.clearSearch.bind($headerTabs),
    $tabs.clearSearch.bind($tabs),
    $history.clearSearch.bind($history),
  );
  store.matrix(
    $appMain,
    'multiSelPanes',
    $leafs.multiSelectLeafs.bind($leafs),
    $tabs.multiSelect.bind($tabs),
    $headerHistory.multiSelPanes.bind($headerHistory),
    $history.multiSelect.bind($history),
    $formSearch.multiSelPanes.bind($formSearch),
  );
  store.matrix($folders, 'clickFolders', $leafs.clickItem.bind($leafs));
  store.matrix($folders, 'mousedownFolders', $leafs.mousedownItem.bind($leafs));
  store.matrix($folders, 'mouseupFolders', $leafs.mouseupItem.bind($leafs));

  $headerLeafs.connect(store);

  $folders.connect(store);
  store.matrix($folders, 'wheelFolders', $folders.wheelHighlightTab.bind($folders));

  $headerTabs.connect(store);
  store.matrix($headerTabs, 'collapseWindowsAll', $headerTabs.switchCollapseIcon.bind($headerTabs));
  store.matrix($tabs, 'setWheelHighlightTab', $headerTabs.showBookmarkMatches.bind($headerTabs));
  store.matrix($tabs, 'tabMatches', $headerTabs.showTabMatches.bind($headerTabs));
  // store.matrix('clearSearch', $headerTabs.clearSearch.bind($headerTabs));

  $tabs.connect(store);
  store.matrix($headerTabs, 'scrollNextWindow', $tabs.switchTabWindow.bind($tabs));
  store.matrix($headerTabs, 'scrollPrevWindow', $tabs.switchTabWindow.bind($tabs));
  // store.matrix($tabs, 'clearSearch', $tabs.clearSearch.bind($tabs));
  store.matrix($tabs, 'clickTabs', $tabs.clickItem.bind($tabs));
  store.matrix($tabs, 'mousedownTabs', $tabs.mousedownItem.bind($tabs));
  store.matrix($tabs, 'mouseupTabs', $tabs.mouseupItem.bind($tabs));
  // store.matrix($tabs, 'multiSelPanes', $tabs.multiSelect.bind($tabs));
  store.matrix($tabs, 'openTabsFromHistory', $tabs.openTabsFromHistory.bind($tabs));
  store.matrix($leafs, 'mouseoverLeafs', $tabs.mouseoverLeaf.bind($tabs));
  store.matrix($leafs, 'mouseoutLeafs', $tabs.mouseoutLeaf.bind($tabs));
  store.matrix($folders, 'mouseoverFolders', $tabs.mouseoverLeaf.bind($tabs));
  store.matrix($folders, 'mouseoutFolders', $tabs.mouseoutLeaf.bind($tabs));
  store.matrix($leafs, 'nextTabByWheel', $tabs.nextTabByWheel.bind($tabs));
  store.matrix($tabs, 'activateTab', $tabs.activateTab.bind($tabs));
  store.matrix($headerTabs, 'focusCurrentTab', $tabs.focusCurrentTab.bind($tabs));

  $headerHistory.connect(store);
  store.matrix($headerHistory, 'historyCollapseDate', $headerHistory.toggleCollapseIcon.bind($headerHistory), $history.collapseHistoryDate.bind($history));
  // store.matrix($appMain, 'multiSelPanes', $headerHistory.multiSelPanes.bind($headerHistory));

  $history.connect(store);
  store.matrix($history, 'clickHistory', $history.clickItem.bind($history));
  // store.matrix($history, 'clearSearch', $history.clearSearch.bind($history));
  store.matrix($history, 'resetHistory', $history.resetHistory.bind($history));
  // store.matrix($history, 'historyCollapseDate', $history.collapseHistoryDate.bind($history));
  // store.matrix($formSearch, 'changeIncludeUrl', (changes) => {
  //   this.#includeUrl = changes.newValue;
  // });
  // store.matrix($headerLeafs, 'setIncludeUrl', (changes) => {
  //   if (!changes.isInit) {
  //     this.resetVScroll();
  //   }
  // });
  store.matrix($history, 'mousedownHistory', $history.mousedownItem.bind($history));
  store.matrix($history, 'mouseupHistory', $history.mouseupItem.bind($history));
  // store.matrix($history, 'multiSelPanes', $history.multiSelect.bind($history));
  store.matrix($history, 'openHistories', $history.openHistories.bind($history));
  store.matrix($history, 'addBookmarksHistories', $history.addBookmarks.bind($history));
  store.matrix($history, 'openWindowFromHistory', $history.openWindowFromHistory.bind($history));

  // $formSearch.connect(store);
  store.matrix($formSearch, 'inputQuery', $formSearch.inputQuery.bind($formSearch));
  store.matrix($formSearch, 'changeIncludeUrl', $formSearch.resetQuery.bind($formSearch));
  store.matrix($formSearch, 'clearQuery', $formSearch.clearQuery.bind($formSearch));
  store.matrix($formSearch, 'focusQuery', $formSearch.focusQuery.bind($formSearch));
  // store.matrix($formSearch, 'multiSelPanes', $formSearch.multiSelPanes.bind($formSearch));
  store.matrix($formSearch, 'search', $formSearch.reSearchAll.bind($formSearch));
  store.matrix($formSearch, 're-search', $formSearch.reSearch.bind($formSearch));
  store.matrix($formSearch, 'setQuery', $formSearch.setQuery.bind($formSearch));
  store.matrix($formSearch, 'keydownQueries', $formSearch.keydownQueries.bind($formSearch));

  // dragAndDropEvents.connect(store);
  store.matrix(dragAndDropEvents, 'dragstart', dragAndDropEvents.dragstart.bind(dragAndDropEvents));
  store.matrix(dragAndDropEvents, 'drop', dragAndDropEvents.drop.bind(dragAndDropEvents));
  store.matrix(dragAndDropEvents, 'dragend', dragAndDropEvents.dragend.bind(dragAndDropEvents));

  // v-scroll initialize
  if (!isSearching) {
    store.dispatch('resetHistory');
  }
  return store;
}

export type Store = ReturnType<typeof initComponents>;
export type StoreSub = Pick<Store, 'dispatch' | 'getStates'>;
export type Dispatch = Store['dispatch'];
export type Subscribe = Store['subscribe'];
export type StoreActions = Store['actions'];
export type GetStates = Store['getStates'];
export type States = Parameters<Parameters<Subscribe>[1]>[2];
export type ActionNames = keyof Store['actions'];
export type InitValue<T extends ActionNames> = ActionValue<StoreActions[T]>;
export type Changes<T extends ActionNames> = {
  newValue: InitValue<T>, oldValue: InitValue<T>, isInit: boolean,
};

export interface IPublishElement {
  actions(): Actions<any>;
}

export interface ISubscribeElement {
  connect(store: Store): void;
}

export interface IPubSubElement extends IPublishElement {
  connect(store: Store): void;
}
