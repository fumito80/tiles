/* eslint-disable import/prefer-default-export */

import './css/popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  initialState,
  BkgMessageTypes,
  storedElements,
} from './types';

import {
  pipe,
  cssid,
  bootstrap,
  getKeys,
  getColorWhiteness,
  lightColorWhiteness,
  setMessageListener,
  getGridColStart,
  camelToSnake,
  last,
  filter,
  curry,
} from './common';

import setEventListners from './client-events';
import {
  $, $$,
  addStyle, addClass, toggleClass,
  setSplitWidth,
  hasClass,
  addChild,
  setHTML,
  $$byClass, $byClass, $byTag,
  recoverMinPaneWidth,
  toggleElement,
} from './client';
import { initComponents } from './store';

type Options = State['options'];

function setOptions(settings: Settings, options: Options) {
  pipe(
    addStyle('width', `${settings.width}px`),
    addStyle('height', `${settings.height}px`),
  )(document.body);

  const [themeDarkPane, themeDarkFrame, themeDarkHover, themeDarkSearch, themeDarkKey] = options
    .colorPalette
    .map((code) => getColorWhiteness(code))
    .map((whiteness) => whiteness <= lightColorWhiteness);

  const $main = $byTag('main');
  Object.entries({
    themeDarkPane,
    themeDarkFrame,
    themeDarkHover,
    themeDarkSearch,
    themeDarkKey,
    autoZoom: settings.autoZoom,
    checkedIncludeUrl: settings.includeUrl,
  }).forEach(([key, enabled]) => toggleClass(camelToSnake(key), enabled)($main));

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
  pipe(
    addStyle('--external-url-image', `url("chrome://favicon/${options.externalUrl}")`),
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

function layoutPanes(options: Options): storedElements {
  const panes = options.panes.reduce<string[]>(
    (acc, name) => (name === 'bookmarks' ? [...acc, 'leafs', 'folders'] : [...acc, name]),
    [],
  );
  const $headers = panes.map((name) => $byClass(`header-${name}`));
  const $bodies = panes.map((name) => $byClass(name));
  $byTag('main').prepend(...$headers, ...$bodies);
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
  return [...$headers, ...$bodies].reduce((acc, pane) => {
    const name = pane.getAttribute('is');
    if (!name) {
      return acc;
    }
    return { ...acc, [name]: pane };
  }, {} as storedElements);
}

function init({
  settings, htmlBookmarks, clientState, options, htmlHistory,
}: State) {
  const compos = layoutPanes(options);
  const store = initComponents(compos, options, settings, htmlHistory);
  setOptions(settings, options);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState);
  toggleElement(!options.findTabsFirst, 'flex')('[data-value="find-in-tabs"]');
  toggleElement(options.findTabsFirst, 'flex')('[data-value="open-new-tab"]');
  setEventListners(options);
  setExternalUrl(options);
  return store;
}

const promiseStore = bootstrap(...getKeys(initialState)).then(init);

function resetHistory() {
  promiseStore.then((store) => store.dispatch('resetHistory', {}, true));
}

export const mapMessagesBtoP = {
  [BkgMessageTypes.updateHistory]: resetHistory,
};

setMessageListener(mapMessagesBtoP, true);
