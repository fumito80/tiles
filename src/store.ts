import {
  EventListenerOptions,
  HTMLElementEventType, MyHistoryItem, Options, PromiseInitTabs, State, StoredElements,
} from './types';
import { $, $byClass, $byTag } from './client';
import { OpenTab, Window } from './tabs';
import { FormSearch } from './search';
import DragAndDropEvents from './drag-drop';
import { MultiSelPane } from './multi-sel-pane';

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
    ) {
      subscribeMethods.forEach((subscribeMethod) => this.subscribe(actionName, subscribeMethod));
    },
    // eslint-disable-next-line no-use-before-define
    subscribeContext(source?: ISubscribeElement) {
      // eslint-disable-next-line no-use-before-define
      source?.connect(this as unknown as Store);
      // eslint-disable-next-line no-use-before-define
      const map = <A extends IPublishElement | IPubSubElement, B extends keyof ReturnType<A['actions']>>(
        srcElement: A,
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

  // store.subscribeContext($appMain)
  //   .map($appMain, 'clickAppMain', $appMain.clickAppMain)
  //   .map($appMain, 'keydownMain', $appMain.keydown)
  //   .map($appMain, 'keyupMain', $appMain.keyup)
  //   .map($formSearch, 'searching', $appMain.searching)
  //   .map(dragAndDropEvents, 'dragging', $appMain.dragging);

  // store.subscribeContext()
  //   .map(
  //     $headerLeafs,
  //     'setIncludeUrl',
  //     $appMain.setIncludeUrl.bind($appMain),
  //     $history.setIncludeUrl.bind($history),
  //   )
  //   .map(
  //     $formSearch,
  //     'clearSearch',
  //     $leafs.clearSearch.bind($leafs),
  //     $headerTabs.clearSearch.bind($headerTabs),
  //     $tabs.clearSearch.bind($tabs),
  //     $history.clearSearch.bind($history),
  //   )
  //   .map(
  //     $appMain,
  //     'multiSelPanes',
  //     $leafs.multiSelectLeafs.bind($leafs),
  //     $tabs.multiSelect.bind($tabs),
  //     $headerHistory.multiSelPanes.bind($headerHistory),
  //     $history.multiSelect.bind($history),
  //     $formSearch.multiSelPanes.bind($formSearch),
  //   )
  //   .map(
  //     $headerHistory,
  //     'historyCollapseDate',
  //     $headerHistory.toggleCollapseIcon.bind($headerHistory),
  //     $history.collapseHistoryDate.bind($history),
  //   );

  // store.subscribeContext($leafs)
  //   .map($leafs, 'clickLeafs', $leafs.clickItem)
  //   .map($leafs, 'mousedownLeafs', $leafs.mousedownItem)
  //   .map($leafs, 'mouseupLeafs', $leafs.mouseupItem)
  //   .map($leafs, 'wheelLeafs', $leafs.wheelHighlightTab)
  //   .map($folders, 'clickFolders', $leafs.clickItem)
  //   .map($folders, 'mousedownFolders', $leafs.mousedownItem)
  //   .map($folders, 'mouseupFolders', $leafs.mouseupItem);

  // store.subscribeContext($headerLeafs);

  // store.subscribeContext($folders)
  //   .map($folders, 'wheelFolders', $folders.wheelHighlightTab);

  // store.subscribeContext($headerTabs)
  //   .map($headerTabs, 'collapseWindowsAll', $headerTabs.switchCollapseIcon)
  //   .map($tabs, 'setWheelHighlightTab', $headerTabs.showBookmarkMatches)
  //   .map($tabs, 'tabMatches', $headerTabs.showTabMatches);

  // store.subscribeContext($tabs)
  //   .map($headerTabs, 'scrollNextWindow', $tabs.switchTabWindow)
  //   .map($headerTabs, 'scrollPrevWindow', $tabs.switchTabWindow)
  //   .map($tabs, 'clickTabs', $tabs.clickItem)
  //   .map($tabs, 'mousedownTabs', $tabs.mousedownItem)
  //   .map($tabs, 'mouseupTabs', $tabs.mouseupItem)
  //   .map($tabs, 'openTabsFromHistory', $tabs.openTabsFromHistory)
  //   .map($leafs, 'mouseoverLeafs', $tabs.mouseoverLeaf)
  //   .map($leafs, 'mouseoutLeafs', $tabs.mouseoutLeaf)
  //   .map($folders, 'mouseoverFolders', $tabs.mouseoverLeaf)
  //   .map($folders, 'mouseoutFolders', $tabs.mouseoutLeaf)
  //   .map($leafs, 'nextTabByWheel', $tabs.nextTabByWheel)
  //   .map($tabs, 'activateTab', $tabs.activateTab)
  //   .map($headerTabs, 'focusCurrentTab', $tabs.focusCurrentTab);

  // store.subscribeContext($headerHistory);

  // store.subscribeContext($history)
  //   .map($history, 'clickHistory', $history.clickItem)
  //   .map($history, 'resetHistory', $history.resetHistory)
  //   .map($history, 'mousedownHistory', $history.mousedownItem)
  //   .map($history, 'mouseupHistory', $history.mouseupItem)
  //   .map($history, 'openHistories', $history.openHistories)
  //   .map($history, 'addBookmarksHistories', $history.addBookmarks)
  //   .map($history, 'openWindowFromHistory', $history.openWindowFromHistory);

  // store.subscribeContext($formSearch)
  //   .map($formSearch, 'inputQuery', $formSearch.inputQuery)
  //   .map($formSearch, 'changeIncludeUrl', $formSearch.resetQuery)
  //   .map($formSearch, 'clearQuery', $formSearch.clearQuery)
  //   .map($formSearch, 'focusQuery', $formSearch.focusQuery)
  //   .map($formSearch, 'search', $formSearch.reSearchAll)
  //   .map($formSearch, 're-search', $formSearch.reSearch)
  //   .map($formSearch, 'setQuery', $formSearch.setQuery)
  //   .map($formSearch, 'keydownQueries', $formSearch.keydownQueries);

  // store.subscribeContext(dragAndDropEvents)
  //   .map(dragAndDropEvents, 'dragstart', dragAndDropEvents.dragstart)
  //   .map(dragAndDropEvents, 'drop', dragAndDropEvents.drop)
  //   .map(dragAndDropEvents, 'dragend', dragAndDropEvents.dragend);

  // // v-scroll initialize
  // if (!isSearching) {
  //   store.dispatch('resetHistory');
  // }
  return {
    store,
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

export type Store = Pick<ReturnType<typeof initComponents>, 'store'>['store'];
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
