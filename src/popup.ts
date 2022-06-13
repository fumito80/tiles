/* eslint-disable import/prefer-default-export */

import './css/popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  initialState,
  BkgMessageTypes,
} from './types';

import {
  $, $$,
  addStyle, addClass, toggleClass,
  cssid,
  setSplitWidth,
  bootstrap,
  getKeys,
  getColorWhiteness,
  lightColorWhiteness,
  setMessageListener,
  setHTML, insertHTML,
  getGridColStart,
  $$byClass, $byClass, $byTag,
  pipe,
  recoverMinPaneWidth,
  camelToSnake,
  last,
  hasClass,
} from './common';

import setEventListners from './client-events';
import { refreshVScroll, resetHistory } from './vscroll';
import { resetQuery } from './search';
import { setTabs } from './client';

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
    tabsCollapsedAll: options.collapseTabs,
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

function toggleElement(selector: string, isShow = true, shownDisplayType = 'block') {
  const display = isShow ? shownDisplayType : 'none';
  addStyle({ display })($(selector));
}

function setHistory($target: HTMLElement, htmlHistory: string) {
  insertHTML('afterbegin', htmlHistory)($target);
}

function layoutPanes(options: Options) {
  const panes = options.panes.reduce<string[]>(
    (acc, name) => (name === 'bookmarks' ? [...acc, 'leafs', 'folders'] : [...acc, name]),
    [],
  );
  const $headers = panes.map((name) => $byClass(`header-${name}`));
  const $bodies = panes.map((name) => $byClass(name));
  const $main = $byTag('main');
  [...$headers, ...$bodies].reverse().map((el) => $main.insertAdjacentElement('afterbegin', el));
  const $endHeader = last($headers.filter((el) => !hasClass(el, 'header-folders')));
  $byClass('query-wrap', $endHeader)!.append($byClass('form-query')!);
  addClass('end')($endHeader);
  addClass('end')(last($bodies));
  // History pane
  const $histories = $byClass('histories');
  addClass('v-scroll')($histories);
  // Bold Splitter
  const $leafs = $('.histories + .leafs, .histories + .tabs');
  if ($leafs) {
    const gridColStart = getGridColStart($leafs);
    const $splitter = $$byClass('split-h')[gridColStart - 1];
    addClass('bold-separator')($splitter);
  }
}

function init({
  settings, htmlBookmarks, clientState, options, currentWindowId, htmlHistory,
}: State) {
  layoutPanes(options);
  setOptions(settings, options);
  setTabs(currentWindowId, options.collapseTabs);
  setHistory($byClass('histories')!.firstElementChild as HTMLElement, htmlHistory);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState);
  toggleElement('[data-value="find-in-tabs"]', !options.findTabsFirst, 'flex');
  toggleElement('[data-value="open-new-tab"]', options.findTabsFirst, 'flex');
  setEventListners(options);
  setExternalUrl(options);
  resetQuery(settings.includeUrl);
  resetHistory({ initialize: true }).then(refreshVScroll);
}

bootstrap(...getKeys(initialState)).then(init);

export const mapMessagesBtoP = {
  [BkgMessageTypes.updateHistory]: resetHistory,
};

setMessageListener(mapMessagesBtoP, true);
