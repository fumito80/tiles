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
  cbToResolve,
  curry,
  addRules,
  makeStyleIcon,
  cssid,
  setSplitWidth,
  getStorage,
  checkOptionExternalUrl,
} from './utils';

import { setEventListners } from './client-events';
import { resetHistory } from './vscroll';

function setTabs(currentWindowId: number) {
  chrome.tabs.query({}, (tabs) => {
    const htmlByWindow = tabs.reduce((acc, tab) => {
      const { [tab.windowId]: prev = '', ...rest } = acc;
      // const classProp = tab.active ? ' class="current-tab"' : '';
      const classProp = tab.active && tab.windowId === currentWindowId ? ' class="current-tab"' : '';
      const style = makeStyleIcon(tab.url!);
      const html = `${prev}<div id="tab-${tab.id}"${classProp} title="${tab.url}" style="${style}">${tab.title}</div>`;
      return { ...rest, [tab.windowId]: html };
    }, {} as { [key: number]: string });
    const { [currentWindowId]: currentTabs, ...rest } = htmlByWindow;
    const html = Object.entries(rest).map(([key, value]) => `<div id="win-${key}">${value}</div>`).join('');
    $('.pane-tabs')!.innerHTML = `<div id="win-${currentWindowId}">${currentTabs}</div>${html}`;
  });
}

function setOptions(settings: Settings) {
  addRules('body', [
    ['width', `${settings.width}px`],
    ['height', `${settings.height}px`],
    ['color', settings.bodyColor],
  ]);
  addRules('body, .bgcolor1', [['background-color', settings.frameBackgroundColor]]);
  addRules('.leafs, .pane-history, .pane-tabs > div', [['background-color', settings.paneBackgroundColor]]);
  addRules('.folders .open > .marker > .title', [['background-color', settings.keyColor]]);
  addRules('.bookmark-button:hover > .fa-star-o', [['color', settings.keyColor]]);
  setSplitWidth(settings.paneWidth);
}

function setExternalUrl(options: State['options']) {
  if (!checkOptionExternalUrl(options)) {
    return;
  }
  addRules('.query:not([value=""]) + button > i', [['visibility', 'hidden']]);
  addRules('.query:not([value=""])', [
    ['background-image', `url("chrome://favicon/${options.externalSearchUrl}")`],
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

async function init() {
  const storageKeys = Object.keys(initialState) as Array<keyof typeof initialState>;
  const {
    settings, htmlBookmarks, htmlHistory, clientState, options, currentWindowId,
  } = await getStorage(...storageKeys);
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  setTabs(currentWindowId);
  setOptions(settings);
  repaleceHtml(htmlBookmarks);
  $<HTMLDivElement>('.pane-history')!.firstElementChild!.innerHTML = htmlHistory;
  setClientState(clientState);
  resetHistory({ initialize: true });
  toggleElement('[data-value="find-in-tabs"]', !options.findTabsFirst);
  toggleElement('[data-value="open-new-tab"]', options.findTabsFirst);
  setEventListners(options);
  setExternalUrl(options);
}

init();
