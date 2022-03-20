import './popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  Model,
  initalState,
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
} from './utils';

import { setEventListners } from './client-events';
import { resetHistory } from './vscroll';

function setTabs() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([currentTab]) => {
    const { windowId, id } = currentTab;
    chrome.tabs.query({}, (tabs) => {
      const htmlByWindow = tabs.reduce((acc, tab) => {
        const { [tab.windowId]: prev = '', ...rest } = acc;
        const classProp = tab.id === id ? ' class="current-tab"' : '';
        const style = makeStyleIcon(tab.url!);
        const html = `${prev}<div id="tab-${tab.id}"${classProp} title="${tab.url}" style="${style}">${tab.title}</div>`;
        return { ...rest, [tab.windowId]: html };
      }, {} as { [key: number]: string });
      const { [windowId]: currentTabs, ...rest } = htmlByWindow;
      const html = Object.entries(rest).map(([key, value]) => `<div id="win-${key}">${value}</div>`).join('');
      $('.pane-tabs')!.innerHTML = `<div id="win-${windowId}">${currentTabs}</div>${html}`;
    });
  });
}

function setOptions(settings: Settings) {
  addRules('body', [
    ['width', `${settings.width}px`],
    ['height', `${settings.height}px`],
    ['background-color', settings.bodyBackgroundColor],
    ['color', settings.bodyColor],
  ]);
  addRules('.leafs, .pane-history, .pane-tabs > div', [['background-color', settings.leafsBackgroundColor]]);
  addRules('.folders .open > .marker > .title', [['background-color', settings.keyColor]]);
  addRules('.bookmark-button:hover > .fa-star-o', [['color', settings.keyColor]]);
  setSplitWidth(settings.paneWidth);
  if (settings.tabs) {
    setTabs();
  }
  if (settings.history) {
    setEventListners();
  }
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

async function init({
  settings, htmlBookmarks, htmlHistory, clientState,
}: State) {
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  setOptions(settings);
  repaleceHtml(htmlBookmarks);
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  $paneHistory.firstElementChild!.innerHTML = htmlHistory;
  setClientState(clientState);
  resetHistory({ initialize: true });
}

const storageKeys = Object.keys(initalState);

chrome.storage.local.get(storageKeys, init as (items: Model) => Promise<void>);
