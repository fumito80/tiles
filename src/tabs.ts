import { PaneHeader } from './bookmarks';
import {
  $$byClass, $$byTag, $byClass, $byTag,
  addClass, addStyle, hasClass, rmClass, rmStyle, setAnimationClass, showMenu, toggleClass,
} from './client';
import {
  addListener, extractDomain, extractUrl, htmlEscape, makeStyleIcon, pipe,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  IPubSubElement, ISubscribeElement, makeAction, Store,
} from './store';
import { PromiseInitTabs, State } from './types';

export async function smoothSroll($target: HTMLElement, scrollTop: number) {
  const $tabsWrap = $target.parentElement! as HTMLElement;
  const $parent = $tabsWrap.parentElement! as HTMLElement;
  const translateY = -(Math.min(
    scrollTop - $parent.scrollTop,
    $parent.scrollHeight - $parent.offsetHeight - $parent.scrollTop,
  ));
  if (Math.abs(translateY) <= 1) {
    return undefined;
  }
  const promise = new Promise<void>((resolve) => {
    $tabsWrap.addEventListener('transitionend', () => {
      rmClass('scroll-ease-in-out')($tabsWrap);
      rmStyle('transform')($tabsWrap);
      Object.assign($parent, { scrollTop });
      resolve();
    }, { once: true });
  });
  addClass('scroll-ease-in-out')($tabsWrap);
  addStyle('transform', `translateY(${translateY}px)`)($tabsWrap);
  return promise;
}

async function collapseTab(store: Store, $win: HTMLElement) {
  const promiseCollapse = new Promise<TransitionEvent>((resolve) => {
    $win.addEventListener('transitionend', resolve, { once: true });
  });
  toggleClass('tabs-collapsed')($win);
  await promiseCollapse;
  const { length } = $$byClass('tabs-collapsed');
  if (length === $win.parentElement!.children.length) {
    store.dispatch('collapseWindowsAll', true);
  } else if (length === 0) {
    store.dispatch('collapseWindowsAll', false);
  }
  const $tabs = $win.parentElement!.parentElement!;
  const winBottom = $win.offsetTop + $win.offsetHeight;
  const tabsBottom = $tabs.scrollTop + $tabs.offsetHeight;
  const isTopOver = $tabs.scrollTop <= $win.offsetTop;
  const isBottomUnder = tabsBottom > winBottom;
  if (isTopOver && isBottomUnder) {
    return;
  }
  const scrollTop = ($tabs.offsetHeight < $win.offsetHeight)
    ? $win.offsetTop
    : $tabs.scrollTop + (winBottom - tabsBottom);
  smoothSroll($win, scrollTop);
}

let promiseSwitchTabEnd = Promise.resolve();

async function switchTabWindow($tabs: HTMLElement, isNext: boolean) {
  if ($tabs.scrollHeight === $tabs.offsetHeight) {
    return;
  }
  promiseSwitchTabEnd = promiseSwitchTabEnd.then(() => new Promise((resolve) => {
    const tabsTop = isNext ? Math.ceil($tabs.scrollTop) : Math.floor($tabs.scrollTop) - 1;
    const tabsBottom = $tabs.scrollTop + $tabs.offsetHeight;
    const $current = ([...$tabs.firstElementChild!.children] as HTMLElement[])
      .map(($win) => ({
        $win,
        winTop: $win.offsetTop,
        winBottom: $win.offsetTop + $win.offsetHeight,
      }))
      .map(({ $win, winTop, winBottom }) => ({
        $win,
        winTop,
        winBottom,
        isTopIn: winTop >= tabsTop && winTop <= (tabsBottom + 5),
        isBottomIn: winBottom >= (tabsTop - 5) && winBottom <= tabsBottom,
      }))
      .find(({
        winTop, winBottom, isTopIn, isBottomIn,
      }) => (isNext && isTopIn && winBottom >= tabsBottom)
        || (!isNext && isBottomIn && winTop <= tabsTop)
        || (winTop <= tabsTop && winBottom >= tabsBottom));
    if (!$current) {
      resolve();
      return;
    }
    const { $win, winTop, winBottom } = $current;
    let $target = $win;
    if (winTop <= tabsTop && winBottom >= tabsBottom) {
      $target = (isNext ? $win.nextElementSibling : $win) as HTMLElement;
    }
    if (!$target) {
      resolve();
      return;
    }
    smoothSroll($target, $target.offsetTop).then(resolve);
  }));
}

