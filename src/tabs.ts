import {
  MulitiSelectablePaneBody,
  MultiSelPane, MutiSelectableItem, MulitiSelectablePaneHeader,
} from './multi-sel-pane';
import {
  $$byClass, $$byTag, $byClass, $byTag, addClass, addStyle, hasClass, rmClass, rmStyle, toggleClass,
  setAnimationClass, showMenu, setText, createNewTab, getChildren,
  scrollVerticalCenter,
} from './client';
import {
  addListener, delayMultiSelect, extractDomain, getLocal, htmlEscape,
  makeStyleIcon, pipe, when,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  Changes, Dispatch, IPubSubElement, ISubscribeElement, makeAction, States, Store, StoreSub,
} from './popup';
import {
  InitailTabs,
  MulitiSelectables, Options, PromiseInitTabs, State,
} from './types';
import { Leaf } from './bookmarks';

export async function smoothSroll<T extends HTMLElement>($target: T, scrollTop: number) {
  const $container = $target.parentElement! as HTMLElement;
  const translateY = -(Math.min(
    scrollTop - $container.scrollTop,
    $container.scrollHeight - $container.offsetHeight - $container.scrollTop,
  ));
  if (Math.abs(translateY) <= 1) {
    return Promise.resolve($target);
  }
  const promise = new Promise<T>((resolve) => {
    $target.addEventListener('transitionend', () => {
      rmClass('scroll-ease-in-out')($target);
      rmStyle('transform')($target);
      Object.assign($container, { scrollTop });
      resolve($target);
    }, { once: true });
  });
  addClass('scroll-ease-in-out')($target);
  addStyle('transform', `translateY(${translateY}px)`)($target);
  return promise;
}

