/* eslint-disable import/prefer-default-export */

import {
  State,
  initialSettings,
  initialOptions,
  HtmlBookmarks,
  CliMessageTypes,
  PayloadAction,
  historyHtmlCount,
  ColorPalette,
  PayloadUpdateWindow,
  BkgMessageTypes,
} from './types';

import {
  pipe,
  propEq,
  propNe,
  regsterChromeEvents,
  setLocal,
  getLocal,
  setMessageListener,
  setPopupStyle,
  makeColorPalette,
  getHistoryData,
  prop,
  addQueryHistory,
  getHtmlHistory,
  map,
  createOrPopup,
} from './common';

import { makeLeaf, makeNode, makeHistory as makeHtmlHistory } from './html';
import { getSvgBrowserIcon, setToolbarIcon } from './draw-svg';
import addHeadersHistory from './add-headers-history';

function digBookmarks(isNode = true) {
  return (node: chrome.bookmarks.BookmarkTreeNode): string => {
    if (node.url) {
      return (isNode && node.parentId !== '1') ? '' : makeLeaf(node);
    }
    const children = node.children?.map(digBookmarks(isNode)).join('') ?? '';
    const { length } = node.children?.filter(propEq('url', undefined)) ?? [];
    return makeNode({ ...node, children, length });
  };
}

const concat = (a: string[] = []) => (b: string = '') => b.concat(a.join(''));

function makeHtmlBookmarks() {
  chrome.bookmarks.getTree(([{ children }]) => {
    const leafs = children?.map(digBookmarks(false)).join('') || '';
    const rootTree = children?.find(propEq('id', '1'))?.children;
    const folders = pipe(
      concat(rootTree?.map(digBookmarks())),
      concat(children?.filter(propNe('id', '1')).map(digBookmarks())),
    )();
    const htmlBookmarks: HtmlBookmarks = { leafs, folders };
    setLocal({ htmlBookmarks });
  });
}

const bookmarksEvents = [
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onImportEnded,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onRemoved,
];

regsterChromeEvents(makeHtmlBookmarks)(bookmarksEvents);

async function setHtmlHistory() {
  const { options } = await getLocal('options');
  if (options.windowMode) {
    return setLocal({ updatedHistory: Date.now() });
  }
  const historiesOrSessions = await Promise.all(getHistoryData())
    .then(addHeadersHistory)
    .then((data) => data.slice(0, historyHtmlCount));
  const htmlHistory = pipe(map(makeHtmlHistory), (items) => items.join(''), getHtmlHistory)(historiesOrSessions);
  return setLocal({ htmlHistory });
}

async function removeWindowModeHistory(url?: string) {
  if (url?.startsWith(chrome.runtime.getURL(''))) {
    return chrome.history.deleteUrl({ url });
  }
  return undefined;
}

let timeoutUpdateHistory500: ReturnType<typeof setTimeout>;

function updateHistory500() {
  clearTimeout(timeoutUpdateHistory500);
  timeoutUpdateHistory500 = setTimeout(setHtmlHistory, 500);
}

let timeoutUpdateHistory1500: ReturnType<typeof setTimeout>;

function updateHistory1500({ url }: chrome.history.HistoryItem) {
  removeWindowModeHistory(url);
  clearTimeout(timeoutUpdateHistory1500);
  timeoutUpdateHistory1500 = setTimeout(setHtmlHistory, 1500);
}

function saveQuery(port: chrome.runtime.Port) {
  port.onDisconnect.addListener(() => {
    addQueryHistory();
    chrome.runtime.sendMessage({ type: BkgMessageTypes.tryChangePalette }).catch(() => {});
  });
}

function restoredSession(session: chrome.sessions.Session) {
  if (session.window?.id) {
    chrome.windows.update(session.window.id, { focused: true });
  }
}

type InitStateKeys = keyof Pick<
  State,
  'settings' | 'clientState' | 'options' | 'lastSearchWord'
>;

