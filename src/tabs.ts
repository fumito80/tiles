import {
  MulitiSelectablePaneBody,
  MultiSelPane, MutiSelectableItem, MulitiSelectablePaneHeader,
} from './multi-sel-pane';
import {
  $$byClass, $$byTag, $byClass, $byTag, addClass, addStyle,
  rmClass, rmStyle, setAnimationClass, toggleClass, showMenu, hasClass, setText, createNewTab,
} from './client';
import {
  addListener, delayMultiSelect, extractDomain, getLocal, htmlEscape,
  makeStyleIcon, pipe, when,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  Changes,
  Dispatch, IPubSubElement, ISubscribeElement, makeAction, States, Store, StoreSub,
} from './store';
import {
  MulitiSelectables, Options, PromiseInitTabs, State,
} from './types';
import { Leaf } from './bookmarks';

export async function smoothSroll<T extends HTMLElement>($target: T, scrollTop: number) {
  const $tabsWrap = $target.parentElement! as HTMLElement;
  const $parent = $tabsWrap.parentElement! as HTMLElement;
  const translateY = -(Math.min(
    scrollTop - $parent.scrollTop,
    $parent.scrollHeight - $parent.offsetHeight - $parent.scrollTop,
  ));
  if (Math.abs(translateY) <= 1) {
    return Promise.resolve($target);
  }
  const promise = new Promise<T>((resolve) => {
    $tabsWrap.addEventListener('transitionend', () => {
      rmClass('scroll-ease-in-out')($tabsWrap);
      rmStyle('transform')($tabsWrap);
      Object.assign($parent, { scrollTop });
      resolve($target);
    }, { once: true });
  });
  addClass('scroll-ease-in-out')($tabsWrap);
  addStyle('transform', `translateY(${translateY}px)`)($tabsWrap);
  return promise;
}

