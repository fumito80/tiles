import {
  MulitiSelectablePaneBody,
  MultiSelPane, MutiSelectableItem, MulitiSelectablePaneHeader,
} from './multi-sel-pane';
import {
  $$byClass, $$byTag, $byClass, $byTag, addClass, addStyle,
  rmClass, rmStyle, setAnimationClass, toggleClass, showMenu, hasClass,
} from './client';
import {
  addListener, delayMultiSelect, extractDomain, extractUrl, htmlEscape,
  makeStyleIcon, pipe,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  Dispatch, IPubSubElement, ISubscribeElement, makeAction, States, Store,
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

export class OpenTab extends MutiSelectableItem {
  #tabId!: number;
  #incognito!: boolean;
  #active!: boolean;
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
    const [$tab,, $tooltip] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    $tooltip.textContent = tooltip;
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
  getParentWindow() {
    // eslint-disable-next-line no-use-before-define
    return this.parentElement as Window;
  }
  setCurrentTab(tab: chrome.tabs.Tab) {
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
      return;
    }
    addStyle('top', `${rect.bottom + margin}px`)(this.$tooltip);
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
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
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
  searchDone() {
    this.classList.toggle('empty', this.offsetHeight < 10);
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
  if ($target.parentElement?.parentElement instanceof Window && hasClass($target, 'tab')) {
    return $target.parentElement?.parentElement;
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
  #timerMultiSelect!: number;
  $lastClickedTab!: OpenTab | undefined;
  init(
    $tmplOpenTab: OpenTab,
    $tmplWindow: Window,
    collapseTabs: boolean,
    isSearching: boolean,
    promiseInitTabs: PromiseInitTabs,
  ) {
    this.setEvent();
    this.#tabsWrap = this.firstElementChild as HTMLElement;
    this.#initPromise = promiseInitTabs.then(([initTabs, currentWindowId]) => {
      const $windows = initTabs.map((win) => {
        const $window = document.importNode($tmplWindow, true);
        return $window.init(
          win.windowId,
          $tmplOpenTab,
          win.tabs!,
          collapseTabs,
          isSearching,
          win.windowId === currentWindowId,
        );
      });
      this.#tabsWrap.append(...$windows);
    });
    return this;
  }
  setEvent() {
    $byClass('new-window-plus', this)!.addEventListener('click', () => {
      chrome.windows.create();
    });
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
  openTabsFromHistory(dispatch: Dispatch) {
    const currentWindow = this.getWindows().find((win) => win.isCurrent);
    const index = currentWindow?.getTabs().findIndex((tab) => tab.isCurrent);
    const { windowId } = currentWindow!;
    dispatch('openHistories', {
      elementIds: [], index: index == null ? undefined : index + 1, windowId, incognito: false,
    });
  }
  // eslint-disable-next-line class-methods-use-this
  deletesHandler($selecteds: HTMLElement[], store: Store) {
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
        .forEach((windowId) => store.dispatch('windowAction', { type: 'closeTab', windowId }, true));
      this.selectItems(store.dispatch);
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
  multiSelect({ tabs: multiSelect }: { tabs?: boolean }) {
    if (!multiSelect) {
      this.getWindows()
        .flatMap((win) => win.getTabs())
        .filter((tab) => tab.selected)
        .forEach((tab) => tab.select(false));
      this.$lastClickedTab = undefined;
    }
  }
  mousedownItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLDivElement;
    const $tab = isOpenTab($target);
    const $window = isWindow($target);
    if ($tab || $window) {
      clearTimeout(this.#timerMultiSelect);
      this.#timerMultiSelect = setTimeout(
        async () => {
          const { dragging, multiSelPanes } = await states();
          if (dragging) {
            this.selectItems(dispatch);
            return;
          }
          dispatch('multiSelPanes', { tabs: !multiSelPanes?.tabs });
          $tab?.preMultiSelect(!multiSelPanes?.tabs);
          $window?.getTabs().forEach(($tab2) => $tab2.preMultiSelect(!multiSelPanes?.tabs));
          this.selectItems(dispatch);
        },
        delayMultiSelect,
      );
    }
  }
  mouseupItem() {
    clearTimeout(this.#timerMultiSelect);
  }
  async clickItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLDivElement;
    const $tab = isOpenTab($target);
    if ($tab) {
      const { tabs, all } = await states('multiSelPanes');
      if (tabs || all) {
        $tab.select();
        if (all) {
          dispatch('multiSelPanes', { tabs: true });
        }
        if (e.shiftKey) {
          this.selectWithShift($tab);
        }
        this.selectItems(dispatch);
        this.$lastClickedTab = $tab;
        return;
      }
      $tab.gotoTab();
      return;
    }
    const $window = isWindow($target);
    if ($window) {
      const { tabs, all } = await states('multiSelPanes');
      if (tabs || all || e.shiftKey) {
        const openTabs = $window.getTabs();
        const selectAll = openTabs.length / 2 >= openTabs.filter((tab) => tab.selected).length;
        openTabs.map((tab) => tab.select(selectAll));
        this.selectItems(dispatch);
        if (all || e.shiftKey) {
          dispatch('multiSelPanes', { tabs: true });
        }
        return;
      }
      const [$tab1, ...rest] = $window.getTabs();
      if ($tab1.checkMultiSelect()) {
        rest.forEach(($tab2) => $tab2.checkMultiSelect());
        this.selectItems(dispatch);
        return;
      }
      chrome.windows.update($window.windowId, { focused: true }, window.close);
    }
  }
  selectItems(dispatch: Dispatch, precount?: number) {
    const count = precount ?? $$byClass('selected', this).length;
    dispatch('selectItems', { paneName: this.paneName, count }, true);
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
      search: {},
      clickTabs: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mousedownTabs: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
      }),
      mouseupTabs: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
      }),
      openTabsFromHistory: makeAction({
        force: true,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    this.#initPromise.then(() => {
      this.getWindows().forEach(($window) => $window.connect(store));
      store.subscribe('scrollNextWindow', () => switchTabWindow(this, true));
      store.subscribe('scrollPrevWindow', () => switchTabWindow(this, false));
      store.subscribe('clearSearch', this.clearSearch.bind(this));
      store.subscribe('clickTabs', (_, e) => this.clickItem(e, store.getStates, store.dispatch));
      store.subscribe('mousedownTabs', (_, e) => this.mousedownItem(e, store.getStates, store.dispatch));
      store.subscribe('mouseupTabs', this.mouseupItem.bind(this));
      store.subscribe('multiSelPanes', ({ newValue }) => this.multiSelect(newValue));
      store.subscribe('openTabsFromHistory', () => this.openTabsFromHistory(store.dispatch));
    });
  }
}

