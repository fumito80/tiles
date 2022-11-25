import {
  getSelecteds, MultiSelPane, MutiSelectableItem, PaneHeader,
} from './multi-sel-pane';
import {
  $$, $$byClass, $$byTag, $byClass, $byTag, addClass, addStyle, hasClass,
  rmClass, rmStyle, setAnimationClass, toggleClass, showMenu,
} from './client';
import {
  addListener, delayMultiSelect, extractDomain, extractUrl, htmlEscape,
  makeStyleIcon, pipe, postMessage,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  Dispatch, IPubSubElement, ISubscribeElement, makeAction, States, Store,
} from './store';
import { CliMessageTypes, PromiseInitTabs, State } from './types';
import { dialog } from './dialogs';

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

export class OpenTab extends MutiSelectableItem {
  #tabId!: number;
  #incognito!: boolean;
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
    const marginBottom = 3;
    const marginTop = 3;
    const rect = this.getBoundingClientRect();
    const rectTT = this.$tooltip.getBoundingClientRect();
    const rectMain = this.$main.getBoundingClientRect();
    const left = Math.min(
      rect.left - rectMain.left,
      rectMain.width - rectMain.left - rectTT.width - 5,
    );
    addStyle('left', `${Math.max(left, 5)}px`)(this.$tooltip);
    if (rect.bottom + rectTT.height + marginBottom > document.body.offsetHeight) {
      addStyle('top', `${rect.top - rectTT.height - marginTop}px`)(this.$tooltip);
      return;
    }
    addStyle('top', `${rect.bottom + marginBottom}px`)(this.$tooltip);
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
  connect(store: Store) {
    this.$header.connect(store);
    this.addTabs(this.tabs, store.dispatch);
    this.addEventListener('click', async (e) => {
      const $target = e.target as HTMLElement;
      if (!hasClass($target, 'window', 'tab')) {
        return;
      }
      const { tabs } = await store.getStates('multiSelPanes');
      if (tabs) {
        const openTabs = this.getTabs();
        const selectAll = openTabs.length / 2 >= openTabs.filter((tab) => tab.selected).length;
        openTabs.map((tab) => tab.select(selectAll));
        return;
      }
      chrome.windows.update(this.#windowId, { focused: true }, window.close);
    });
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
  multiSelectTabs({ tabs: multiSelect }: { tabs?: boolean, all?: boolean }) {
    if (!multiSelect) {
      $$('.tabs .selected').forEach(rmClass('selected'));
      this.$lastClickedTab = undefined;
    }
  }
  mousedownItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLDivElement;
    const $tab = $target instanceof OpenTab ? $target : $target.parentElement;
    if (!($tab instanceof OpenTab)) {
      return;
    }
    clearTimeout(this.#timerMultiSelect);
    this.#timerMultiSelect = setTimeout(async () => {
      const { dragging, multiSelPanes } = await states();
      if (dragging) {
        if (multiSelPanes?.tabs) {
          $tab.select(true);
        }
        return;
      }
      dispatch('multiSelPanes', { tabs: !multiSelPanes?.tabs });
      $tab.preMultiSelect(!multiSelPanes?.tabs);
    }, delayMultiSelect);
  }
  mouseupItem() {
    clearTimeout(this.#timerMultiSelect);
  }
  async clickItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLDivElement;
    // if (hasClass($target, 'tab-wrap', 'leaf-menu-button')) {
    //   return;
    // }
    const $tab = $target instanceof OpenTab ? $target : $target.parentElement;
    if ($tab instanceof OpenTab) {
      const { tabs, all } = await states('multiSelPanes');
      if (tabs || all) {
        $tab.select();
        if (all) {
          dispatch('multiSelPanes', { tabs: true });
        }
        if (e.shiftKey) {
          this.selectWithShift($tab);
        }
        this.$lastClickedTab = $tab;
        return;
      }
      $tab.gotoTab();
    }
  }
  actions() {
    return {
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
    };
  }
  connect(store: Store) {
    this.#initPromise.then(() => {
      this.getWindows().forEach(($window) => $window.connect(store));
      store.subscribe('scrollNextWindow', () => switchTabWindow(this, true));
      store.subscribe('scrollPrevWindow', () => switchTabWindow(this, false));
      store.subscribe('clearSearch', this.clearSearch.bind(this));
      store.subscribe('clickTabs', (_, states, dispatch, e) => this.clickItem(e, states, dispatch));
      store.subscribe('mousedownTabs', (_, states, dispatch, e) => this.mousedownItem(e, states, dispatch));
      store.subscribe('mouseupTabs', this.mouseupItem.bind(this));
      store.subscribe('multiSelPanes', ({ newValue }) => this.multiSelectTabs(newValue));
    });
  }
}

export class HeaderTabs extends PaneHeader implements IPubSubElement {
  #collapsed!: boolean;
  private $buttonCollapse!: HTMLElement;
  private $buttonPrevWin!: HTMLElement;
  private $buttonNextWin!: HTMLElement;
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
  get multiSelPaneParams() {
    return {
      className: 'tabs',
      deleteHandler: ($selecteds: HTMLElement[]) => {
        $selecteds
          .filter(($el): $el is OpenTab => $el instanceof OpenTab)
          .map(($tab) => $tab.tabId)
          .forEach((tabId) => chrome.tabs.remove(tabId));
      },
    } as const;
  }
  // eslint-disable-next-line class-methods-use-this
  async menuClickHandler(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    const openTabs = getSelecteds().filter(($el): $el is OpenTab => $el instanceof OpenTab);
    switch ($target.dataset.value) {
      case 'open-incognito':
      case 'open-new-window': {
        const payload = openTabs.map(({ tabId, incognito }) => ({ tabId, incognito }));
        const { windowId, message } = await postMessage(
          { type: CliMessageTypes.moveTabsNewWindow, payload },
        );
        if (message) {
          await dialog.alert(message);
        }
        chrome.windows.update(windowId, { focused: true });
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
