/* eslint-disable import/prefer-default-export */

import './view/popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  StoredElements,
  PromiseInitTabs,
  InitailTabs,
  CliMessageTypes,
} from './types';

import {
  pipe,
  cssid,
  setMessageListener,
  getGridColStart,
  last,
  filter,
  curry,
  preFaviconUrl,
  extractDomain,
  postMessage,
  getHistoryDataByWorker,
} from './common';

import {
  $, $$,
  addStyle, addClass,
  setSplitWidth,
  hasClass,
  addChild,
  setHTML,
  $$byClass, $byClass,
  recoverMinPaneWidth,
  toggleElement,
  $byTag,
} from './client';
import { initComponents } from './store';
import { AppMain } from './app-main';

type Options = State['options'];

const params = new URLSearchParams(document.location.search);
const sheet = document.head.appendChild(document.createElement('style'));
sheet.textContent = params.get('css');

function setOptions(settings: Settings, options: Options) {
  pipe(
    addStyle('width', `${settings.width}px`),
    addStyle('height', `${settings.height}px`),
  )(document.body);

  setSplitWidth(settings.paneWidth).then(recoverMinPaneWidth);

  if (options.showCloseTab) {
    addStyle('--show-close-tab', 'inline-block')($byClass('tabs')!);
  }
  if (options.showDeleteHistory) {
    addStyle('--show-delete-history', 'inline-block')($byClass('histories')!);
  }
  if (!options.showSwitchTabsWin) {
    $byClass('win-prev')!.remove();
    $byClass('win-next')!.remove();
  }
}

function setExternalUrl(options: Options) {
  if (!options.enableExternalUrl || !options.externalUrl) {
    return;
  }
  const [schema, domain] = extractDomain(options.externalUrl);
  pipe(
    addStyle('--external-url-image', `url(${preFaviconUrl}${schema}${domain})`),
    addStyle('--external-url', 'hidden'),
  )($byClass('form-query')!);
}

function setBookmarks(html: HtmlBookmarks) {
  setHTML(html.leafs)($byClass('leafs')!);
  setHTML(html.folders)($byClass('folders')!);
  ($('.folders .open') as any)?.scrollIntoViewIfNeeded();
}

function setBookmarksState(clState: ClientState, isSearching: boolean) {
  clState.paths?.map((id) => $(`.folders ${cssid(id)}`)).forEach(addClass('path'));
  if (clState.open) {
    if (isSearching) {
      $(`.folders ${cssid(clState.open)}`)?.classList.add('open');
    } else {
      $$(cssid(clState.open)).forEach(addClass('open'));
    }
  }
}

function getPanes(panes: Options['panes'], bookmarksPanes: Options['bookmarksPanes'], prefix = '') {
  return panes
    .reduce<string[]>((acc, name) => acc.concat(name === 'bookmarks' ? bookmarksPanes : name), [])
    .map((name) => $byClass(prefix + name)!);
}

function layoutPanes(options: Options, isSearching: boolean) {
  const $appMain = $byTag('app-main') as AppMain;
  const $headers = getPanes(options.panes, ['leafs', 'folders'], 'header-');
  const $bodies = getPanes(options.panes, options.bookmarksPanes);
  $appMain.prepend(...$headers, ...$bodies);
  pipe(
    filter((el) => !hasClass(el, 'header-folders')),
    last,
    addClass('end'),
    curry($byClass)('query-wrap'),
    ($el) => addChild($byClass('form-query')!)($el!),
  )($headers);
  addClass('end')(last($bodies));
  // Bold Splitter
  const $leafs = $('.histories + .leafs, .histories + .tabs');
  if ($leafs) {
    const gridColStart = getGridColStart($leafs);
    const $splitter = $$byClass('split-h')[gridColStart - 1];
    addClass('bold-separator')($splitter);
  }
  $appMain.init(options, isSearching);
  return [...$headers, ...$bodies].reduce((acc, pane) => {
    const name = pane.getAttribute('is');
    if (!name) {
      return acc;
    }
    return { ...acc, [name]: pane };
  }, { 'app-main': $appMain } as StoredElements);
}

const queryOptions = { windowTypes: ['normal', 'app'] } as chrome.windows.WindowEventFilter;

function setCloseApp() {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }
    window.close();
  }, queryOptions);
}

function getInitialTabs() {
  const promiseCurrentWindowId = chrome.windows.getCurrent(queryOptions).then((win) => win.id!);
  const promiseInitTabs = new Promise<InitailTabs>((resolve) => {
    chrome.windows.getAll({ ...queryOptions, populate: true }, (wins) => {
      const windows = wins.map((win) => ({
        windowId: win.id!,
        tabs: win.tabs!,
      }));
      resolve(windows);
    });
  });
  return Promise.all([promiseInitTabs, promiseCurrentWindowId]);
}

function init([{
  settings, htmlBookmarks, clientState, options, htmlHistory, lastSearchWord,
}, promiseInitTabs]: [State, PromiseInitTabs]) {
  const promiseInitHistory = getHistoryDataByWorker();
  const isSearching = lastSearchWord.length > 1;
  const compos = layoutPanes(options, isSearching);
  const store = initComponents(
    compos,
    options,
    settings,
    htmlHistory,
    promiseInitTabs,
    promiseInitHistory,
    lastSearchWord,
    isSearching,
  );
  setOptions(settings, options);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState, isSearching);
  toggleElement(!options.findTabsFirst, 'flex')('[data-value="find-in-tabs"]');
  toggleElement(options.findTabsFirst, 'flex')('[data-value="open-new-tab"]');
  setExternalUrl(options);
  setCloseApp();
  return store;
}

async function bootstrap() {
  const promiseInitTabs = getInitialTabs();
  return new Promise<[State, PromiseInitTabs]>((resolve) => {
    chrome.storage.local.get((state) => {
      if (document.readyState !== 'loading') {
        resolve([state as State, promiseInitTabs]);
        return;
      }
      document.addEventListener('DOMContentLoaded', () => {
        resolve([state as State, promiseInitTabs]);
      });
    });
  });
}

bootstrap().then(init);

// messaging add-on for background to popup
export const mapMessagesBtoP = {};
setMessageListener(mapMessagesBtoP, true);

// eslint-disable-next-line no-console
postMessage({ type: CliMessageTypes.initialize, payload: '(^^♪' }).then(console.info);
