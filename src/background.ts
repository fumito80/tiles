/* eslint-disable import/prefer-default-export */

import {
  State,
  pastMSec,
  initialSettings,
  initialOptions,
  HtmlBookmarks,
  MyHistoryItem,
  CliMessageTypes,
  PayloadAction,
} from './types';

import {
  aDayMSec,
  pipe,
  propEq,
  propNe,
  regsterChromeEvents,
  setLocal,
  getLocal,
  cbToResolve,
  curry,
  removeUrlHistory,
  setMessageListener,
  postMessage,
  isDateEq,
  setPopupStyle,
  makeColorPalette,
} from './common';

import { makeLeaf, makeNode, makeHistory as makeHtmlHistory } from './html';
import { setBrowserIcon } from './draw-svg';

type Histories = State['histories'];

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

function setHtmlHistory(histories: Histories) {
  const html = histories.slice(0, 30).map(makeHtmlHistory).join('');
  const htmlHistory = `<div class="current-date history header-date" style="transform: translateY(-10000px)"></div>${html}`;
  return setLocal({ htmlHistory, histories }).then(() => histories);
}

function makeHistory() {
  const startTime = Date.now() - pastMSec;
  return new Promise<Histories>((resolve) => {
    chrome.history.search({ text: '', startTime, maxResults: 99999 }, (results) => {
      const histories = results
        .sort((a, b) => Math.sign(b.lastVisitTime! - a.lastVisitTime!))
        .reduce<MyHistoryItem[]>((acc, item) => {
          const prevLastVisitTime = acc.at(-1)?.lastVisitTime;
          if (!prevLastVisitTime || isDateEq(prevLastVisitTime, item.lastVisitTime)) {
            return [...acc, item];
          }
          return [
            ...acc,
            { headerDate: true, lastVisitTime: item.lastVisitTime },
            item,
          ];
        }, []);
      setHtmlHistory(histories);
      resolve(histories);
    });
  });
}

let timeoutRemoveHistory: ReturnType<typeof setTimeout>;

async function onVisitRemoved() {
  clearTimeout(timeoutRemoveHistory);
  timeoutRemoveHistory = setTimeout(makeHistory, 200);
}

const timezoneOffset = (new Date()).getTimezoneOffset() * 60 * 1000;

async function mergeHistoryLatest(currents: Array<MyHistoryItem>) {
  const now = Date.now();
  const startTime = now - (now % aDayMSec) + (aDayMSec + timezoneOffset);
  const [topItem] = currents;
  if (topItem.lastVisitTime! < startTime) {
    return makeHistory();
  }
  const query = {
    startTime,
    text: '',
    maxResults: 99999,
  };
  const todays = await cbToResolve(curry(chrome.history.search)(query))
    .then((histories) => histories.sort((a, b) => Math.sign(b.lastVisitTime! - a.lastVisitTime!)));
  const { id } = todays.at(-1)!;
  const findIndex = currents.findIndex((el) => el.id === id);
  return [...todays, ...currents.slice(findIndex + 1)];
}

let timeoutRefreshHistoryTitle: ReturnType<typeof setTimeout>;

function addHistory() {
  clearTimeout(timeoutRefreshHistoryTitle);
  timeoutRefreshHistoryTitle = setTimeout(() => {
    getLocal('histories')
      .then(({ histories }) => mergeHistoryLatest(histories))
      .then(setHtmlHistory)
      .then(() => postMessage({ type: 'bkg-update-history' }));
  }, 2000);
}

function updateCurrentWindow(currentWindowId?: number) {
  if (!currentWindowId || currentWindowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  setLocal({ currentWindowId });
}

function regsterWindowEvent() {
  const queryOptions = { windowTypes: ['normal', 'app'] } as chrome.windows.WindowEventFilter;
  chrome.windows.onFocusChanged.addListener(updateCurrentWindow, queryOptions);
  chrome.windows.getCurrent(queryOptions, (win) => updateCurrentWindow(win.id));
}

type InitStateKeys = keyof Pick<State, 'settings' | 'clientState' | 'options'>;
const initStateKeys: Array<InitStateKeys> = ['settings', 'clientState', 'options'];

async function init(storage: Pick<State, InitStateKeys>) {
  const css = await fetch('./default.css').then((resp) => resp.text());
  const theme = await makeColorPalette();
  const settings = { ...initialSettings, ...storage.settings, theme };
  const clientState = storage.clientState || {};
  const options = { ...initialOptions, ...storage.options, css: storage.options?.css ?? css };
  // const historyRows = settings.historyMax.rows;
  setBrowserIcon(options.colorPalette);
  makeHtmlBookmarks();
  makeHistory();
  setLocal({ settings, clientState, options });
  regsterChromeEvents(addHistory)([chrome.history.onVisited]);
  regsterChromeEvents(onVisitRemoved)([chrome.history.onVisitRemoved]);
  regsterWindowEvent();
  setPopupStyle(options);
}

getLocal(...initStateKeys).then(init);

// Messagings popup to background

let seriesRemoveHistory = Promise.resolve(false);

export const mapMessagesPtoB = {
  [CliMessageTypes.removeHistory]: ({ payload }: PayloadAction<string>) => {
    seriesRemoveHistory = seriesRemoveHistory.then(() => {
      chrome.history.onVisitRemoved.removeListener(onVisitRemoved);
      return new Promise<boolean>((resolve) => {
        chrome.history.deleteUrl({ url: payload }, async () => {
          await getLocal('histories')
            .then(removeUrlHistory(payload))
            .then(setHtmlHistory);
          chrome.history.onVisitRemoved.addListener(onVisitRemoved);
        });
        resolve(true);
      });
    });
    return seriesRemoveHistory;
  },
  [CliMessageTypes.initialize]: ({ payload }: PayloadAction<number>) => payload.toString(),
};

setMessageListener(mapMessagesPtoB);
