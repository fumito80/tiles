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
import miningHistoryData from './worker-history';

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
  const histories = await getHistoryData().then(miningHistoryData);
  const html = histories.slice(0, 30).map(makeHtmlHistory).join('');
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

export const mapMessagesPtoB = {
  [CliMessageTypes.initialize]: ({ payload }: PayloadAction<string>) => (
    Promise.resolve(payload)
  ),
};

setMessageListener(mapMessagesPtoB);

// No longer in use

chrome.storage.local.remove('histories');
