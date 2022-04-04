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
} from './utils';

import { setEventListners } from './client-events';
import { resetHistory } from './vscroll';

type Options = State['options'];

function makeHtmlTabWithCloseBtn(
  prev: string,
  id: number,
  classProp: string,
  title: string,
  style: string,
  content: string,
) {
  return `
    ${prev}<div id="tab-${id}"${classProp} title="${title}" style="${style}">
      <span>${content}</span><i class="icon-x"></i>
    </div>
  `;
}

function makeHtmlTab(
  prev: string,
  id: number,
  classProp: string,
  title: string,
  style: string,
  content: string,
) {
  return `${prev}<div id="tab-${id}"${classProp} title="${title}" style="${style}"><span>${content}</span></div>`;
}

function setTabs(options: Options, currentWindowId: number) {
  const makeHtml = options.showCloseTab ? makeHtmlTabWithCloseBtn : makeHtmlTab;
  chrome.tabs.query({}, (tabs) => {
    const htmlByWindow = tabs.reduce((acc, tab) => {
      const { [tab.windowId]: prev = '', ...rest } = acc;
      const classProp = tab.active && tab.windowId === currentWindowId ? ' class="current-tab"' : '';
      const domain = extractDomain(tab.url);
      const title = `${tab.title}\n${domain}`;
      const style = makeStyleIcon(tab.url!);
      const html = makeHtml(prev, tab.id!, classProp, title, style, tab.title!);
      return { ...rest, [tab.windowId]: html };
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
  addRules('body, .bgcolor1', [['background-color', settings.frameBackgroundColor]]);
  addRules('.leafs, .pane-history, .pane-tabs > div', [['background-color', settings.paneBackgroundColor]]);
  addRules('.folders .open > .marker > .title, .current-tab', [
    ['background-color', settings.keyColor],
    ['color', settings.keyForeColor],
  ]);
  addRules('.pin-bookmark:hover > .icon-fa-star-o', [['color', settings.keyColor]]);
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

function repaleceHtml(html: HtmlBookmarks) {
  $('.leafs')!.innerHTML = html.leafs;
  const $folders = $('.folders')!;
  $folders.innerHTML = html.folders;
  ($('.folders .open') as any)?.scrollIntoViewIfNeeded();
}

function setClientState(clState: ClientState) {
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
  setTabs(options, currentWindowId);
  setOptions(settings, options);
  repaleceHtml(htmlBookmarks);
  $<HTMLDivElement>('.pane-history')!.firstElementChild!.innerHTML = htmlHistory;
  setClientState(clientState);
  resetHistory({ initialize: true });
  toggleElement('[data-value="find-in-tabs"]', !options.findTabsFirst);
  toggleElement('[data-value="open-new-tab"]', options.findTabsFirst);
  setEventListners(options);
  setExternalUrl(options);
}

bootstrap(...getKeys(initialState)).then(init);
