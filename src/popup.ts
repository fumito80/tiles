import './popup.scss';

import {
  HtmlBookmarks,
  ISettings,
  IState,
  Model,
} from './types';

import {
  $,
  cbToResolve,
  curry,
  addRules,
  makeStyleIcon,
} from './utils';

import { setEventListners } from './client-events';
import { setVScroll, rowSetterHistory } from './vscroll';

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

function setOptions(settings: ISettings) {
  addRules('body', [
    ['width', `${settings.width}px`],
    ['height', `${settings.height}px`],
    ['background-color', settings.bodyBackgroundColor],
    ['color', settings.bodyColor],
  ]);
  const gridCols = [
    'min-content',
    `${settings.grid1Width}px`,
    'min-content',
    `${settings.grid2Width}px`,
    'min-content',
    `${settings.grid3Width}px`,
    'min-content',
    '1fr',
  ];
  addRules('main', [['gridTemplateColumns', gridCols.join(' ')]]);
  addRules('.leafs, .pane-history, .pane-tabs > div', [['background-color', settings.leafsBackgroundColor]]);
  addRules('.folders .open > .marker > .title', [['background-color', settings.keyColor]]);
  addRules('.bookmark-button:hover > .fa-star-o', [['color', settings.keyColor]]);
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

async function init({
  settings, htmlBookmarks, htmlHistory, histories,
}: IState) {
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  setOptions(settings);
  repaleceHtml(htmlBookmarks);
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  $paneHistory.firstElementChild!.innerHTML = htmlHistory;
  setVScroll($paneHistory, rowSetterHistory, histories);
}

const keys: Array<keyof IState> = [
  'settings',
  'htmlBookmarks',
  'htmlTabs',
  'htmlHistory',
  'histories',
];

chrome.storage.local.get(keys, init as (items: Model) => Promise<void>);