function migrate(storage: Pick<State, InitStateKeys>) {
  const { settings, options } = storage;
  if (!settings || settings.paneLayouts?.length === 0) {
    return storage;
  }
  const panes = options.panes
    .reduce<string[]>((acc, name) => acc.concat(name === 'bookmarks' ? options.bookmarksPanes[0] : name), []);
  const widths = settings.paneLayouts
    .find((ps) => panes.every((pane, i) => pane === ps[i]?.name))!
    .map((paneWidth) => (paneWidth.width / initialSettings.width) * 100);
  const mapping = {
    histories: ['history'],
    tabs: ['windows'],
    bookmarks: ['bookmarks', 'recent-tabs'],
  };
  const panes2 = options.panes
    .map((pane) => mapping[pane as keyof typeof mapping]) as typeof initialOptions.panes2;
  const [firstPane, secondPane] = options.panes;
  const wider1 = (options.zoomHistory && firstPane === 'histories')
    || (options.zoomTabs && firstPane === 'tabs');
  const wider2 = (options.zoomHistory && secondPane === 'histories')
    || (options.zoomTabs && secondPane === 'tabs');
  settings.paneLayouts = [];
  return {
    ...storage,
    options: {
      ...options, panes2, wider1, wider2, windowMode: false,
    },
    settings: { ...settings, paneSizes: { ...initialSettings.paneSizes, widths } },
  } as const satisfies Pick<State, InitStateKeys>;
}

async function init(storage: Pick<State, InitStateKeys>) {
  const css = await fetch('./default.css').then((resp) => resp.text());
  const { html: theme, palettes } = await makeColorPalette();
  const settings = {
    ...initialSettings, ...storage.settings, theme, palettes,
  };
  const clientState = storage.clientState || {};
  const lastSearchWord = storage.lastSearchWord || '';
  const options = { ...initialOptions, ...storage.options, css: storage.options?.css ?? css };
  setToolbarIcon(options.colorPalette);
  makeHtmlBookmarks();
  await setLocal({
    settings, clientState, options, lastSearchWord,
  }).then(() => {
    setPopupStyle(options);
  });
  await setHtmlHistory();
  regsterChromeEvents(updateHistory1500)([chrome.history.onVisited]);
  regsterChromeEvents(updateHistory500)([chrome.history.onVisitRemoved]);
  regsterChromeEvents(updateHistory500)([chrome.sessions.onChanged]);
  regsterChromeEvents(saveQuery)([chrome.runtime.onConnect]);
}

const initStateKeys: Array<InitStateKeys> = ['settings', 'clientState', 'options', 'lastSearchWord'];

getLocal(...initStateKeys)
  .then(migrate)
  .then(init);

chrome.action.onClicked.addListener((tab) => createOrPopup(tab.windowId));

// Messagings popup to background

type PayloadMoveWindow = PayloadAction<
  { sourceWindowId: number, windowId: number, index: number, focused: boolean }
>;

let timerUpdWin: ReturnType<typeof setTimeout>;