export function getTabFaviconAttr(tab: chrome.tabs.Tab) {
  if (tab.favIconUrl) {
    const style = makeStyleIcon(tab.url!);
    return { style };
  }
  if (tab.url?.startsWith('file://')) {
    return {
      'data-initial': htmlEscape(tab.title!.substring(0, 1)),
      'data-file': 'yes',
      style: '',
    };
  }
  if (!tab.url?.startsWith('http')) {
    const style = makeStyleIcon(tab.url);
    return { style };
  }
  return {
    'data-initial': htmlEscape(tab.title!.substring(0, 1)),
    style: '',
  };
}

function getTooltip(tab: chrome.tabs.Tab) {
  if (tab.url?.startsWith('file:///')) {
    return `${tab.title}\n${tab.url}`;
  }
  const [scheme, domain] = extractDomain(tab.url);
  const schemeAdd = scheme.startsWith('https') ? '' : scheme;
  return `${tab.title}\n${schemeAdd}${domain}`;
}

export class OpenTab extends HTMLElement implements ISubscribeElement {
  #tabId!: number;
  private $main!: HTMLElement;
  private $tooltip!: HTMLElement;
  init(tab: chrome.tabs.Tab, lastSearchWord: string) {
    this.$main = $byTag('app-main');
    this.$tooltip = $byClass('tooltip', this);
    this.classList.toggle('unmatch', lastSearchWord.length > 1);
    this.#tabId = tab.id!;
    this.id = `tab-${tab.id}`;
    this.setCurrentTab(tab);
    const [$tab,, $tooltip] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    $tooltip.textContent = tooltip;
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
    addListener('click', this.gotoTab)(this);
    addListener('mouseover', this.setTooltipPosition)(this);
    return this;
  }
  getParentWindow() {
    // eslint-disable-next-line no-use-before-define
    return this.parentElement as Window;
  }
  setCurrentTab(tab: chrome.tabs.Tab) {
    this.classList.toggle('current-tab', tab.active);
  }
  gotoTab() {
    const { windowId } = this.getParentWindow();
    chrome.windows.update(windowId, { focused: true });
    chrome.tabs.update(this.#tabId, { active: true }, window.close);
  }
  closeTab(store: Store) {
    return (e: MouseEvent) => {
      e.stopPropagation();
      this.addEventListener('animationend', () => {
        chrome.tabs.remove(this.#tabId, () => {
          const { windowId } = this.getParentWindow();
          this.remove();
          store.dispatch('windowAction', { type: 'closeTab', windowId }, true);
        });
      }, { once: true });
      setAnimationClass('remove-hilite')(this);
    };
  }
  setTooltipPosition() {
    const rect = this.getBoundingClientRect();
    const rectTT = this.$tooltip.getBoundingClientRect();
    const rectMain = this.$main.getBoundingClientRect();
    const left = Math.min(
      rect.right - rectMain.left,
      rectMain.width - rectMain.left - rectTT.width - 5,
    );
    addStyle('left', `${Math.max(left, 5)}px`)(this.$tooltip);
    if (rect.bottom + rectTT.height > document.body.offsetHeight) {
      addStyle('top', `${rect.top - rectTT.height}px`)(this.$tooltip);
      return;
    }
    addStyle('top', `${rect.bottom}px`)(this.$tooltip);
  }
  connect(store: Store) {
    addListener('click', this.closeTab(store))($byClass('icon-x', this));
  }
}