async function collapseTab(dispatch: Dispatch, $win: HTMLElement) {
  const promiseCollapse = new Promise<TransitionEvent>((resolve) => {
    $win.addEventListener('transitionend', resolve, { once: true });
  });
  toggleClass('tabs-collapsed')($win);
  await promiseCollapse;
  dispatch('checkAllCollapsed');
  const $tabs = $win.parentElement!.parentElement!;
  const winBottom = $win.offsetTop + $win.offsetHeight - $tabs.offsetTop;
  const tabsBottom = $tabs.scrollTop + $tabs.offsetHeight;
  const isTopOver = $tabs.scrollTop <= ($win.offsetTop - $tabs.offsetTop);
  const isBottomUnder = tabsBottom > winBottom;
  if (isTopOver && isBottomUnder) {
    return;
  }
  const scrollTop = ($tabs.offsetHeight < $win.offsetHeight)
    ? ($win.offsetTop - $tabs.offsetTop)
    : $tabs.scrollTop + (winBottom - tabsBottom);
  smoothSroll($win.parentElement!, scrollTop);
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

export class OpenTab extends MutiSelectableItem {
  #tabId!: number;
  #incognito!: boolean;
  #active!: boolean;
  #url!: string;
  #focused = false;
  #highlighted = false;
  private $main!: HTMLElement;
  private $tooltip!: HTMLElement;
  init(tab: chrome.tabs.Tab, isSearching: boolean, dispatch: Store['dispatch']) {
    this.$main = $byTag('app-main');
    this.$tooltip = $byClass('tooltip', this)!;
    this.classList.toggle('unmatch', isSearching);
    this.#tabId = tab.id!;
    this.id = `tab-${tab.id}`;
    this.#incognito = tab.incognito;
    this.setCurrentTab(tab);
    this.#active = tab.active;
    this.#url = decodeURIComponent((tab.url || '').substring(0, 1024));
    const [, $tab,, $tooltip] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tooltip.textContent = tooltip;
    $tab.setAttribute('title', `${tab.title}\n${htmlEscape(this.#url)}`);
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
    addListener('mouseover', this.setTooltipPosition)(this);
    addListener('click', this.closeTab(dispatch))($byClass('icon-x', this)!);
    return this;
  }
  get tabId() {
    return this.#tabId;
  }
  get incognito() {
    return this.#incognito;
  }
  get isCurrent() {
    return this.#active;
  }
  get url() {
    return this.#url;
  }
  get focused() {
    return this.#focused;
  }
  get highlighted() {
    return this.#highlighted;
  }
  getParentWindow() {
    // eslint-disable-next-line no-use-before-define
    return this.parentElement as Window;
  }
  setCurrentTab(tab: chrome.tabs.Tab) {
    this.#active = tab.active;
    this.classList.toggle('current-tab', tab.active);
  }
  gotoTab() {
    if (this.checkMultiSelect()) {
      return;
    }
    const { windowId } = this.getParentWindow();
    chrome.windows.update(windowId, { focused: true });
    chrome.tabs.update(this.tabId, { active: true }, window.close);
  }
  closeTab(dispatch: Store['dispatch']) {
    return (e: MouseEvent) => {
      e.stopPropagation();
      this.addEventListener('animationend', () => {
        chrome.tabs.remove(this.tabId, () => {
          const { windowId } = this.getParentWindow();
          this.remove();
          dispatch('windowAction', { type: 'closeTab', windowId }, true);
        });
      }, { once: true });
      setAnimationClass('remove-hilite')(this);
    };
  }
  setTooltipPosition() {
    const margin = 4;
    const rect = this.getBoundingClientRect();
    const rectTT = this.$tooltip.getBoundingClientRect();
    const rectMain = this.$main.getBoundingClientRect();
    const left = Math.min(
      rect.left - rectMain.left - 1,
      rectMain.width - rectMain.left - rectTT.width - 5,
    );
    addStyle('left', `${Math.max(left, 5)}px`)(this.$tooltip);
    if (rect.bottom + rectTT.height + margin > document.body.offsetHeight) {
      addStyle('top', `${rect.top - rectTT.height - margin}px`)(this.$tooltip);
      return this;
    }
    addStyle('top', `${rect.bottom + margin}px`)(this.$tooltip);
    return this;
  }
  setFocus(focused: boolean) {
    this.#focused = focused;
    this.classList.toggle('focus', focused);
  }
  setHighlight(highlighted: boolean) {
    this.#highlighted = highlighted;
    this.classList.toggle('highlight', highlighted);
    return this;
  }
}

function getModeTabFinder(srcUrl: string, mode: string) {
  const [, domainSrc] = extractDomain(srcUrl);
  return mode === 'prefix'
    ? (tab: OpenTab) => !!tab.url?.startsWith(srcUrl)
    : (tab: OpenTab) => {
      const [, domain] = extractDomain(tab.url);
      return domain === domainSrc;
    };
}

export class WindowHeader extends HTMLElement implements ISubscribeElement {
  #windowId!: number;
  private $tabsMenu!: HTMLElement;
  init(windowId: number, tab: chrome.tabs.Tab) {
    this.$tabsMenu = $byClass('tabs-menu', this)!;
    this.#windowId = windowId;
    this.update(tab);
    pipe(
      addListener('click', showMenu(this.$tabsMenu)),
      addListener('mousedown', () => addStyle({ top: '-1000px' })(this.$tabsMenu)),
    )($byClass('tabs-menu-button', this)!);
    return this;
  }
  update(tab: chrome.tabs.Tab) {
    const [$iconIncognito, $tab] = [...this.children] as HTMLElement[];
    $tab.textContent = tab.title!;
    const decodedUrl = htmlEscape(decodeURIComponent((tab.url || '').substring(0, 1024)));
    $tab.setAttribute('title', `${tab.title}\n${decodedUrl}`);
    toggleClass('show', tab.incognito)($iconIncognito);
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
  }
  connect(store: Store) {
    const windowId = this.#windowId;
    $byClass('collapse-tab', this)?.addEventListener('click', (e) => {
      store.dispatch('windowAction', { type: 'collapseWindow', windowId }, true);
      (e.target as HTMLElement).blur();
    });
    $byClass('unpin-window', this)?.addEventListener('click', () => {
      store.dispatch('pinWindow', { windowId, method: 'sub' });
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
          case 'pin-window-top':
          case 'pin-window-bottom':
            store.dispatch('pinWindow', {
              windowId,
              place: $target.dataset.value === 'pin-window-top' ? 'top' : 'bottom',
              method: 'add',
            }, true);
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
  #isSearching = false;
  #isCurrent = false;
  private tabs!: chrome.tabs.Tab[];
  private $tmplTab!: OpenTab;
  private $header!: WindowHeader;
  init(
    windowId: number,
    tmplTab: OpenTab,
    tabs: chrome.tabs.Tab[],
    collapseTabs: boolean,
    isSearching: boolean,
    isCurrent: boolean,
  ) {
    this.$header = this.firstElementChild as WindowHeader;
    this.switchCollapseIcon(collapseTabs);
    this.#windowId = windowId;
    this.$tmplTab = tmplTab;
    this.tabs = tabs;
    this.#isSearching = isSearching;
    this.id = `win-${windowId}`;
    this.#isCurrent = isCurrent;
    this.classList.toggle('current-window', isCurrent);
    const [firstTab] = tabs;
    this.$header.init(windowId, firstTab);
    return this;
  }
  get windowId() {
    return this.#windowId;
  }
  get isCurrent() {
    return this.#isCurrent;
  }
  addTab(tab: chrome.tabs.Tab, dispatch: Dispatch) {
    const $openTab = document.importNode(this.$tmplTab!, true);
    return $openTab.init(tab, this.#isSearching, dispatch);
  }
  addTabs(tabs: chrome.tabs.Tab[], dispatch: Dispatch) {
    const $tabs = tabs.map((tab) => this.addTab(tab, dispatch));
    this.append(...$tabs);
    return $tabs;
  }
  switchCollapseIcon(collapsed: boolean) {
    toggleClass('tabs-collapsed', collapsed)(this);
    return this;
  }
  getTabs() {
    const [, ...$tabs] = [...this.children];
    return $tabs as OpenTab[];
  }
  clearTabs() {
    this.getTabs().forEach(($tab) => $tab.remove());
  }
  reloadTabs(dispatch: Store['dispatch']) {
    chrome.windows.get(this.#windowId, { populate: true }, (win) => {
      if (chrome.runtime.lastError) {
        this.remove();
        return;
      }
      const [firstTab, ...rest] = win.tabs!;
      this.$header.update(firstTab);
      this.clearTabs();
      this.addTabs([firstTab, ...rest], dispatch);
    });
  }
  dispathAction({ newValue: windowAction }: Changes<'windowAction'>, dispatch: Dispatch) {
    if (windowAction?.windowId !== this.#windowId) {
      return;
    }
    switch (windowAction.type) {
      case 'collapseWindow':
        collapseTab(dispatch, this);
        break;
      case 'closeTab':
        if (this.childElementCount <= 1) {
          this.remove();
        } else {
          this.reloadTabs(dispatch);
        }
        break;
      case 'closeWindow': {
        chrome.windows.remove(this.#windowId, () => this.remove());
        break;
      }
      default:
    }
  }
  connect(store: Store) {
    this.$header.connect(store);
    this.addTabs(this.tabs, store.dispatch);
  }
}

function isWindow($target: HTMLElement) {
  if ($target instanceof Window) {
    return $target;
  }
  const $window = $target.parentElement?.parentElement;
  if ($window instanceof Window && hasClass($target, 'window-title')) {
    return $window;
  }
  return undefined;
}

function isOpenTab($target: HTMLElement) {
  if ($target instanceof OpenTab) {
    return $target;
  }
  if ($target.parentElement instanceof OpenTab) {
    return $target.parentElement;
  }
  return undefined;
}

export class Tabs extends MulitiSelectablePaneBody implements IPubSubElement, ISearchable {
  readonly paneName = 'tabs';
  #initPromise!: Promise<[InitailTabs, number]>;
  $lastClickedTab!: OpenTab | undefined;
  #timerMouseoverLeaf: number | undefined;
  #options!: Options;
  #promiseSwitchTabEnd = Promise.resolve();
  #bmAutoFindTabsDelay = 500;
  #lastScrollTops = undefined as {
    windowsWrap: number,
    pinWrap: number | undefined,
    pinWrapB: number | undefined,
  } | undefined;
  #promiseSmoothScroll!: Promise<any>;
  private $pinWrap!: HTMLElement;
  private $pinWrapB!: HTMLElement;
  private $tabsWrap!: HTMLElement;
  private $windosWrap!: HTMLElement;
  private $newWindow!: HTMLElement;
  init(
    $tmplOpenTab: OpenTab,
    $tmplWindow: Window,
    options: Options,
    isSearching: boolean,
    promiseInitTabs: PromiseInitTabs,
    windowOrderAsc: boolean,
    pinWindows: States['pinWindows'],
  ) {
    this.setEvent();
    this.$pinWrap = $byClass('pin-wrap-top', this)!;
    this.$pinWrapB = $byClass('pin-wrap-bottom', this)!;
    this.$tabsWrap = $byClass('tabs-wrap', this)!;
    this.$windosWrap = $byClass('windows-wrap', this)!;
    this.$newWindow = $byClass('new-window', this)!;
    this.#options = options;
    if (windowOrderAsc) {
      this.$tabsWrap.insertBefore(this.$newWindow, this.$windosWrap);
    }
    this.#initPromise = promiseInitTabs.then(([initWindows, currentWindowId]) => {
      const ordered = windowOrderAsc ? initWindows.concat().reverse() : initWindows;
      const $windows = ordered
        .map((win) => {
          const $window = document.importNode($tmplWindow, true);
          const $win = $window.init(
            win.windowId,
            $tmplOpenTab,
            win.tabs!,
            options.collapseTabs,
            isSearching,
            win.windowId === currentWindowId,
          );
          return $win;
        })
        .filter(Boolean);
      this.$windosWrap.append(...$windows as Window[]);
      [
        [this.$pinWrap, pinWindows?.top] as const,
        [this.$pinWrapB, pinWindows?.bottom] as const,
      ].forEach(([$container, windowIds]) => {
        $container.append(
          ...$windows
            .filter(($win) => windowIds?.includes($win.windowId))
            .map(($win) => $win.switchCollapseIcon(true)),
        );
      });
      return [initWindows, currentWindowId];
    });
    this.#bmAutoFindTabsDelay = parseInt(options.bmAutoFindTabsDelay, 10) || 0;
    return this;
  }
  setEvent() {
    $byClass('new-window-plus', this)!.addEventListener('click', () => chrome.windows.create());
  }
  getWindows() {
    return [...this.$windosWrap.children] as Window[];
  }
  getAllWindows() {
    return [
      ...this.$pinWrap.children,
      ...this.$windosWrap.children,
      ...this.$pinWrapB.children,
    ] as Window[];
  }
  getAllTabs(filter: (tab: OpenTab) => boolean = () => true) {
    return this.getAllWindows().flatMap(($win) => $win.getTabs()).filter(filter);
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams, dispatch: Dispatch) {
    if (!reFilter) {
      return;
    }
    const tester = includeUrl
      ? (tab: OpenTab) => reFilter.test(tab.textContent + tab.url)
      : (tab: OpenTab) => reFilter.test(tab.textContent!);
    $$byClass<OpenTab>(searchSelector, this).forEach((tab) => {
      const isMatch = tester(tab);
      pipe(toggleClass('match', isMatch), toggleClass('unmatch', !isMatch))(tab);
    });
    const matches = $$byClass('match', this);
    dispatch('tabMatches', matches.length, true);
    if (matches.length > 0) {
      this.scrollToFocused(matches[0] as OpenTab);
    }
  }
  clearSearch() {
    $$byTag('open-tab', this).forEach(rmClass('match', 'unmatch'));
    $$byClass('empty', this).forEach(rmClass('empty'));
  }
  openTabsFromHistory(_: any, __: any, ___: any, store: StoreSub) {
    const currentWindow = this.getAllWindows().find((win) => win.isCurrent);
    const index = currentWindow?.getTabs().findIndex((tab) => tab.isCurrent);
    const { windowId } = currentWindow!;
    store.dispatch('openHistories', {
      elementIds: [], index: index == null ? undefined : index + 1, windowId, incognito: false,
    });
  }
  // eslint-disable-next-line class-methods-use-this
  deletesHandler($selecteds: HTMLElement[], dispatch: Dispatch) {
    const removeds = $selecteds
      .filter(($el): $el is OpenTab => $el instanceof OpenTab)
      .map(($tab) => [chrome.tabs.remove($tab.tabId), $tab] as [Promise<void>, OpenTab]);
    const [promises, $tabs] = removeds.reduce(
      ([pp, tt], [p, t]) => [[...pp, p], [...tt, t]],
      [[], []] as [Promise<void>[], OpenTab[]],
    );
    Promise.all(promises).then(() => {
      $tabs
        .map(($tab) => {
          const win = $tab.getParentWindow();
          $tab.remove();
          return win.windowId;
        })
        .filter((id, i, ids) => ids.indexOf(id) === i)
        .forEach((windowId) => dispatch('windowAction', { type: 'closeTab', windowId }, true));
      this.selectItems(dispatch);
    });
  }
  selectWithShift($target: OpenTab) {
    if (
      this.$lastClickedTab !== $target
      && this.$lastClickedTab?.parentElement === $target.parentElement
    ) {
      const OpenTabs = [] as OpenTab[];
      let started = false;
      for (
        let next = $target.parentElement?.firstElementChild as OpenTab | Element | null;
        next != null;
        next = next.nextElementSibling
      ) {
        if (next === $target || next === this.$lastClickedTab) {
          if (started) {
            OpenTabs.push(next as OpenTab);
            break;
          }
          started = true;
        }
        if (started && next instanceof OpenTab) {
          OpenTabs.push(next);
        }
      }
      OpenTabs.forEach(($tab) => $tab.select(true));
    }
  }
  multiSelect({ newValue: { tabs } }: { newValue: MulitiSelectables }) {
    if (!tabs) {
      this.getAllTabs((tab) => tab.selected)
        .forEach((tab) => tab.select(false, true));
      this.$lastClickedTab = undefined;
    }
  }
  mousedownItem(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $target = e.target as HTMLDivElement;
    const $tab = isOpenTab($target);
    const $window = isWindow($target);
    const { offsetX } = e;
    if ($tab || $window) {
      clearTimeout(this.timerMultiSelect);
      this.timerMultiSelect = setTimeout(
        async () => {
          if ($window && offsetX >= $window.clientWidth) {
            return;
          }
          const { dragging, multiSelPanes } = await store.getStates();
          const tabs = !multiSelPanes?.tabs;
          if (dragging) {
            if (!tabs) {
              this.selectItems(store.dispatch);
            }
            return;
          }
          store.dispatch('multiSelPanes', { tabs, all: false });
          if (!tabs || multiSelPanes?.all) {
            store.dispatch('multiSelPanes', { all: undefined });
            return;
          }
          $tab?.preMultiSelect(tabs);
          $window?.getTabs().forEach(($tab2) => $tab2.preMultiSelect(tabs));
          this.selectItems(store.dispatch);
        },
        delayMultiSelect,
      );
    }
  }
  async clickItem(_: any, e: MouseEvent, states: States, store: StoreSub) {
    const $target = e.target as HTMLDivElement;
    const $tab = isOpenTab($target);
    if ($tab) {
      const { tabs, all } = states.multiSelPanes!;
      if (tabs || all) {
        $tab.select();
        if (all) {
          store.dispatch('multiSelPanes', { tabs: true, all: false });
        }
        if (e.shiftKey) {
          this.selectWithShift($tab);
        }
        this.selectItems(store.dispatch);
        this.$lastClickedTab = $tab;
        return;
      }
      if (all == null) {
        store.dispatch('multiSelPanes', { all: false });
        return;
      }
      $tab.gotoTab();
      return;
    }
    const $window = isWindow($target);
    if ($window) {
      const { tabs, all } = states.multiSelPanes!;
      if (tabs || all || e.shiftKey) {
        const openTabs = $window.getTabs();
        const selectAll = openTabs.length / 2 >= openTabs.filter((tab) => tab.selected).length;
        openTabs.map((tab) => tab.select(selectAll));
        this.selectItems(store.dispatch);
        if (all || e.shiftKey) {
          store.dispatch('multiSelPanes', { tabs: true, all: false });
        }
        return;
      }
      if (all == null) {
        store.dispatch('multiSelPanes', { all: false });
        return;
      }
      const [$tab1, ...rest] = $window.getTabs();
      if ($tab1.checkMultiSelect()) {
        rest.forEach(($tab2) => $tab2.checkMultiSelect());
        this.selectItems(store.dispatch);
        return;
      }
      chrome.windows.update($window.windowId, { focused: true }, window.close);
    }
  }
  selectItems(dispatch: Dispatch, precount?: number) {
    const count = precount ?? $$byClass('selected', this).length;
    dispatch('selectItems', { paneName: this.paneName, count }, true);
  }
  findTabs(finder: (tab: OpenTab) => boolean, dispatch: Dispatch, leafId?: string) {
    const $founds = this
      .getAllTabs((tab) => !hasClass(tab, 'unmatch'))
      .filter(finder);
    const searches = $founds.length;
    if (searches > 0) {
      this.#lastScrollTops = {
        windowsWrap: this.$tabsWrap.scrollTop,
        pinWrap: this.$pinWrap.firstElementChild?.scrollTop,
        pinWrapB: this.$pinWrapB.firstElementChild?.scrollTop,
      };
      $founds.forEach((tab) => tab.setHighlight(true));
      $founds[0].setFocus(true);
      this.scrollToFocused($founds[0]);
      dispatch('setWheelHighlightTab', { leafId, searches });
    }
  }
  async getTabFinder(srcUrl: string, bmId = '') {
    return getLocal('bmFindTabMatchMode').then(({ bmFindTabMatchMode = {} }) => {
      const mode = bmFindTabMatchMode[bmId] || this.#options.findTabsMatches;
      return getModeTabFinder(srcUrl, mode);
    });
  }
  async scrollToFocused($target: OpenTab) {
    const $parentWindow = $target.getParentWindow();
    await this.#promiseSmoothScroll;
    if (!$parentWindow.closest('.tabs-wrap')) {
      scrollVerticalCenter($target);
      return;
    }
    const currentTop = $parentWindow.offsetTop + $target.offsetTop - this.$tabsWrap.offsetTop;
    const $container = $parentWindow.parentElement?.parentElement!;
    if (currentTop >= $container.scrollTop
      && currentTop + $target.offsetHeight <= $container.scrollTop + $container.offsetHeight) {
      return;
    }
    const scrollTop = currentTop - $container.offsetHeight / 2 + $target.offsetHeight / 2;
    this.#promiseSmoothScroll = smoothSroll($parentWindow.parentElement!, Math.max(0, scrollTop));
  }
  mouseoverLeaf(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $leaf = (e.target as HTMLElement).parentElement;
    if (!($leaf instanceof Leaf && hasClass(e.target as HTMLElement, 'anchor'))) {
      return;
    }
    clearTimeout(this.#timerMouseoverLeaf);
    this.#timerMouseoverLeaf = setTimeout(async () => {
      const dragging = await store.getStates('dragging');
      if (dragging) {
        return;
      }
      const finder = await this.getTabFinder($leaf.url, $leaf.id);
      this.findTabs(finder, store.dispatch, $leaf.id);
    }, this.#bmAutoFindTabsDelay);
  }
  async mouseoutLeaf(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $leaf = (e.target as HTMLElement).parentElement;
    if (!($leaf instanceof Leaf)) {
      return;
    }
    clearTimeout(this.#timerMouseoverLeaf);
    if (this.#lastScrollTops == null) {
      return;
    }
    if (await store.getStates('dragging') === true) {
      return;
    }
    this.clearFocus(undefined, undefined, undefined, store);
  }
  mouseoverMenuTabsFind({ newValue: { url, menu } }: Changes<'mouseoverMenuTabsFind'>, _: any, __: any, store: StoreSub) {
    const finder = getModeTabFinder(url, menu === 'bm-find-prefix' ? 'prefix' : 'domain');
    this.findTabs(finder, store.dispatch);
  }
  async clearFocus(_: any, __: any, ___: any, store: StoreSub) {
    this.getAllTabs().forEach(($tab) => {
      $tab.setFocus(false);
      $tab.setHighlight(false);
    });
    store.dispatch('setWheelHighlightTab', { searches: undefined });
    if (this.#lastScrollTops == null) {
      return;
    }
    await this.#promiseSmoothScroll;
    if (this.#lastScrollTops.windowsWrap != null) {
      this.#promiseSmoothScroll = smoothSroll(this.$windosWrap, this.#lastScrollTops.windowsWrap);
    }
    if (this.#lastScrollTops.pinWrap != null) {
      this.$pinWrap.firstElementChild!.scrollTop = this.#lastScrollTops.pinWrap;
    }
    if (this.#lastScrollTops.pinWrapB != null) {
      this.$pinWrapB.firstElementChild!.scrollTop = this.#lastScrollTops.pinWrapB;
    }
    this.#lastScrollTops = undefined;
  }
  nextTabByWheel({ newValue: dir }: Changes<'nextTabByWheel'>) {
    const highlights = this.getAllTabs(($el) => $el.highlighted);
    if (highlights.length <= 1) {
      return;
    }
    const foundIndex = highlights.findIndex(($el) => $el.focused);
    const $nextTab = dir === 'DN'
      ? (highlights[foundIndex + 1] || highlights[0])
      : (highlights[foundIndex - 1] || highlights.at(-1));
    highlights[foundIndex].setFocus(false);
    $nextTab.setFocus(true);
    this.scrollToFocused($nextTab);
  }
  async activateTab({ newValue: { url, focused, bookmarkId } }: Changes<'activateTab'>) {
    let target: OpenTab | undefined;
    if (focused) {
      [target] = this.getAllTabs((tab) => tab.focused);
    }
    if (!focused || !target) {
      const tabs = this.getAllTabs();
      const findIndex = tabs.findIndex((tab) => tab.isCurrent && tab.getParentWindow().isCurrent);
      const sorted = [
        ...tabs.slice(findIndex + 1),
        ...tabs.slice(0, findIndex + 1),
      ];
      target = sorted.find(await this.getTabFinder(url, bookmarkId));
    }
    if (!target) {
      chrome.bookmarks.get(bookmarkId).then(([bm]) => createNewTab(this.#options, bm.url!));
      return;
    }
    target.gotoTab();
  }
  async switchTabWindow(_: any, e: MouseEvent) {
    const $scroll = this.$tabsWrap;
    const isNext = hasClass(e.target as HTMLElement, 'win-next');
    if ($scroll.scrollHeight === $scroll.offsetHeight) {
      return;
    }
    this.#promiseSwitchTabEnd = this.#promiseSwitchTabEnd.then(() => new Promise<any>((resolve) => {
      const tabsTop = isNext ? Math.ceil($scroll.scrollTop) : Math.floor($scroll.scrollTop) - 1;
      const tabsBottom = $scroll.scrollTop + $scroll.offsetHeight;
      const $current = getChildren(this.$windosWrap)
        .map(($win) => ({
          $win,
          winTop: $win.offsetTop - $scroll.offsetTop,
          winBottom: $win.offsetTop - $scroll.offsetTop + $win.offsetHeight,
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
        resolve(undefined);
        return;
      }
      const { $win, winTop, winBottom } = $current;
      let $target = $win;
      if (winTop <= tabsTop && winBottom >= tabsBottom) {
        $target = (isNext ? $win.nextElementSibling : $win) as HTMLElement;
      }
      if (!$target) {
        resolve(undefined);
        return;
      }
      smoothSroll($target.parentElement!, $target.offsetTop - $scroll.offsetTop).then(resolve);
    }));
  }
  focusCurrentTab() {
    const $currentWindow = this.getAllWindows().find((win) => win.isCurrent)!;
    if (!$currentWindow.closest('.tabs-wrap')) {
      setAnimationClass('hilite')($currentWindow);
      return;
    }
    const currentWindowTop = $currentWindow.offsetTop - this.$tabsWrap.offsetTop;
    const scrollTop = when($currentWindow.offsetHeight > this.$tabsWrap.offsetHeight)
      .then(currentWindowTop)
      .else(() => {
        const diff = (this.$tabsWrap.offsetHeight - $currentWindow.offsetHeight) / 2;
        return Math.max(0, currentWindowTop - diff);
      });
    smoothSroll($currentWindow.parentElement!, scrollTop)
      .then(() => setAnimationClass('hilite')($currentWindow));
  }
  toggleWindowOrder({ newValue, isInit }: Changes<'toggleWindowOrder'>) {
    if (isInit) {
      return;
    }
    this.getWindows().forEach((win) => {
      this.$windosWrap.insertAdjacentElement('afterbegin', win);
    });
    const position = newValue ? 'beforebegin' : 'afterend';
    this.$windosWrap.insertAdjacentElement(position, $byClass('new-window')!);
    this.$tabsWrap.scrollTop = 0;
  }
  getWindowById(windowId: number) {
    return this.getAllWindows().find((win) => win.windowId === windowId);
  }
  async translateWindow(
    $pinContainer: HTMLElement,
    $target: Window,
    translation: number,
    pinWindows: Changes<'pinWindows'>['newValue'],
    windowOrderAsc: boolean,
  ) {
    toggleClass('translate-window', true)($target);
    await new Promise((resolve) => {
      $target.addEventListener('transitionend', () => {
        rmStyle('transform')($target);
        rmClass('translate-window')($target);
        resolve(true);
      }, { once: true });
      addStyle('transform', `translateY(${translation}px)`)($target);
    });
    this.unpin(pinWindows, windowOrderAsc);
    $pinContainer.appendChild($target);
    $target.switchCollapseIcon(true);
  }
  // eslint-disable-next-line class-methods-use-this
  pinWindow({ newValue }: Changes<'pinWindow'>, _: any, states: States, store: StoreSub) {
    const { top: pinsTop, bottom: pinsBottom } = states.pinWindows || {};
    const newState = when(newValue.method === 'add')
      .then(() => ({
        top: newValue.place === 'top' ? [newValue.windowId!] : pinsTop,
        bottom: newValue.place === 'bottom' ? [newValue.windowId!] : pinsBottom,
      }))
      .else(() => {
        const [top, bottom] = [pinsTop, pinsBottom]
          .map((pin) => pin?.filter((winId) => winId !== newValue.windowId));
        return { top, bottom };
      });
    store.dispatch('pinWindows', newState);
  }
  pinWindows({ newValue, isInit }: Changes<'pinWindows'>, _: any, states: States) {
    if (isInit) {
      return;
    }
    const $top = this.getWindows().find(($win) => newValue.top?.includes($win.windowId));
    if ($top) {
      const translate = $top.offsetTop - this.$tabsWrap.scrollTop;
      this.translateWindow(this.$pinWrap, $top, -translate, newValue, states.toggleWindowOrder!);
      return;
    }
    const $bottom = this.getWindows().find(($win) => newValue.bottom?.includes($win.windowId));
    if ($bottom) {
      const translate = this.offsetHeight - $bottom.offsetTop - $bottom.offsetHeight
        + this.$tabsWrap.scrollTop;
      this.translateWindow(this.$pinWrapB, $bottom, translate, newValue, states.toggleWindowOrder!);
      return;
    }
    this.unpin(newValue, states.toggleWindowOrder!, true);
  }
  async unpin(pinWindows: States['pinWindows'], windowOrderAsc: boolean, effect = false) {
    const pinStates = [...pinWindows?.top || [], ...pinWindows?.bottom || []];
    const $targets = getChildren(this.$pinWrap).concat(getChildren(this.$pinWrapB))
      .filter(($el): $el is Window => $el instanceof Window)
      .filter(($pin) => !pinStates.includes($pin.windowId));
    if ($targets.length === 0) {
      return;
    }
    const windowIds = await this.#initPromise
      .then(([wins]) => (windowOrderAsc ? wins.concat().reverse() : wins))
      .then((wins) => wins.map((win) => win.windowId))
      .then((winIds) => winIds.filter((winId) => !pinStates.includes(winId)));
    const $allWindows = this.getAllWindows();
    windowIds.forEach((windowId) => {
      this.$windosWrap.appendChild($allWindows.find(($win) => $win.windowId === windowId)!);
    });
    if (effect) {
      $targets.forEach(setAnimationClass('hilite'));
    }
  }
  async dragging({ newValue: dragStart }: Changes<'dragging'>, _: any, __: any, store: StoreSub) {
    if (!dragStart) {
      setTimeout(() => clearTimeout(this.#timerMouseoverLeaf), 1);
      await this.clearFocus(undefined, undefined, undefined, store);
    }
  }
  toggleTabCollapsedAll({ newValue }: Changes<'collapseWindowsAll'>) {
    this.getWindows().forEach((win) => win.switchCollapseIcon(newValue));
  }
  dispatchWindowActions(changes: Changes<'windowAction'>, _: any, __: any, store: StoreSub) {
    this.getAllWindows().forEach((win) => win.dispathAction(changes, store.dispatch));
  }
  checkAllCollapsed(_: any, __: any, ___: any, store: StoreSub) {
    const windows = this.getWindows();
    const collapseds = windows.filter((win) => hasClass(win, 'tabs-collapsed'));
    if (collapseds.length === windows.length) {
      store.dispatch('collapseWindowsAll', true);
    } else if (collapseds.length === 0) {
      store.dispatch('collapseWindowsAll', false);
    }
  }
  override actions() {
    return {
      ...super.actions(),
      windowAction: makeAction({
        initValue: {
          type: '' as 'collapseWindow' | 'closeTab' | 'closeWindow' | 'pinWindowTop' | 'pinWindowBottom',
          windowId: -1,
        },
      }),
      checkAllCollapsed: {},
      clickTabs: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mousedownTabs: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
        noStates: true,
      }),
      mouseupTabs: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
        noStates: true,
      }),
      openTabsFromHistory: makeAction({
        force: true,
      }),
      setWheelHighlightTab: makeAction({
        initValue: {
          leafId: undefined,
          searches: undefined,
        } as {
          leafId?: string | undefined,
          searches?: number | undefined,
        },
      }),
      tabMatches: makeAction({
        initValue: undefined as number | undefined,
        force: true,
      }),
      activateTab: makeAction({
        initValue: {
          url: '',
          focused: true,
          bookmarkId: '',
        } as {
          url: string,
          bookmarkId: string,
          focused?: boolean,
        },
      }),
      toggleWindowOrder: makeAction({
        initValue: false,
        persistent: true,
      }),
      pinWindow: makeAction({
        initValue: {
          windowId: null,
          method: null,
        } as {
          windowId: number | null,
          place?: 'top' | 'bottom',
          method: 'add' | 'sub' | null,
        },
      }),
      pinWindows: makeAction({
        initValue: {
          top: undefined as number[] | undefined,
          bottom: undefined as number[] | undefined,
        },
        persistent: true,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    this.#initPromise.then(() => {
      this.getAllWindows().forEach(($window) => $window.connect(store));
    });
  }
}

export class HeaderTabs extends MulitiSelectablePaneHeader implements IPubSubElement {
  readonly paneName = 'tabs';
  #collapsed!: boolean;
  private $buttonCollapse!: HTMLElement;
  private $buttonPrevWin!: HTMLElement;
  private $buttonNextWin!: HTMLElement;
  private $searchesTabs!: HTMLElement;
  private $searchesBms!: HTMLElement;
  private $tabOrderAsc!: HTMLElement;
  readonly multiDeletesTitle = 'Close selected tabs';
  override init(settings: State['settings'], options: Options, $tmplMultiSelPane: MultiSelPane, windowOrderAsc: boolean) {
    super.init(settings, options, $tmplMultiSelPane);
    this.$buttonCollapse = $byClass('collapse-tabs', this)!;
    this.$buttonPrevWin = $byClass('win-prev', this)!;
    this.$buttonNextWin = $byClass('win-next', this)!;
    this.$searchesTabs = $byClass('searches-tabs', this)!;
    this.$searchesBms = $byClass('searches-bookmarks', this)!;
    this.$tabOrderAsc = $byClass('tab-order-asc', this)!;
    this.#collapsed = options.collapseTabs;
    toggleClass('window-order-asc', windowOrderAsc)(this);
    $byClass('tabs-info', this)?.insertAdjacentElement('afterbegin', this.$multiSelPane);
    this.toggleTabCollapsedAll({ newValue: options.collapseTabs });
    $byClass('new-window-plus', this)!.addEventListener('click', () => chrome.windows.create());
  }
  toggleTabCollapsedAll({ newValue: collapsed }: { newValue: boolean }) {
    toggleClass('tabs-collapsed-all', collapsed)(this);
    this.$buttonCollapse.blur();
  }
  toggleWindowOrder(_: any, __: any, states: States, store: StoreSub) {
    toggleClass('window-order-asc', !states.toggleWindowOrder)(this);
    this.$tabOrderAsc.blur();
    store.dispatch('toggleWindowOrder', !states.toggleWindowOrder);
  }
  // eslint-disable-next-line class-methods-use-this
  async menuClickHandler(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    switch ($target.dataset.value) {
      case 'open-incognito':
      case 'open-new-window': {
        break;
      }
      default:
    }
  }
  showBookmarkMatches({ newValue }: Changes<'setWheelHighlightTab'>) {
    this.$searchesBms.classList.toggle('show', newValue?.searches != null);
    setText(String(newValue?.searches ?? ''))($byClass('count-selected', this.$searchesBms));
  }
  showTabMatches({ newValue: matches }: { newValue: number }) {
    this.$searchesTabs.classList.add('show');
    setText(String(matches))($byClass('count-selected', this.$searchesTabs));
  }
  clearSearch() {
    this.$searchesTabs.classList.remove('show');
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
      scrollPrevWindow: makeAction({
        target: this.$buttonPrevWin,
        eventType: 'click',
        eventOnly: true,
      }),
      scrollNextWindow: makeAction({
        target: this.$buttonNextWin,
        eventType: 'click',
        eventOnly: true,
      }),
      focusCurrentTab: makeAction({
        target: $byClass('focus-current-tab', this)!,
        eventType: 'click',
        eventOnly: true,
      }),
      toggleWindowOrderHeader: makeAction({
        target: this.$tabOrderAsc,
        eventType: 'click',
        eventOnly: true,
      }),
    };
  }
}
