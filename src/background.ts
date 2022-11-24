/* eslint-disable import/prefer-default-export */

import {
  State,
  initialSettings,
  initialOptions,
  HtmlBookmarks,
  CliMessageTypes,
  PayloadAction,
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
} from './common';

import { makeLeaf, makeNode, makeHistory as makeHtmlHistory } from './html';
import { setBrowserIcon } from './draw-svg';
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
    chrome.storage.local.set({ htmlBookmarks });
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
  const histories = await getHistoryData().then(addHeadersHistory);
  const html = histories.slice(0, 32).map(makeHtmlHistory).join('');
  const htmlHistory = `<div class="current-date history header-date" style="transform: translateY(-10000px)"></div>${html}`;
  return setLocal({ htmlHistory }).then(() => histories);
}

let timeoutRemoveHistory: ReturnType<typeof setTimeout>;

async function onVisitRemoved() {
  clearTimeout(timeoutRemoveHistory);
  timeoutRemoveHistory = setTimeout(setHtmlHistory, 200);
}

let timeoutRefreshHistoryTitle: ReturnType<typeof setTimeout>;

function addHistory() {
  clearTimeout(timeoutRefreshHistoryTitle);
  timeoutRefreshHistoryTitle = setTimeout(setHtmlHistory, 2000);
}

type InitStateKeys = keyof Pick<
  State,
  'settings' | 'clientState' | 'options' | 'lastSearchWord'
>;
const initStateKeys: Array<InitStateKeys> = ['settings', 'clientState', 'options', 'lastSearchWord'];

async function init(storage: Pick<State, InitStateKeys>) {
  const css = await fetch('./default.css').then((resp) => resp.text());
  const theme = await makeColorPalette();
  const settings = { ...initialSettings, ...storage.settings, theme };
  const clientState = storage.clientState || {};
  const lastSearchWord = storage.lastSearchWord || '';
  const options = { ...initialOptions, ...storage.options, css: storage.options?.css ?? css };
  // const historyRows = settings.historyMax.rows;
  setBrowserIcon(options.colorPalette);
  makeHtmlBookmarks();
  setHtmlHistory();
  setLocal({
    settings, clientState, options, lastSearchWord,
  });
  regsterChromeEvents(addHistory)([chrome.history.onVisited]);
  regsterChromeEvents(onVisitRemoved)([chrome.history.onVisitRemoved]);
  setPopupStyle(options);
}

getLocal(...initStateKeys).then(init);

// Messagings popup to background

type PayloadMoveWindow = PayloadAction<
  { sourceWindowId: number, windowId: number, index: number, focused: boolean }
>;

export const mapMessagesPtoB = {
  [CliMessageTypes.initialize]: ({ payload }: PayloadAction<string>) => (
    Promise.resolve(payload)
  ),
  [CliMessageTypes.moveWindow]:
    ({
      payload: {
        sourceWindowId, windowId, index, focused,
      },
    }: PayloadMoveWindow) => (
      chrome.windows.get(sourceWindowId, { populate: true })
        .then(async ({ tabs }) => {
          const tabIds = tabs!.map((tab) => tab.id!);
          return chrome.tabs.move(tabIds, { windowId, index });
        })
        .then(async () => {
          if (chrome.runtime.lastError) {
            return chrome.runtime.lastError.message;
          }
          if (focused) {
            return chrome.windows.update(windowId, { focused });
          }
          return undefined;
        })
    ),
  [CliMessageTypes.moveWindowNew]: ({ payload }: PayloadAction<{ windowId: number }>) => (
    chrome.windows.get(payload.windowId, { populate: true }).then(({ tabs, incognito }) => {
      if (!tabs) {
        return;
      }
      const activeTabIndex = tabs.findIndex((tab) => tab.active);
      const [activeTab] = tabs.splice(activeTabIndex, 1);
      chrome.windows.create({ tabId: activeTab.id, incognito }, (win) => {
        tabs.forEach(async (tab) => {
          await chrome.tabs.move(tab.id!, { windowId: win!.id, index: tab.index });
        });
      });
    })
  ),
  [CliMessageTypes.moveTabsNewWindow]: async (
    { payload: { tabIds, incognito } }: PayloadAction<{ tabIds: number[], incognito: boolean}>,
  ): Promise<{ windowId: number, msg?: string }> => {
    // const [tabId, ...rest] = tabIds;
    const newWindow = await chrome.windows.create({ incognito, focused: false });
    return chrome.tabs.move(tabIds, { windowId: newWindow.id!, index: -1 })
      .then(([{ windowId }]) => ({ windowId }))
      .catch((reason) => ({ windowId: -1, msg: reason.message }))
      // .catch((reason) => reason.message)
      .finally(() => chrome.tabs.remove(newWindow!.tabs![0].id!));
    // const tab = await chrome.treasonabs.get()
    // return chrome.windows.create({ tabId, incognito }).then(
    //   (win) => chrome.tabs.move(rest, { windowId: win!.id!, index: -1 }),
    // );
  },
  // [CliMessageTypes.moveTabs]: (
  //   { payload: { tabIds, incognito } }: PayloadAction<{ tabIds: string[], incognito: boolean }>,
  // ) => {
  //   const [url1, ...rest] = urls;
  //   return chrome.windows.create({ url: url1, incognito }).then((win) => {
  //     rest.forEach(async (url) => {
  //       await chrome.tabs.create({ windowId: win!.id, url, active: false });
  //     });
  //   });
  // },
};

setMessageListener(mapMessagesPtoB);

// No longer in use
chrome.storage.local.remove('histories');
