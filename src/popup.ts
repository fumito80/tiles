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
import { refreshVScroll, resetHistory } from './vscroll';
import { resetQuery } from './search';
import {
  $, $$,
  addStyle, addClass, toggleClass,
  setSplitWidth,
  hasClass,
  addChild,
  setHTML, insertHTML,
  $$byClass, $byClass, $byTag,
  recoverMinPaneWidth,
  setTabs,
  toggleElement,
} from './client';
import { initStore } from './store';
import {
  HeaderTabs,
  OpenTab, Tabs, Window, WindowHeader,
} from './tabs';

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
  }, {});
}

function init({
  settings, htmlBookmarks, clientState, options, currentWindowId, htmlHistory,
}: State) {
  const store = initStore(layoutPanes(options), options);
  setOptions(settings, options);
  setTabs(store, currentWindowId, options.collapseTabs);
  setHistory($byClass('histories')!.firstElementChild as HTMLElement, htmlHistory);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState);
  toggleElement(!options.findTabsFirst, 'flex')('[data-value="find-in-tabs"]');
  toggleElement(options.findTabsFirst, 'flex')('[data-value="open-new-tab"]');
  setEventListners(store, options);
  setExternalUrl(options);
  resetQuery(settings.includeUrl);
  resetHistory({ initialize: true }).then(refreshVScroll);
}

bootstrap(...getKeys(initialState)).then(init);

export const mapMessagesBtoP = {
  [BkgMessageTypes.updateHistory]: resetHistory,
};

setMessageListener(mapMessagesBtoP, true);

customElements.define('open-tab', OpenTab);
customElements.define('open-window', Window);
customElements.define('window-header', WindowHeader);
customElements.define('body-tabs', Tabs, { extends: 'div' });
customElements.define('header-tabs', HeaderTabs, { extends: 'div' });
