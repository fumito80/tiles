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
  $,
  $$,
  addRules,
  addClass,
  cssid,
  setSplitWidth,
  bootstrap,
  getKeys,
  getColorWhiteness,
  lightColorWhiteness,
  setMessageListener,
  setHTML,
  addStyle,
  insertHTML,
  getGridColStart,
  $$byClass,
  $byClass,
  $byTag,
  pipe,
  toggleClass,
  recoverMinPaneWidth,
} from './common';

import setEventListners from './client-events';
import { refreshVScroll, resetHistory } from './vscroll';
import { resetQuery } from './search';
import { setTabs } from './client';

type Options = State['options'];

const lightColor = '#efefef';
const darkColor = '#222222';

function setOptions(settings: Settings, options: Options) {
  addRules('body', [
    ['width', `${settings.width}px`],
    ['height', `${settings.height}px`],
    ['color', settings.bodyColor],
  ]);
  const $main = $byTag('main')!;
  const [
    [paneBg, paneColor, isLightPaneBg],
    [frameBg, frameColor, isLightFrameBg],
    [itemHoverBg, itemHoverColor, isLightHoverBg],
    [searchingBg, searchingColor, isLightSearchingBg],
    [keyBg, keyColor, isLightKeyBg],
  ] = options.colorPalette
    .map((code) => [`#${code}`, getColorWhiteness(code)])
    .map(([bgColor, whiteness]) => [bgColor, whiteness > lightColorWhiteness] as [string, boolean])
    .map(([bgColor, isLight]) => [bgColor, isLight ? darkColor : lightColor, isLight]);
  addRules('.leafs, .histories, .tabs-wrap > div, .histories .rows .current-date, .histories .rows .current-date::before', [['background-color', paneBg], ['color', paneColor]]);
  addRules('body', [['background-color', frameBg]]);
  addRules('.folders', [['color', frameColor]]);
  addRules('.folders .open > .marker > .title, .current-tab, .current-tab > .icon-x::before', [
    ['background-color', keyBg],
    ['color', `${keyColor} !important`],
  ]);
  addRules('.folders .open > .marker > .title::before', [['color', isLightKeyBg ? 'rgba(0, 0, 0, 0.5) !important' : 'rgba(255, 255, 255, 0.8) !important']]);
  addRules('.pane-header .pin-bookmark:hover > .icon-fa-star-o', [['color', keyBg]]);
  addRules('.searching .form-query, .searching .form-query .query', [['background-color', searchingBg], ['color', searchingColor]]);
  addRules('.form-query .icon-x', [['color', searchingColor]]);
  // addRules('.tabs .window', [['border-color', searchingBg]]);
  // addRules('.tabs-header', [['color', searchingColor], ['background-color', searchingBg]]);
  addRules(
    [
      'main:not(.drag-start-leaf) .leaf:hover, main:not(.drag-start-folder) .folders .marker:not(.hilite):hover::before',
      'main:not(.drag-start-leaf) .tabs-wrap > div:not(.tabs-collapsed) > .tab-wrap:not(.tabs-header):not(.current-tab):hover',
      '.searching .tabs-wrap > div > .tab-wrap:not(.tabs-header):not(.current-tab):hover',
      'main:not(.drag-start-leaf) .histories .rows > .history:not(.header-date):hover',
      'main.date-collapsed:not(.drag-start-leaf) .header-date:hover',
      '.window:hover .tabs-header',
      '.tooltip',
    ].join(','),
    [['background-color', itemHoverBg], ['color', itemHoverColor]],
  );
  addRules('.shade-right:hover ~ .zoom-out, .shade-left:hover ~ .zoom-out', [['color', itemHoverBg]]);
  addRules('main:not(.drag-start-leaf):not(.searching) .tabs-wrap > div.tabs-collapsed > .tab-wrap:hover, main:not(.searching) .window:hover', [['border-color', itemHoverBg]]);
  addRules('.folders .marker:hover > .icon-fa-angle-right, main:not(.drag-start-folder) .folders .folder:not(.open) > .marker:not(.hilite):hover .title', [['color', itemHoverColor]]);
  addRules('main:not(.drag-start-folder) .folders .folder:not(.open) > .marker:hover > .title::before', [['color', isLightHoverBg ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)']]);
  if (options.showCloseTab) {
    addRules('.tabs-wrap > div > div:hover > i', [['display', 'inline-block']]);
  }
  if (options.showDeleteHistory) {
    addRules('.histories > div > div:not(.header-date):hover > i', [['display', 'inline-block']]);
  }
  if (!options.showSwitchTabsWin) {
    $byClass('win-prev').remove();
    $byClass('win-next').remove();
  }
  pipe(
    toggleClass('theme-dark-pane', !isLightPaneBg),
    toggleClass('theme-dark-frame', !isLightFrameBg),
    toggleClass('theme-dark-hover', !isLightHoverBg),
    toggleClass('theme-dark-search', !isLightSearchingBg),
    toggleClass('auto-zoom', settings.autoZoom),
    toggleClass('checked-include-url', settings.includeUrl),
    toggleClass('tabs-collapsed-all', options.collapseTabs),
  )($main);

  setSplitWidth(settings.paneWidth).then(recoverMinPaneWidth);
}

function setExternalUrl(options: Options) {
  if (!options.enableExternalUrl || !options.externalUrl) {
    return;
  }
  addRules('.searching .form-query .icon-fa-search', [['visibility', 'hidden']]);
  addRules('.searching .form-query', [
    ['background-image', `url("chrome://favicon/${options.externalUrl}")`],
    ['background-repeat', 'no-repeat'],
    ['background-position', '6px center'],
  ]);
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
  const $headers = $$byClass('pane-header');
  const $bodies = $$byClass('pane-body');
  const [,, [, $endHeader]] = options.panes
    .reduce<string[]>((acc, name) => {
      if (name === 'bookmarks') {
        return [...acc, 'leafs', 'folders'];
      }
      return [...acc, name];
    }, [])
    .map((name, i) => [name, $headers[i], $bodies[i]] as const)
    .map(([name, $paneHeader, $paneBody]) => {
      const header = `header-${name}`;
      $paneHeader.append(...$byClass(header)!.children);
      addClass(header)($paneHeader);
      addClass(name)($paneBody);
      const $body = $byClass(`body-${name}`);
      if ($body) {
        $paneBody.append(...$body.children);
      }
      return [name, $paneHeader] as const;
    })
    .filter(([name]) => name !== 'folders');
  $byClass('query-wrap', $endHeader)!.append($byClass('form-query')!);
  addClass('end')($endHeader);
  // History pane
  const $histories = $byClass('histories');
  // $histories?.append(...$byClass('body-histories')!.children);
  addClass('v-scroll')($histories);
  // Bold Splitter
  const $leafs = $('.histories + .leafs');
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
