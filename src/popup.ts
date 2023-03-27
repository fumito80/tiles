/* eslint-disable import/prefer-default-export */

import './view/popup.scss';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  StoredElements,
  PromiseInitTabs,
  CliMessageTypes,
  ColorPalette,
} from './types';

import {
  pipe,
  cssid,
  getGridColStart,
  last,
  filter,
  curry,
  preFaviconUrl,
  extractDomain,
  postMessage,
  getHistoryDataByWorker,
} from './common';

import {
  $, $$,
  addStyle, addClass,
  initSplitWidth,
  hasClass,
  addChild,
  setHTML,
  $$byClass, $byClass,
  toggleElement,
  $byTag,
  getPalettesHtml,
  getInitialTabs,
} from './client';
import { AppMain } from './app-main';
import { HeaderLeafs, Leaf, Leafs } from './bookmarks';
import { Folders } from './folders';
import {
  HeaderTabs, OpenTab, Tabs, Window, WindowHeader,
} from './tabs';
import { FormSearch } from './search';
import { HeaderHistory, History, HistoryItem } from './history';
import { MultiSelPane, PopupMenu } from './multi-sel-pane';
import ModalDialog, { DialogContent } from './dialogs';
import { storeMapping } from './store-mapping';
import {
  ActionValue, initComponents, IPublishElement, makeAction,
} from './store';

export { makeAction, IPublishElement };

type Options = State['options'];

const params = new URLSearchParams(document.location.search);
const sheet = document.head.appendChild(document.createElement('style'));
sheet.textContent = params.get('css');

function setOptions(settings: Settings, options: Options) {
  initSplitWidth(settings, options);

  if (options.showCloseTab) {
    addStyle('--show-close-tab', 'inline-block')($byClass('tabs')!);
  }
  if (options.showDeleteHistory) {
    addStyle('--show-delete-history', 'inline-block')($byClass('histories')!);
  }
  if (!options.showSwitchTabsWin) {
    $byClass('win-prev')!.remove();
    $byClass('win-next')!.remove();
  }
}

function setExternalUrl(options: Options) {
  if (!options.enableExternalUrl || !options.externalUrl) {
    return;
  }
  const [schema, domain] = extractDomain(options.externalUrl);
  pipe(
    addStyle('--external-url-image', `url(${preFaviconUrl}${schema}${domain})`),
    addStyle('--external-url', 'hidden'),
  )($byClass('form-query')!);
}

function setBookmarks(html: HtmlBookmarks) {
  setHTML(html.leafs)($byClass('leafs')!);
  setHTML(html.folders)($byClass('folders')!);
  ($('.folders .open') as any)?.scrollIntoViewIfNeeded();
}

function setBookmarksState(clState: ClientState, isSearching: boolean) {
  clState.paths?.map((id) => $(`.folders ${cssid(id)}`)).forEach(addClass('path'));
  if (clState.open) {
    if (isSearching) {
      $(`.folders ${cssid(clState.open)}`)?.classList.add('open');
    } else {
      $$(cssid(clState.open)).forEach(addClass('open'));
    }
  }
}

function getPanes(panes: Options['panes'], bookmarksPanes: Options['bookmarksPanes'], prefix = '') {
  return panes
    .reduce<string[]>((acc, name) => acc.concat(name === 'bookmarks' ? bookmarksPanes : name), [])
    .map((name) => $byClass(prefix + name)!);
}

function layoutPanes(options: Options, isSearching: boolean) {
  const $appMain = $byTag('app-main') as AppMain;
  const $headers = getPanes(options.panes, ['leafs', 'folders'], 'header-');
  const $bodies = getPanes(options.panes, options.bookmarksPanes);
  $appMain.prepend(...$headers, ...$bodies);
  pipe(
    filter((el) => !hasClass(el, 'header-folders')),
    last,
    addClass('end'),
    curry($byClass)('query-wrap'),
    ($el) => addChild($byClass('form-query')!)($el!),
  )($headers);
  addClass('end')(last($bodies));
  // Bold Splitter
  const $leafs = $('.histories + .leafs, .histories + .tabs');
  if ($leafs) {
    const gridColStart = getGridColStart($leafs);
    const $splitter = $$byClass('split-h')[gridColStart - 1];
    addClass('bold-separator')($splitter);
  }
  $appMain.init(options, isSearching);
  return [...$headers, ...$bodies].reduce((acc, pane) => {
    const name = pane.getAttribute('is');
    if (!name) {
      return acc;
    }
    return { ...acc, [name]: pane };
  }, { 'app-main': $appMain } as StoredElements);
}