export class WindowHeader extends HTMLElement implements ISubscribeElement {
  #windowId!: number;
  private $btnCollapseTabs!: HTMLElement;
  private $tabsMenu!: HTMLElement;
  init(windowId: number, tab: chrome.tabs.Tab) {
    this.$btnCollapseTabs = $byClass<HTMLButtonElement>('collapse-tab', this);
    this.$tabsMenu = $byClass('tabs-menu', this);
    this.#windowId = windowId;
    this.update(tab);
    pipe(
      addListener('click', showMenu(this.$tabsMenu)),
      addListener('mousedown', () => addStyle({ top: '-1000px' })(this.$tabsMenu)),
    )($byClass('tabs-menu-button', this));
    return this;
  }
  update(tab: chrome.tabs.Tab) {
    const [$iconIncognito, $tab] = [...this.children] as HTMLElement[];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    toggleClass('show', tab.incognito)($iconIncognito);
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
  }
  connect(store: Store) {
    const windowId = this.#windowId;
    this.$btnCollapseTabs.addEventListener('click', () => {
      store.dispatch('windowAction', { type: 'collapseWindow', windowId }, true);
    });
    pipe(
      addListener('click', (e) => {
        const $target = e.target as HTMLElement;
        switch ($target.dataset.value) {
          case 'add-new-tab': {
            chrome.tabs.create({ windowId: this.#windowId });
            chrome.windows.update(this.#windowId, { focused: true }, window.close);
            break;
          }
          case 'close-window':
            store.dispatch('windowAction', { type: 'closeWindow', windowId }, true);
            break;
          default:
        }
      }),
      addListener('mousedown', (e) => e.preventDefault()),
    )(this.$tabsMenu);
  }
}

export class Window extends HTMLElement implements ISubscribeElement {
  #windowId!: number;
  #store!: Store;
  #lastSearchWord: string = '';
  private $tmplTab!: OpenTab;
  private readonly $header = this.firstElementChild as WindowHeader;
  init(
    windowId: number,
    tmplTab: OpenTab,
    [firstTab, ...rest]: chrome.tabs.Tab[],
    collapseTabs: boolean,
    lastSearchWord: string,
    isCurrent: boolean,
  ) {
    this.switchCollapseIcon(collapseTabs);
    this.#windowId = windowId;
    this.$tmplTab = tmplTab;
    this.#lastSearchWord = lastSearchWord;
    this.id = `win-${windowId}`;
    this.classList.toggle('current-window', isCurrent);
    this.$header.init(windowId, firstTab);
    this.addTabs([firstTab, ...rest]);
    this.addEventListener('click', (e) => {
      const $target = e.target as HTMLElement;
      if (!hasClass($target, 'window', 'tab', 'icon-incognito')) {
        return;
      }
      chrome.windows.update(this.#windowId, { focused: true }, window.close);
    });
    return this;
  }
  get windowId() {
    return this.#windowId;
  }
  searchDone() {
    this.classList.toggle('empty', this.offsetHeight < 10);
  }
  addTab(tab: chrome.tabs.Tab) {
    const $openTab = document.importNode(this.$tmplTab!, true);
    return $openTab.init(tab, this.#lastSearchWord);
  }
  addTabs(tabs: chrome.tabs.Tab[]) {
    const $tabs = tabs.map((tab) => this.addTab(tab));
    this.append(...$tabs);
    return $tabs;
  }
  connectTabs($tabs: OpenTab[]) {
    $tabs.forEach(($tab) => $tab.connect(this.#store!));
  }
  switchCollapseIcon(collapsed: boolean) {
    toggleClass('tabs-collapsed', collapsed)(this);
  }
  getTabs() {
    const [, ...$tabs] = [...this.children];
    return $tabs as OpenTab[];
  }
  clearTabs() {
    this.getTabs().forEach(($tab) => $tab.remove());
  }
  reloadTabs() {
    chrome.windows.get(this.#windowId, { populate: true }, (win) => {
      if (chrome.runtime.lastError) {
        this.remove();
        return;
      }
      const [firstTab, ...rest] = win.tabs!;
      this.$header.update(firstTab);
      this.clearTabs();
      this.connectTabs(this.addTabs([firstTab, ...rest]));
    });
  }
  connect(store: Store) {
    this.#store = store;
    this.$header.connect(store);
    this.connectTabs(this.getTabs());
    store.subscribe('collapseWindowsAll', (changes) => {
      this.switchCollapseIcon(changes.newValue);
    });
    store.subscribe('windowAction', (changes) => {
      if (changes?.newValue?.windowId !== this.#windowId) {
        return;
      }
      switch (changes.newValue.type) {
        case 'collapseWindow':
          collapseTab(store, this);
          break;
        case 'closeTab':
          if (this.childElementCount <= 1) {
            this.remove();
          }
          break;
        case 'closeWindow': {
          chrome.windows.remove(this.#windowId, () => this.remove());
          break;
        }
        default:
      }
    });
  }
}

export class Tabs extends HTMLDivElement implements IPubSubElement, ISearchable {
  #tabsWrap = this.firstElementChild!;
  #initPromise!: Promise<void>;
  init(
    $tmplOpenTab: OpenTab,
    $tmplWindow: Window,
    collapseTabs: boolean,
    lastSearchWord: string,
    promiseInitTabs: PromiseInitTabs,
  ) {
    this.#initPromise = promiseInitTabs.then(([initTabs, currentWindowId]) => {
      const $windows = initTabs.map((win) => {
        const $window = document.importNode($tmplWindow, true);
        return $window.init(
          win.windowId,
          $tmplOpenTab,
          win.tabs!,
          collapseTabs,
          lastSearchWord,
          win.windowId === currentWindowId,
        );
      });
      this.#tabsWrap.append(...$windows);
    });
    return this;
  }
  getWindows() {
    return [...this.#tabsWrap.children] as Window[];
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams) {
    $$byClass(searchSelector, this).forEach((el) => {
      const tab = el.firstElementChild as HTMLElement;
      const isMatch = reFilter.test(tab.textContent!)
        || (includeUrl && reFilter.test(extractUrl(el.style.backgroundImage)));
      el.classList.toggle('match', isMatch);
      el.classList.toggle('unmatch', !isMatch);
    });
    this.getWindows().forEach(($win) => $win.searchDone());
  }
  clearSearch() {
    $$byTag('open-tab', this).forEach(rmClass('match', 'unmatch'));
    $$byClass('empty', this).forEach(rmClass('empty'));
  }
  // eslint-disable-next-line class-methods-use-this
  actions() {
    return {
      windowAction: makeAction({
        initValue: {
          type: '' as 'collapseWindow' | 'closeTab' | 'closeWindow',
          windowId: -1,
        },
      }),
      search: {},
    };
  }
  connect(store: Store) {
    this.#initPromise.then(() => {
      this.getWindows().forEach(($window) => $window.connect(store));
      store.subscribe('scrollNextWindow', () => switchTabWindow(this, true));
      store.subscribe('scrollPrevWindow', () => switchTabWindow(this, false));
      store.subscribe('clearSearch', this.clearSearch.bind(this));
      store.dispatch('search');
    });
  }
}

export class HeaderTabs extends PaneHeader implements IPubSubElement {
  #collapsed!: boolean;
  private $buttonCollapse!: HTMLElement;
  private $buttonPrevWin!: HTMLElement;
  private $buttonNextWin!: HTMLElement;
  override init(settings: State['settings'], collapsed: boolean) {
    super.init(settings);
    this.$buttonCollapse = $byClass('collapse-tabs', this);
    this.$buttonPrevWin = $byClass('win-prev', this);
    this.$buttonNextWin = $byClass('win-next', this);
    this.#collapsed = collapsed;
    this.switchCollapseIcon(collapsed);
  }
  switchCollapseIcon(collapsed: boolean) {
    toggleClass('tabs-collapsed-all', collapsed)(this);
  }
  override actions() {
    return {
      ...super.actions(),
      collapseWindowsAll: makeAction<boolean, 'click'>({
        initValue: this.#collapsed,
        target: this.$buttonCollapse,
        eventType: 'click',
        eventProcesser: (_, currentValue) => !currentValue,
      }),
      scrollPrevWindow: {},
      scrollNextWindow: {},
    };
  }
  connect(store: Store) {
    store.subscribe('collapseWindowsAll', (changes) => this.switchCollapseIcon(changes.newValue));
    this.$buttonPrevWin.addEventListener('click', () => store.dispatch('scrollPrevWindow', null, true));
    this.$buttonNextWin.addEventListener('click', () => store.dispatch('scrollNextWindow', null, true));
  }
}