export class HeaderTabs extends MulitiSelectablePaneHeader implements IPubSubElement {
  readonly paneName = 'tabs';
  #collapsed!: boolean;
  private $buttonCollapse!: HTMLElement;
  private $buttonPrevWin!: HTMLElement;
  private $buttonNextWin!: HTMLElement;
  readonly multiDeletesTitle = 'Close selected tabs';
  override init(settings: State['settings'], $tmplMultiSelPane: MultiSelPane, collapsed: boolean) {
    super.init(settings, $tmplMultiSelPane);
    this.$buttonCollapse = $byClass('collapse-tabs', this)!;
    this.$buttonPrevWin = $byClass('win-prev', this)!;
    this.$buttonNextWin = $byClass('win-next', this)!;
    this.#collapsed = collapsed;
    this.switchCollapseIcon(collapsed);
  }
  switchCollapseIcon(collapsed: boolean) {
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
  override connect(store: Store) {
    super.connect(store);
    store.subscribe('collapseWindowsAll', (changes) => this.switchCollapseIcon(changes.newValue));
    this.$buttonPrevWin.addEventListener('click', () => store.dispatch('scrollPrevWindow', null, true));
    this.$buttonNextWin.addEventListener('click', () => store.dispatch('scrollNextWindow', null, true));
  }
}
