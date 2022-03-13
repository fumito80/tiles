import './popup.scss';

import {
  // startTime,
  // IClientState,
  // IHtml,
  HtmlBookmarks,
  ISettings,
  IState,
  // CliMessageTypes,
  // OpenBookmarkType,
  // EditBookmarkType,
  // dropClasses,
} from './types';

import {
  $,
  // $$,
  // cssid,
  // postMessage,
  cbToResolve,
  // swap,
  curry,
  // setEvents,
  // pipe,
  // whichClass,
  // getParentElement,
  addRules,
  makeStyleIcon,
  // makeHistoryRow,
} from './utils';

import { setEventListners } from './client-events';
import setVScroll from './vscroll';

// function makeHistoryRow(item: chrome.history.HistoryItem) {
//   const dt = item.lastVisitTime ? `\n${(new Date(item.lastVisitTime)).toLocaleString()}` : '';
//   const style = makeStyleIcon(item.url!);
//   return `<div id="hst-${item.id}" title="${item.title}${dt}" style="${style}">${item.title}</div>`;
// }

// function setHistory({ historyMax: { rows } }: IState['settings']) {
//   chrome.history.search({ text: '', maxResults: rows, startTime }, (items) => {
//     const $paneHistory = $('.pane-history')!;
//     let displayRows = items.map(makeHistoryRow);
//     if (displayRows.length === rows) {
//       const maxDisplayRow = `<div class="limit" ${displayRows[rows - 1].substring(4)}`;
//       displayRows = [...displayRows.slice(0, rows - 1), maxDisplayRow];
//       chrome.history.search({ text: '', maxResults: 99999, startTime }, (itemsAll) => {
//         const remainRows = itemsAll.slice(rows).map(makeHistoryRow);
//         $paneHistory.insertAdjacentHTML('beforeend', remainRows.join(''));
//       });
//     }
//     $paneHistory.innerHTML = displayRows.join('');
//   });
// }

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

// function addRemainsHistory({ historyMax: { rows } }: IState['settings']) {
//   chrome.history.search({ text: '', maxResults: 99999, startTime }, (itemsAll) => {
//     const remainRows = itemsAll.slice(rows).map(makeHistoryRow);
//     $('#tmpl-history')!.insertAdjacentHTML('beforeend', remainRows.join(''));
//   });
// }

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
  // if (settings.history) {
  //   setHistory(settings);
  // }
  // addRemainsHistory(settings);
  setEventListners();
}

function repaleceHtml(html: HtmlBookmarks) {
  $('.leafs')!.innerHTML = html.leafs;
  const $folders = $('.folders')!;
  $folders.innerHTML = html.folders;
  // $folders.append(...$(cssid(1), $folders)!.children);
  // $folders.append(...$$(`.folder:not(${cssid(1)})`, $folders));
  // $(cssid(0), $folders)!.remove();
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
  // $('.pane-tabs')!.innerHTML = htmlTabs;
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  $paneHistory.firstElementChild!.innerHTML = htmlHistory;
  setVScroll($paneHistory, histories);
}

// const { options, html, clState } = await postMessage({ type: CliMessageTypes.initialize });

type TT = Parameters<Parameters<typeof chrome.storage.local.get>[1]>[0];

const keys: Array<keyof IState> = [
  'settings',
  'htmlBookmarks',
  'htmlTabs',
  'htmlHistory',
  'histories',
];

chrome.storage.local.get(keys, init as (items: TT) => Promise<void>);

// setOptions(options);
// repaleceHtml(html);
// setClientState(clState);
// eslint-disable-next-line no-use-before-define
// setEventListners();
// init();