export const mapMessagesPtoB = {
  [CliMessageTypes.initialize]: ({ payload }: PayloadAction<string>) => (
    Promise.resolve(payload)
  ),
  [CliMessageTypes.getWindowModeInfo]: async () => {
    const { windowModeInfo } = await getLocal('windowModeInfo');
    setLocal({
      windowModeInfo: { ...windowModeInfo, currentWindowId: chrome.windows.WINDOW_ID_NONE },
    });
    return windowModeInfo;
  },
  [CliMessageTypes.restoreSession]: ({ payload }: PayloadAction<string>) => (
    (chrome.sessions.restore(payload) as unknown as Promise<chrome.sessions.Session>)
      .then(restoredSession)
  ),
  [CliMessageTypes.getSvgBrowserFavicon]: ({ payload }: PayloadAction<ColorPalette>) => (
    getSvgBrowserIcon(payload)
  ),
  [CliMessageTypes.updateWindow]: async ({ payload }: PayloadAction<PayloadUpdateWindow>) => {
    const { windowId, updateInfo } = payload;
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return Promise.reject();
    }
    if (updateInfo.focused) {
      clearTimeout(timerUpdWin);
      timerUpdWin = setTimeout(() => chrome.windows.update(windowId, updateInfo), 100);
      return Promise.resolve();
    }
    return chrome.windows.get(windowId).then((win) => {
      if (win) {
        chrome.windows.update(win.id!, updateInfo);
      }
    });
  },
  [CliMessageTypes.setThemeColor]: async (
    { payload: colorPalette }: PayloadAction<ColorPalette>,
  ) => {
    setToolbarIcon(colorPalette);
    return getLocal('options').then(({ options }) => {
      const { css, windowMode } = options;
      setPopupStyle({ css, colorPalette, windowMode });
      return setLocal({ options: { ...options, colorPalette } });
    });
  },
  [CliMessageTypes.moveWindow]:
    ({
      payload: {
        sourceWindowId, windowId, index, focused,
      },
    }: PayloadMoveWindow) => (
      chrome.windows.get(sourceWindowId, { populate: true })
        .then(({ tabs }) => {
          const tabIds = tabs!.map((tab) => tab.id!);
          return chrome.tabs.move(tabIds, { windowId, index });
        })
        .then(() => {
          if (focused) {
            chrome.windows.update(windowId, { focused });
          }
          return undefined;
        })
        .catch((reason) => reason.message as string)
    ),
  [CliMessageTypes.moveWindowNew]: ({ payload }: PayloadAction<{ windowId: number }>) => (
    chrome.windows.update(payload.windowId, { state: 'normal' })
      .then(
        () => chrome.windows.get(payload.windowId, { populate: true })
          .then(({
            tabs, incognito, left, top, width, height,
          }) => {
            const activeTabIndex = tabs!.findIndex((tab) => tab.active);
            const [activeTab] = tabs!.splice(activeTabIndex, 1);
            return chrome.windows.create({
              tabId: activeTab.id, incognito, left, top, width, height,
            }).then((win) => {
              const moves = tabs!.map((tab) => (
                chrome.tabs.move(tab.id!, { windowId: win!.id, index: tab.index })
              ));
              return Promise.all(moves).then(() => undefined);
            }).catch((reason) => (reason.message as string));
          }),
      )
  ),
  [CliMessageTypes.moveTabsNewWindow]: async (
    { payload }: PayloadAction<{ tabId: number, incognito: boolean }[]>,
  ): Promise<{ windowId: number, message?: string }> => {
    const [tab1, ...rest] = payload;
    const focused = rest.every((t) => t.incognito === tab1.incognito);
    const incognito = focused ? tab1.incognito : false;
    const newWindow = await chrome.windows.create({ tabId: tab1.tabId, incognito, focused });
    const [primary, reject] = rest.reduce(([p, r], t) => {
      if (t.incognito === tab1.incognito) {
        return [[...p, t.tabId], r];
      }
      return [p, [...r, t.tabId]];
    }, [[], []] as [number[], number[]]);
    const tabIds = [...primary, ...reject];
    return chrome.tabs.move(tabIds, { windowId: newWindow.id!, index: -1 })
      .then(() => ({ windowId: newWindow.id! }))
      .catch((reason) => ({ windowId: chrome.windows.WINDOW_ID_NONE, message: reason.message }));
  },
  [CliMessageTypes.openUrls]: (
    { payload: { urls, windowId, index } }: PayloadAction<{
      urls: string[], windowId: number, index?: number,
    }>,
  ) => {
    const tabs = urls.reverse().map((url) => chrome.tabs.create({
      windowId, url, index, active: true,
    }));
    return Promise.all(tabs).then(() => chrome.windows.update(windowId, { focused: true }));
  },
  [CliMessageTypes.moveTabs]: (
    {
      payload: {
        sourceTabs, windowId, incognito, index,
      },
    }: PayloadAction<{
      sourceTabs: (chrome.tabs.Tab & { isCurrentWindow: boolean, incognito: boolean })[],
      windowId: number, incognito: boolean, index?: number,
    }>,
  ) => chrome.windows.get(windowId, { populate: true })
    .then(async ({ tabs }) => {
      const pins = tabs!.slice(index).concat(sourceTabs).filter(prop('pinned'));
      if (pins.length > 0) {
        const updates = pins?.map((p) => chrome.tabs.update(p.id!, { pinned: false }));
        return Promise.all(updates).then(() => tabs!);
      }
      return tabs!;
    })
    .then(async (tabs) => {
      const sourceTabIds = sourceTabs!.map((t) => t.id!);
      const [head, tail] = [tabs.slice(0, index), tabs.slice(index)]
        .map((ts) => ts.map((tab) => tab.id!).filter((id) => !sourceTabIds.includes(id)));
      const tabIds = head.concat(sourceTabIds, tail);
      return chrome.tabs.move(tabIds, { windowId, index: 0 })
        .then(() => sourceTabs)
        .catch((reason) => reason.message as string);
    })
    .then((tabsOrMessage) => {
      if (typeof tabsOrMessage === 'string') {
        return tabsOrMessage;
      }
      return tabsOrMessage.some((sourceTab) => {
        if (
          sourceTab.active
          && sourceTab.isCurrentWindow
          && sourceTab.windowId !== windowId
          && sourceTab.incognito === incognito
        ) {
          chrome.tabs.update(sourceTab.id!, { active: true });
          chrome.windows.update(windowId, { focused: true });
          return true;
        }
        return false;
      });
    }),
  [CliMessageTypes.changeWindowMode]: ({ payload: windowMode }: PayloadAction<boolean>) => {
    if (!windowMode) {
      return setHtmlHistory();
    }
    return Promise.resolve();
  },
};

setMessageListener(mapMessagesPtoB);
