import './popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  initialState,
} from './types';

import {
  $,
  $$,
  addRules,
  makeStyleIcon,
  cssid,
  setSplitWidth,
  bootstrap,
  getKeys,
  extractDomain,
  getColorWhiteness,
} from './utils';

import { makeTab } from './html';
import { setEventListners } from './client-events';
import { resetHistory } from './vscroll';

type Options = State['options'];

function setTabs(currentWindowId: number) {
  chrome.tabs.query({}, (tabs) => {
    const htmlByWindow = tabs.reduce((acc, tab) => {
      const { [tab.windowId]: prev = '', ...rest } = acc;
      const addClass = tab.active && tab.windowId === currentWindowId ? 'current-tab' : '';
      const domain = extractDomain(tab.url);
      const title = `${tab.title}\n${domain}`;
      const style = makeStyleIcon(tab.url!);
      const htmlTabs = makeTab(tab.id!, addClass, title, style, tab.title!);
      return { ...rest, [tab.windowId]: prev + htmlTabs };
    }, {} as { [key: number]: string });
    const { [currentWindowId]: currentTabs, ...rest } = htmlByWindow;
    const html = Object.entries(rest).map(([key, value]) => `<div id="win-${key}">${value}</div>`).join('');
    $('.pane-tabs')!.innerHTML = `<div id="win-${currentWindowId}">${currentTabs}</div>${html}`;
  });
}

function setOptions(settings: Settings, options: Options) {
  addRules('body', [
    ['width', `${settings.width}px`],
    ['height', `${settings.height}px`],
    ['color', settings.bodyColor],
  ]);
  const lightColor = '#efefef';
  const darkColor = '#222222';
  const [
    [paneBg, paneColor, isLightPaneBg],
    [searchingBg, searchingColor],
    [frameBg],
    [itemHoverBg, itemHoverColor, isLightHoverBg],
    [keyBg, keyColor, isLightKeyBg],
  ] = options.colorPalette
    .map((code) => [`#${code}`, getColorWhiteness(code)])
    .map(([bgColor, whiteness]) => [bgColor, whiteness > 0.6] as [string, boolean])
    .map(([bgColor, isLight]) => [bgColor, isLight ? darkColor : lightColor, isLight]);
  addRules('.leafs, .pane-history, .pane-tabs > div', [['background-color', paneBg], ['color', paneColor]]);
  addRules('body, .bgcolor1', [['background-color', frameBg]]);
  addRules('.folders .open > .marker > .title, .current-tab, .current-tab > .icon-x::before', [
    ['background-color', keyBg],
    ['color', keyColor],
  ]);
  addRules('.folders .open > .marker > .title::before', [['color', isLightKeyBg ? 'rgba(0, 0, 0, 0.5)' : '#EFEFEF']]);
  addRules('.pin-bookmark:hover > .icon-fa-star-o', [['color', keyBg]]);
  addRules('.query:not([value=""])', [['background-color', searchingBg], ['color', searchingColor]]);
  addRules('.form-query .icon-x', [['color', searchingColor]]);
  addRules(
    '.leaf:hover, .folders .marker:hover::before, .pane-tabs > div > div:not(.current-tab):hover, .pane-history .rows > div:not(.header-date):hover',
    [['background-color', itemHoverBg], ['color', itemHoverColor]],
  );
  if (!isLightPaneBg) {
    addRules('.leafs::-webkit-scrollbar-thumb, .v-scroll-bar::-webkit-scrollbar-thumb', [['background-color', 'dimgray']]);
    addRules('.leafs::-webkit-scrollbar-thumb:hover, .v-scroll-bar::-webkit-scrollbar-thumb:hover', [['background-color', 'darkgray']]);
    addRules('.leafs .title::before', [['color', lightColor]]);
  }
  if (!isLightHoverBg) {
    addRules('.folders .marker:hover > .title, .folders .marker:hover > .title::before', [['color', itemHoverColor]]);
  }
  if (options.showCloseTab) {
    addRules('.pane-tabs > div > div:hover > i', [['display', 'inline-block']]);
  }
  if (options.showCloseHistory) {
    addRules('.pane-history > div > div:not(.header-date):hover > i', [['display', 'inline-block']]);
  }
  setSplitWidth(settings.paneWidth);
  const [sheet] = document.styleSheets;
  options.css
    .replaceAll('\n', '').trim()
    .split('}')
    .filter(Boolean)
    .map((rule) => rule.trim().concat('}'))
    .forEach((rule) => sheet.insertRule(rule.trim(), sheet.cssRules.length));
}

function setExternalUrl(options: Options) {
  if (!options.enableExternalUrl || !options.externalUrl) {
    return;
  }
  addRules('.query:not([value=""]) + button > i', [['visibility', 'hidden']]);
  addRules('.query:not([value=""])', [
    ['background-image', `url("chrome://favicon/${options.externalUrl}")`],
    ['background-repeat', 'no-repeat'],
    ['background-position', '6px center'],
  ]);
}

function setBookmarks(html: HtmlBookmarks) {
  $('.leafs')!.innerHTML = html.leafs;
  const $folders = $('.folders')!;
  $folders.innerHTML = html.folders;
  ($('.folders .open') as any)?.scrollIntoViewIfNeeded();
}

function setBookmarksState(clState: ClientState) {
  clState.paths?.forEach((id) => $(`.folders ${cssid(id)}`)?.classList.add('path'));
  if (clState.open) {
    $$(cssid(clState.open))?.forEach((el) => el.classList.add('open'));
  }
}

function toggleElement(selector: string, isShow = true, shownDisplayType = 'block') {
  $(selector)?.style.setProperty('display', isShow ? shownDisplayType : 'none');
}

function init({
  settings, htmlBookmarks, htmlHistory, clientState, options, currentWindowId,
}: State) {
  setTabs(currentWindowId);
  setOptions(settings, options);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState);
  $<HTMLDivElement>('.pane-history')!.firstElementChild!.innerHTML = htmlHistory;
  resetHistory({ initialize: true });
  toggleElement('[data-value="find-in-tabs"]', !options.findTabsFirst);
  toggleElement('[data-value="open-new-tab"]', options.findTabsFirst);
  setEventListners(options);
  setExternalUrl(options);
}

bootstrap(...getKeys(initialState)).then(init);