function setFavThemeMenu(favColorPalettes: ColorPalette[]) {
  const html = getPalettesHtml(favColorPalettes);
  $('.pane-header.end .fav-color-themes')!.insertAdjacentHTML('beforeend', `<div class="menu-tree" role="menu">${html}</div>`);
}

function initWindowMode() {
  document.body.style.setProperty('width', '100%');
  document.body.style.setProperty('height', 'calc(100vh - 5px)');
  addStyle({ 'pointer-events': 'none' })($byClass('resize-y'));
}

function init([{
  settings,
  htmlBookmarks,
  clientState,
  options,
  htmlHistory,
  lastSearchWord,
  toggleWindowOrder,
  pinWindows,
}, promiseInitTabs]: [State, PromiseInitTabs]) {
  if (options.windowMode) {
    initWindowMode();
  }
  const promiseInitHistory = getHistoryDataByWorker();
  const isSearching = options.restoreSearching && lastSearchWord.length > 1;
  const compos = layoutPanes(options, isSearching);
  const components = initComponents(
    compos,
    options,
    settings,
    htmlHistory,
    promiseInitTabs,
    promiseInitHistory,
    lastSearchWord,
    isSearching,
    toggleWindowOrder ?? false,
    pinWindows,
  );
  const store = storeMapping(options, components);
  setOptions(settings, options);
  setBookmarks(htmlBookmarks);
  setBookmarksState(clientState, isSearching);
  toggleElement(!options.findTabsFirst, 'flex')('[data-value="find-in-tabs"]');
  toggleElement(options.findTabsFirst, 'flex')('[data-value="open-new-tab"]');
  setExternalUrl(options);
  if (!isSearching) {
    // v-scroll initialize
    store.dispatch('resetHistory');
  }
  setFavThemeMenu(options.favColorPalettes);
  return store;
}

async function bootstrap() {
  const promiseInitTabs = getInitialTabs();
  return new Promise<[State, PromiseInitTabs]>((resolve) => {
    chrome.storage.local.get((state) => {
      if (document.readyState !== 'loading') {
        resolve([state as State, promiseInitTabs]);
        return;
      }
      document.addEventListener('DOMContentLoaded', () => {
        resolve([state as State, promiseInitTabs]);
      });
    });
  });
}

bootstrap().then(init);

// messaging add-on for background to popup
export const mapMessagesBtoP = {};
// setMessageListener(mapMessagesBtoP, true);

postMessage({ type: CliMessageTypes.initialize, payload: '(^^♪' })
  // eslint-disable-next-line no-console
  .then(console.info)
  .then(() => chrome.runtime.connect({ name: 'popup' }));

customElements.define('app-main', AppMain);
customElements.define('header-leafs', HeaderLeafs, { extends: 'div' });
customElements.define('body-leafs', Leafs, { extends: 'div' });
customElements.define('body-folders', Folders, { extends: 'div' });
customElements.define('open-tab', OpenTab);
customElements.define('open-window', Window);
customElements.define('window-header', WindowHeader);
customElements.define('body-tabs', Tabs, { extends: 'div' });
customElements.define('header-tabs', HeaderTabs, { extends: 'div' });
customElements.define('form-search', FormSearch, { extends: 'form' });
customElements.define('body-history', History, { extends: 'div' });
customElements.define('header-history', HeaderHistory, { extends: 'div' });
customElements.define('history-item', HistoryItem);
customElements.define('bm-leaf', Leaf);
customElements.define('multi-sel-pane', MultiSelPane);
customElements.define('popup-menu', PopupMenu);
customElements.define('dialog-content', DialogContent);
customElements.define('modal-dialog', ModalDialog, { extends: 'dialog' });

export type Store = ReturnType<typeof init>;
export type StoreSub = Pick<Store, 'dispatch' | 'getStates'>;
export type Dispatch = Store['dispatch'];
export type Subscribe = Store['subscribe'];
export type StoreActions = Store['actions'];
export type GetStates = Store['getStates'];
export type States = Parameters<Parameters<Subscribe>[1]>[2];
export type ActionNames = keyof Store['actions'];
export type InitValue<T extends ActionNames> = ActionValue<StoreActions[T]>;
export type Changes<T extends ActionNames> = {
  newValue: InitValue<T>, oldValue: InitValue<T>, isInit: boolean,
};

export interface ISubscribeElement {
  connect(store: Store): void;
}

export interface IPubSubElement extends IPublishElement {
  connect(store: Store): void;
}
