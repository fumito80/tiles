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
  setWindowMode,
} from './common';

import { makeLeaf, makeNode, makeHistory as makeHtmlHistory } from './html';
import { setToolbarIcon } from './draw-svg';
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
  const historiesOrSessions = await Promise.all(getHistoryData())
    .then(addHeadersHistory)
    .then((data) => data.slice(0, historyHtmlCount));
  const html = historiesOrSessions.map(makeHtmlHistory).join('');
  const htmlHistory = `<history-item class="current-date history header-date" style="transform: translateY(-10000px)"></history-item>${html}`;
  return setLocal({ htmlHistory });
}

let timeoutUpdateHistory500: ReturnType<typeof setTimeout>;

function updateHistory500() {
  clearTimeout(timeoutUpdateHistory500);
  timeoutUpdateHistory500 = setTimeout(setHtmlHistory, 500);
}

let timeoutUpdateHistory1500: ReturnType<typeof setTimeout>;

function updateHistory1500() {
  clearTimeout(timeoutUpdateHistory1500);
  timeoutUpdateHistory1500 = setTimeout(setHtmlHistory, 1500);
}

function saveQuery(port: chrome.runtime.Port) {
  port.onDisconnect.addListener(() => {
    addQueryHistory();
    chrome.runtime.sendMessage('close-popup').catch(() => {});
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
const initStateKeys: Array<InitStateKeys> = ['settings', 'clientState', 'options', 'lastSearchWord'];

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
  setHtmlHistory();
  setLocal({
    settings, clientState, options, lastSearchWord,
  });
  regsterChromeEvents(updateHistory1500)([chrome.history.onVisited]);
  regsterChromeEvents(updateHistory500)([chrome.history.onVisitRemoved]);
  regsterChromeEvents(updateHistory500)([chrome.sessions.onChanged]);
  regsterChromeEvents(saveQuery)([chrome.runtime.onConnect]);
  setPopupStyle(options);
  setWindowMode();
}

getLocal(...initStateKeys).then(init);

// Messagings popup to background

type PayloadMoveWindow = PayloadAction<
  { sourceWindowId: number, windowId: number, index: number, focused: boolean }
>;

let timerUpdWin: ReturnType<typeof setTimeout>;
// let promiseUpdWin = Promise.resolve();

export const mapMessagesPtoB = {
  [CliMessageTypes.initialize]: ({ payload }: PayloadAction<string>) => (
    Promise.resolve(payload)
  ),
  [CliMessageTypes.getCurrentWindowId]: () => getLocal('currentWindowId').then(({ currentWindowId }) => currentWindowId),
  [CliMessageTypes.restoreSession]: ({ payload }: PayloadAction<string>) => (
    (chrome.sessions.restore(payload) as unknown as Promise<chrome.sessions.Session>)
      .then(restoredSession)
  ),
  [CliMessageTypes.updateWindow]: ({ payload }: PayloadAction<PayloadUpdateWindow>) => {
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
  [CliMessageTypes.setThemeColor]: ({ payload: colorPalette }: PayloadAction<ColorPalette>) => {
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
              tabs!.forEach((tab) => {
                chrome.tabs.move(tab.id!, { windowId: win!.id, index: tab.index });
              });
            });
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
      .then(([{ windowId }]) => ({ windowId }))
      .catch((reason) => ({ windowId: -1, message: reason.message }));
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
};

setMessageListener(mapMessagesPtoB);

// No longer in use
chrome.storage.local.remove('histories');
