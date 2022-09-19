/* eslint-disable import/prefer-default-export */

import './css/popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  BkgMessageTypes,
  StoredElements,
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
import { queryOptions } from './tabs';
import { AppMain } from './app-main';

type Options = State['options'];

function setOptions(settings: Settings, options: Options) {
  pipe(
    addStyle('width', `${settings.width}px`),
    addStyle('height', `${settings.height}px`),
  )(document.body);

  setSplitWidth(settings.paneWidth).then(recoverMinPaneWidth);

  if (options.showCloseTab) {
    addStyle('--show-close-tab', 'inline-block')($byClass('tabs'));
  }
  if (options.showDeleteHistory) {
    addStyle('--show-delete-history', 'inline-block')($byClass('histories'));
  }
  if (!options.showSwitchTabsWin) {
    $byClass('win-prev').remove();
    $byClass('win-next').remove();
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
  setHTML(html.leafs)($byClass('leafs'));
  setHTML(html.folders)($byClass('folders'));
  ($('.folders .open') as any)?.scrollIntoViewIfNeeded();
}

function setBookmarksState(clState: ClientState) {
  clState.paths?.map((id) => $(`.folders ${cssid(id)}`)).forEach(addClass('path'));
  if (clState.open) {
    $$(cssid(clState.open))?.forEach(addClass('open'));
  }
}

function layoutPanes(options: Options) {
  const $appMain = $byTag('app-main') as AppMain;
  const panes = options.panes.reduce<string[]>(
    (acc, name) => (name === 'bookmarks' ? [...acc, 'leafs', 'folders'] : [...acc, name]),
    [],
  );
  const $headers = panes.map((name) => $byClass(`header-${name}`));
  const $bodies = panes.map((name) => $byClass(name));
  $appMain.prepend(...$headers, ...$bodies);
  pipe(
    filter((el) => !hasClass(el, 'header-folders')),
    last,
    addClass('end'),
    curry($byClass)('query-wrap'),
    addChild($byClass('form-query')),
  )($headers);
  addClass('end')(last($bodies));
  // Bold Splitter
  const $leafs = $('.histories + .leafs, .histories + .tabs');
  if ($leafs) {
    const gridColStart = getGridColStart($leafs);
    const $splitter = $$byClass('split-h')[gridColStart - 1];
    addClass('bold-separator')($splitter);
  }
  $appMain.init(options);
  return [...$headers, ...$bodies].reduce((acc, pane) => {
    const name = pane.getAttribute('is');
    if (!name) {
      return acc;
    }
    return { ...acc, [name]: pane };
  }, { 'app-main': $appMain } as StoredElements);
}

function setCloseApp() {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }
    window.close();
  }, queryOptions);
}

function init({
  settings, htmlBookmarks, clientState, options, htmlHistory, lastSearchWord,
}: State) {
  const compos = layoutPanes(options);
  const store = initComponents(compos, options, settings, htmlHistory, lastSearchWord);
  setOptions(settings, options);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState);
  toggleElement(!options.findTabsFirst, 'flex')('[data-value="find-in-tabs"]');
  toggleElement(options.findTabsFirst, 'flex')('[data-value="open-new-tab"]');
  setExternalUrl(options);
  setCloseApp();
  return store;
}

async function bootstrap() {
  return new Promise<State>((resolve) => {
    chrome.storage.local.get(resolve);
  });
}

const promiseStore = bootstrap().then(init);

function resetHistory() {
  promiseStore.then((store) => store.dispatch('resetHistory', {}, true));
}

export const mapMessagesBtoP = {
  [BkgMessageTypes.updateHistory]: resetHistory,
};

setMessageListener(mapMessagesBtoP, true);