async function collapseTab(dispatch: Dispatch, $win: HTMLElement) {
  const promiseCollapse = new Promise<TransitionEvent>((resolve) => {
    $win.addEventListener('transitionend', resolve, { once: true });
  });
  toggleClass('tabs-collapsed')($win);
  await promiseCollapse;
  const { length } = $$byClass('tabs-collapsed');
  if (length === $win.parentElement!.children.length) {
    dispatch('collapseWindowsAll', true);
  } else if (length === 0) {
    dispatch('collapseWindowsAll', false);
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
    this.#url = tab.url!;
    const [, $tab,, $tooltip] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tooltip.textContent = tooltip;
    $tab.setAttribute('title', `${tab.title}\n${htmlEscape(tab.url!.substring(0, 1024))}`);
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

export class WindowHeader extends HTMLElement implements ISubscribeElement {
  #windowId!: number;
  private $btnCollapseTabs!: HTMLElement;
  private $tabsMenu!: HTMLElement;
  init(windowId: number, tab: chrome.tabs.Tab) {
    this.$btnCollapseTabs = $byClass<HTMLButtonElement>('collapse-tab', this)!;
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
    $tab.setAttribute('title', `${tab.title}\n${tab.url}`);
    toggleClass('show', tab.incognito)($iconIncognito);
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
  }
  connect(store: Store) {
    const windowId = this.#windowId;
    this.$btnCollapseTabs.addEventListener('click', () => {
      store.dispatch('windowAction', { type: 'collapseWindow', windowId }, true);
      this.$btnCollapseTabs.blur();
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
  addTab(tab: chrome.tabs.Tab, dispatch: Store['dispatch']) {
    const $openTab = document.importNode(this.$tmplTab!, true);
    return $openTab.init(tab, this.#isSearching, dispatch);
  }
  addTabs(tabs: chrome.tabs.Tab[], dispatch: Store['dispatch']) {
    const $tabs = tabs.map((tab) => this.addTab(tab, dispatch));
    this.append(...$tabs);
    return $tabs;
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
  dispathAction(windowAction: Store['actions']['windowAction']['initValue'], dispatch: Dispatch) {
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
    store.subscribe('collapseWindowsAll', (changes) => this.switchCollapseIcon(changes.newValue));
    store.subscribe('windowAction', (changes) => this.dispathAction(changes.newValue, store.dispatch));
  }
}

function isWindow($target: HTMLElement) {
  if ($target instanceof Window) {
    return $target;
  }
  if ($target.parentElement?.parentElement instanceof Window && hasClass($target, 'window-title')) {
    return $target.parentElement.parentElement;
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
  #tabsWrap!: HTMLElement;
  #initPromise!: Promise<void>;
  $lastClickedTab!: OpenTab | undefined;
  #timerMouseoverLeaf: number | undefined;
  #options!: Options;
  #promiseSwitchTabEnd = Promise.resolve();
  #bmAutoFindTabsDelay = 500;
  init(
    $tmplOpenTab: OpenTab,
    $tmplWindow: Window,
    options: Options,
    isSearching: boolean,
    promiseInitTabs: PromiseInitTabs,
  ) {
    this.setEvent();
    this.#tabsWrap = this.firstElementChild as HTMLElement;
    this.#options = options;
    this.#initPromise = promiseInitTabs.then(([initTabs, currentWindowId]) => {
      const $windows = initTabs.map((win) => {
        const $window = document.importNode($tmplWindow, true);
        return $window.init(
          win.windowId,
          $tmplOpenTab,
          win.tabs!,
          options.collapseTabs,
          isSearching,
          win.windowId === currentWindowId,
        );
      });
      this.#tabsWrap.append(...$windows);
    });
    this.#bmAutoFindTabsDelay = parseInt(options.bmAutoFindTabsDelay, 10) || 0;
    return this;
  }
  setEvent() {
    $byClass('new-window-plus', this)!.addEventListener('click', () => chrome.windows.create());
  }
  getWindows() {
    return [...this.#tabsWrap.children] as Window[];
  }
  getAllTabs(filter: (tab: OpenTab) => boolean = () => true) {
    return this.getWindows().flatMap(($win) => $win.getTabs()).filter(filter);
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams, dispatch: Dispatch) {
    const matches = $$byClass(searchSelector, this).filter((tab) => {
      if (!(tab instanceof OpenTab)) {
        return false;
      }
      const isMatch = reFilter.test(tab.textContent!)
        || (includeUrl && reFilter.test(tab.url));
      tab.classList.toggle('match', isMatch);
      tab.classList.toggle('unmatch', !isMatch);
      return isMatch;
    });
    dispatch('tabMatches', matches.length, true);
  }
  clearSearch() {
    $$byTag('open-tab', this).forEach(rmClass('match', 'unmatch'));
    $$byClass('empty', this).forEach(rmClass('empty'));
  }
  openTabsFromHistory(_: any, __: any, ___: any, store: StoreSub) {
    const currentWindow = this.getWindows().find((win) => win.isCurrent);
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
    if ($tab || $window) {
      clearTimeout(this.timerMultiSelect);
      this.timerMultiSelect = setTimeout(
        async () => {
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
  getTabFinder(srcUrl: string, bmId = '') {
    return getLocal('bmFindTabMatchMode').then(({ bmFindTabMatchMode = {} }) => {
      const [, domainSrc] = extractDomain(srcUrl);
      const mode = bmFindTabMatchMode[bmId] || this.#options.findTabsMatches;
      return mode === 'prefix'
        ? (tab: OpenTab) => !!tab.url?.startsWith(srcUrl)
        : (tab: OpenTab) => {
          const [, domain] = extractDomain(tab.url);
          return domain === domainSrc;
        };
    });
  }
  scrollToFocused($target: OpenTab) {
    const $parentWindow = $target.getParentWindow();
    const currentTop = $parentWindow.offsetTop + $target.offsetTop;
    if (currentTop >= this.scrollTop
      && currentTop + $target.offsetHeight <= this.scrollTop + this.offsetHeight) {
      return;
    }
    const scrollTop = currentTop - this.offsetHeight / 2 + $target.offsetHeight / 2;
    smoothSroll($parentWindow, Math.max(0, scrollTop));
  }
  mouseoverLeaf(_: any, e: MouseEvent, states: States, store: StoreSub) {
    const $leaf = (e.target as HTMLElement).parentElement;
    if (!($leaf instanceof Leaf && hasClass(e.target as HTMLElement, 'anchor'))) {
      return;
    }
    clearTimeout(this.#timerMouseoverLeaf);
    this.#timerMouseoverLeaf = setTimeout(async () => {
      const { dragging } = states;
      if (dragging) {
        return;
      }
      const $anchor = $leaf.firstElementChild as HTMLAnchorElement;
      const [, url] = $anchor.title?.split('\n') || [];
      if (!url) {
        return;
      }
      const finder = await this.getTabFinder(url, $leaf.id);
      const [$find1st, ...rest] = this.getAllTabs((tab) => !hasClass(tab, 'unmatch')).filter(finder).map((tab) => tab.setHighlight(true));
      if ($find1st) {
        $find1st.setFocus(true);
        this.scrollToFocused($find1st);
        const searches = [$find1st, ...rest].length;
        store.dispatch('setWheelHighlightTab', { leafId: $leaf.id, searches });
      }
    }, this.#bmAutoFindTabsDelay);
  }
  mouseoutLeaf(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $leaf = (e.target as HTMLElement).parentElement;
    if (!($leaf instanceof Leaf)) {
      return;
    }
    clearTimeout(this.#timerMouseoverLeaf);
    this.getAllTabs().forEach(($tab) => {
      $tab.setFocus(false);
      $tab.setHighlight(false);
    });
    store.dispatch('setWheelHighlightTab', { searches: undefined });
  }
  nextTabByWheel({ newValue: dir }: { newValue: Changes<'nextTabByWheel'>['initValue'] }) {
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
  async activateTab({ newValue: { url, focused, bookmarkId } }: { newValue: NonNullable<Changes<'activateTab'>['initValue']> }) {
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
      target = sorted.find(await this.getTabFinder(url));
    }
    if (!target) {
      chrome.bookmarks.get(bookmarkId).then(([bm]) => createNewTab(this.#options, bm.url!));
      return;
    }
    target.gotoTab();
  }
  async switchTabWindow(_: any, e: MouseEvent) {
    const isNext = hasClass(e.target as HTMLElement, 'win-next');
    if (this.scrollHeight === this.offsetHeight) {
      return;
    }
    this.#promiseSwitchTabEnd = this.#promiseSwitchTabEnd.then(() => new Promise<any>((resolve) => {
      const tabsTop = isNext ? Math.ceil(this.scrollTop) : Math.floor(this.scrollTop) - 1;
      const tabsBottom = this.scrollTop + this.offsetHeight;
      const $current = ([...this.firstElementChild!.children] as HTMLElement[])
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
      smoothSroll($target, $target.offsetTop).then(resolve);
    }));
  }
  focusCurrentTab() {
    const $currentWindow = this.getWindows().find((win) => win.isCurrent) as any;
    const scrollTop = when($currentWindow.offsetHeight > this.offsetHeight)
      .then($currentWindow.offsetTop)
      .else(() => {
        const diff = (this.offsetHeight - $currentWindow.offsetHeight) / 2;
        return Math.max(0, $currentWindow.offsetTop - diff);
      });
    smoothSroll($currentWindow, scrollTop).then(setAnimationClass('hilite'));
  }
  override actions() {
    return {
      ...super.actions(),
      windowAction: makeAction({
        initValue: {
          type: '' as 'collapseWindow' | 'closeTab' | 'closeWindow',
          windowId: -1,
        },
      }),
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
    };
  }
  override connect(store: Store) {
    super.connect(store);
    this.#initPromise.then(() => {
      this.getWindows().forEach(($window) => $window.connect(store));
      store.subscribe('scrollNextWindow', this.switchTabWindow.bind(this));
      store.subscribe('scrollPrevWindow', this.switchTabWindow.bind(this));
      store.subscribe('clearSearch', this.clearSearch.bind(this));
      store.subscribe('clickTabs', this.clickItem.bind(this));
      store.subscribe('mousedownTabs', this.mousedownItem.bind(this));
      store.subscribe('mouseupTabs', this.mouseupItem.bind(this));
      store.subscribe('multiSelPanes', this.multiSelect.bind(this));
      store.subscribe('openTabsFromHistory', this.openTabsFromHistory.bind(this));
      store.subscribe('mouseoverLeafs', this.mouseoverLeaf.bind(this));
      store.subscribe('mouseoutLeafs', this.mouseoutLeaf.bind(this));
      store.subscribe('mouseoverFolders', this.mouseoverLeaf.bind(this));
      store.subscribe('mouseoutFolders', this.mouseoutLeaf.bind(this));
      store.subscribe('nextTabByWheel', this.nextTabByWheel.bind(this));
      store.subscribe('activateTab', this.activateTab.bind(this));
      store.subscribe('focusCurrentTab', this.focusCurrentTab.bind(this));
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
  readonly multiDeletesTitle = 'Close selected tabs';
  override init(settings: State['settings'], $tmplMultiSelPane: MultiSelPane, collapsed: boolean) {
    super.init(settings, $tmplMultiSelPane);
    this.$buttonCollapse = $byClass('collapse-tabs', this)!;
    this.$buttonPrevWin = $byClass('win-prev', this)!;
    this.$buttonNextWin = $byClass('win-next', this)!;
    this.$searchesTabs = $byClass('searches-tabs', this)!;
    this.$searchesBms = $byClass('searches-bookmarks', this)!;
    this.#collapsed = collapsed;
    $byClass('tabs-info', this)?.insertAdjacentElement('afterbegin', this.$multiSelPane);
    this.switchCollapseIcon({ newValue: collapsed });
  }
  switchCollapseIcon({ newValue: collapsed }: { newValue: boolean }) {
    toggleClass('tabs-collapsed-all', collapsed)(this);
    this.$buttonCollapse.blur();
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
  showBookmarkMatches({ newValue }: { newValue: Changes<'setWheelHighlightTab'>['initValue'] }) {
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
    };
  }
  override connect(store: Store) {
    super.connect(store);
    store.subscribe('collapseWindowsAll', this.switchCollapseIcon.bind(this));
    store.subscribe('setWheelHighlightTab', this.showBookmarkMatches.bind(this));
    store.subscribe('tabMatches', this.showTabMatches.bind(this));
    store.subscribe('clearSearch', this.clearSearch.bind(this));
  }
}
