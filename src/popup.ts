import './view/popup.css';

import {
  HtmlBookmarks,
  Settings,
  State,
  ClientState,
  StoredElements,
  PromiseInitTabs,
  CliMessageTypes,
  ColorPalette,
  BkgMessageTypes,
  PayloadAction,
  ApplyStyle,
  WindowModeInfo,
  initialState,
} from './types';

import {
  pipe,
  cssid,
  last,
  curry,
  preFaviconUrl,
  extractDomain,
  postMessage,
  getHistoryDataByWorker,
  setMessageListener,
} from './common';

import {
  $, $$,
  addStyle, addClass,
  initSplitWidth,
  addChild,
  setHTML,
  $byClass,
  toggleElement,
  $byTag,
  getPalettesHtml,
  getInitialTabs,
  setBrowserFavicon,
  createElement,
  hasClass,
  $$byClass,
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
import { HeaderRecentTabs, RecentTabs } from './recent-tabs';

export { makeAction, IPublishElement };

type Options = State['options'];

const params = new URLSearchParams(document.location.search);
const sheet = new CSSStyleSheet();
sheet.replace(params.get('css')!);
document.adoptedStyleSheets = [sheet];

const width = params.get('width') || 'unset';
const height = params.get('height') || 'unset';
const zoom = params.get('zoom') || 'unset';
Object.assign(document.body.style, { width, height, zoom });

function setOptions(settings: Settings, options: Options) {
  initSplitWidth(settings, options);

  if (options.showCloseTab) {
    addStyle('--show-close-tab', 'inline-block')($byTag('app-main')!);
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

function layoutPanes(options: Options, settings: Settings, isSearching: boolean) {
  const $appMain = $byTag<AppMain>('app-main');
  const $$colGrids = options.panes2
    .reduce((acc, pane) => {
      const [first, ...rest] = pane.map((name) => $byClass(name)!);
      const splited = rest.flatMap(($grid) => [createElement('div', { className: 'split-v' }), $grid]);
      const grid = createElement('div', { className: 'col-grid' });
      grid.append(first, ...splited);
      return [...acc, grid];
    }, [] as HTMLElement[]);
  pipe(
    last<HTMLElement>,
    addClass('end'),
    ($colGrid) => $byClass('pane-header', $colGrid),
    curry($byClass)('query-wrap'),
    ($el) => addChild($byClass('form-query')!)($el!),
  )($$colGrids);
  const [first, ...rest] = $$colGrids;
  const splited = rest.flatMap(($grid) => [createElement('div', { className: 'split-h' }), $grid]);
  $appMain.prepend(first, ...splited);
  const [left, right] = options.bookmarksPanes;
  const $bmLeft = $byClass(left)!;
  if (!hasClass($bmLeft.previousElementSibling!, 'header-bookmarks')) {
    const $bmLeftAfter = $bmLeft.nextElementSibling;
    const $bmRight = $byClass(right)!;
    $bmLeft.parentElement!.insertBefore($bmLeft, $bmRight);
    $bmLeft.parentElement!.insertBefore($bmRight, $bmLeftAfter);
  }
  // Bold Splitter
  const $boldTargets = $$('.col-grid:not(.end):has(.history), .col-grid:not(.end):has(.recent-tabs), .col-grid:not(.end):has(.leafs:last-child)');
  $boldTargets.map(($colGrid) => $colGrid.nextElementSibling).forEach(addClass('bold-separator'));
  $appMain.init(options, settings, isSearching);
  return $$('[is]', $appMain).reduce((acc, pane) => {
    const name = pane?.getAttribute('is');
    if (!name) {
      return acc;
    }
    return { ...acc, [name]: pane };
  }, { 'app-main': $appMain } as StoredElements);
}

function setFavThemeMenu(favColorPalettes: ColorPalette[]) {
  const html = getPalettesHtml(favColorPalettes);
  $('.end .pane-header:first-child .fav-color-themes')!.insertAdjacentHTML('beforeend', `<div class="menu-tree" role="menu">${html}</div>`);
}

function initWindowMode(options: Options, windowModeInfo: WindowModeInfo) {
  chrome.windows.getCurrent().then((win) => {
    // check exclusive runable
    if (windowModeInfo.popupWindowId !== win.id) {
      window.close();
    }
  });
  document.body.style.setProperty('width', '100%');
  addStyle({ display: 'none' })($byClass('resize-y'));
  setBrowserFavicon(options.colorPalette);
}

function setHeaderHeight() {
  const $$queryWrap = $$byClass('query-wrap');
  let headerHeight = 0;
  for (let i = ($$queryWrap.length - 1); i >= 0; i -= 1) {
    headerHeight = $$queryWrap[i].offsetHeight;
    if (headerHeight > 0) {
      const sheet2 = new CSSStyleSheet();
      sheet2.insertRule(`.pane-header { height: ${headerHeight}px; }`);
      sheet2.insertRule(`app-main>.split-h::before { height: ${headerHeight - 14}px; }`);
      document.adoptedStyleSheets = [sheet, sheet2];
      break;
    }
  }
}

function init([{ settings, options, ...states }, promiseInitTabs]: [State, PromiseInitTabs]) {
  const {
    htmlBookmarks,
    clientState,
    htmlHistory,
    lastSearchWord,
    toggleWindowOrder,
    pinWindows,
    windowModeInfo,
    windowStates,
  } = { ...initialState, ...states };
  if (options.windowMode) {
    initWindowMode(options, windowModeInfo);
  }
  const promiseInitHistory = getHistoryDataByWorker();
  const isSearching = options.restoreSearching && lastSearchWord.length > 1;
  const compos = layoutPanes(options, settings, isSearching);
  const components = initComponents(
    compos,
    options,
    settings,
    htmlHistory,
    promiseInitTabs,
    promiseInitHistory,
    lastSearchWord,
    isSearching,
    toggleWindowOrder,
    pinWindows,
    windowStates,
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
  setHeaderHeight();
  Promise.all([promiseInitTabs, promiseInitHistory]).then(setHeaderHeight);
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

const promiseStore = bootstrap().then(init);

// messaging add-on for background to popup
async function applyStyle({ payload }: PayloadAction<ApplyStyle>) {
  return promiseStore.then((store) => store.dispatch('applyStyle', payload, true));
}

export const mapMessagesBtoP = {
  [BkgMessageTypes.applyStyle]: applyStyle,
  [BkgMessageTypes.terminateWindowMode]: () => window.close() as unknown as Promise<void>,
};

setMessageListener(mapMessagesBtoP);

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
customElements.define('header-recent-tabs', HeaderRecentTabs, { extends: 'div' });
customElements.define('body-recent-tabs', RecentTabs, { extends: 'div' });

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
