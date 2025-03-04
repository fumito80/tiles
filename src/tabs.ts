import {
  MulitiSelectablePaneBody, MultiSelPane, MutiSelectableItem, MulitiSelectablePaneHeader,
} from './multi-sel-pane';
import {
  $, $$byClass, $$byTag, $byClass, $byTag, addClass, addStyle, hasClass, rmClass, rmStyle,
  toggleClass, setAnimationClass, showMenu, setText, getChildren,
  scrollVerticalCenter,
  toggleElement,
  addBookmark,
  preShowMenu,
  getAllWindows,
} from './client';
import {
  addListener, delayMultiSelect, extractDomain, getLocal, htmlEscape, postMessage,
  makeStyleIcon, pipe, when, setEvents, whichClass, switches, decodeUrl, chromeEventFilter, decode,
  isDefined,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  Changes, Dispatch, IPubSubElement, ISubscribeElement, makeAction, States, Store, StoreSub,
} from './popup';
import {
  CliMessageTypes, MulitiSelectables, Options, PayloadUpdateWindow,
  PromiseInitTabs, SetCurrentWindow, State,
} from './types';
import { Leaf } from './bookmarks';
import { dialog } from './dialogs';

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
  const url = tab.url || tab.pendingUrl;
  if (tab.favIconUrl) {
    const style = makeStyleIcon(url!);
    return { style };
  }
  if (tab.url?.startsWith('file://')) {
    return {
      'data-initial': htmlEscape(tab.title!.substring(0, 1)).substring(0, 1),
      'data-file': 'yes',
    };
  }
  if (!url?.startsWith('http')) {
    const style = makeStyleIcon(url);
    return { style };
  }
  return {
    'data-initial': htmlEscape(tab.title!.substring(0, 1)).substring(0, 1),
  };
}

function getTooltip(tab: chrome.tabs.Tab) {
  const url = tab.url || tab.pendingUrl;
  if (url?.startsWith('file:///')) {
    return `${tab.title}\n${url}`;
  }
  const [scheme, domain] = extractDomain(url);
  const schemeAdd = scheme.startsWith('https') ? '' : scheme;
  return `${tab.title}\n${schemeAdd}${domain}`;
}

// eslint-disable-next-line no-use-before-define
function setTitle(tab: OpenTab | chrome.tabs.Tab, $target: Element) {
  const lastAccessed = (new Date(tab.lastAccessed!)).toLocaleString();
  const title = `${tab.title}\n${lastAccessed}\n${htmlEscape(tab.url!)}`;
  $target.setAttribute('title', title);
}

export class OpenTab extends MutiSelectableItem {
  #tabId!: number;
  #incognito!: boolean;
  #active!: boolean;
  #url!: string;
  #title!: string;
  #focused = false;
  #highlighted = false;
  #lastAccessed?: number;
  #faviconUrl? = 'empty';
  #dispatch!: Store['dispatch'];
  private $main!: HTMLElement;
  private $tooltip!: HTMLElement;
  private $title!: HTMLElement;
  init(tab: chrome.tabs.Tab, isSearching: boolean, dispatch: Store['dispatch']) {
    this.classList.toggle('unmatch', isSearching);
    this.$main = $byTag('app-main');
    this.$tooltip = $byClass('tooltip', this)!;
    this.$title = $byClass('tab-title', this)!;
    this.$title.textContent = tab.title!;
    this.#title = tab.title!;
    this.#tabId = tab.id!;
    this.id = `tab-${tab.id}`;
    this.#incognito = tab.incognito;
    this.setCurrent(tab.active);
    this.#url = decodeUrl(tab.url || tab.pendingUrl);
    const [,,, $tooltip] = getChildren(this);
    $tooltip.textContent = getTooltip(tab);
    this.#dispatch = dispatch;
    this.update(tab);
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
  get windowId() {
    return this.parentWindow.windowId;
  }
  get text() {
    return this.$title.textContent;
  }
  get url() {
    return this.#url;
  }
  override get title() {
    return this.#title;
  }
  get focused() {
    return this.#focused;
  }
  get highlighted() {
    return this.#highlighted;
  }
  get lastAccessed() {
    return this.#lastAccessed;
  }
  set lastAccessed(lastAccessed: number | undefined) {
    this.#lastAccessed = lastAccessed;
  }
  get faviconUrl() {
    return this.#faviconUrl;
  }
  get parentWindow() {
    const $window = this.parentElement;
    // eslint-disable-next-line no-use-before-define
    if ($window instanceof Window) {
      return $window;
    }
    // eslint-disable-next-line no-use-before-define
    return $(`.windows #tab-${this.tabId}`)?.parentElement as Window;
  }
  setCurrent(isCurrent: boolean) {
    this.#active = isCurrent;
    this.classList.toggle('current-tab', isCurrent);
  }
  async gotoTab() {
    if (this.checkMultiSelect()) {
      return;
    }
    const temporaryTab = this.isCurrent
      ? await chrome.tabs.create({ windowId: this.windowId, active: true })
      : undefined;
    chrome.tabs.update(this.tabId, { active: true });
    if (temporaryTab) {
      chrome.tabs.remove(temporaryTab.id!);
    }
    chrome.windows.update(this.windowId, { focused: true });
    this.#dispatch('minimizeApp');
  }
  closeTab(dispatch: Store['dispatch']) {
    return (e: MouseEvent) => {
      e.stopPropagation();
      this.addEventListener('animationend', () => {
        chrome.tabs.remove(this.tabId, () => {
          this.remove();
          dispatch('windowAction', { type: 'closeTab', windowId: this.windowId }, true);
        });
      }, { once: true });
      setAnimationClass('remove-hilite')(this);
    };
  }
  setTooltipPosition() {
    const margin = 4;
    const rect = this.getBoundingClientRect();
    addClass('sizing')(this.$tooltip);
    const tooltipRect = this.$tooltip.getBoundingClientRect();
    rmClass('sizing')(this.$tooltip);
    const rectMain = this.$main.getBoundingClientRect();
    const left = Math.min(
      rect.left - rectMain.left - 1,
      rectMain.width - rectMain.left - tooltipRect.width - 5,
    );
    const { appZoom } = this.parentWindow;
    addStyle('left', `calc(${Math.max(left, 5)}px / ${appZoom})`)(this.$tooltip);
    if (rect.bottom + tooltipRect.height + margin > document.body.offsetHeight) {
      addStyle('top', `calc(${rect.top - tooltipRect.height - margin}px / ${appZoom})`)(this.$tooltip);
      return this;
    }
    addStyle('top', `calc(${rect.bottom + margin}px / ${appZoom})`)(this.$tooltip);
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
  setTitle() {
    const [, $tab] = getChildren(this);
    setTitle(this, $tab);
  }
  update(tab: chrome.tabs.Tab) {
    if (this.faviconUrl !== tab.favIconUrl) {
      Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
      this.#faviconUrl = tab.favIconUrl;
    }
    if (this.lastAccessed !== tab.lastAccessed) {
      this.lastAccessed = tab.lastAccessed;
      this.setTitle();
    }
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
  #order!: number;
  #appZoom = 1;
  private $tabsMenu!: HTMLElement;
  init(windowId: number, tab: chrome.tabs.Tab, order: number) {
    this.$tabsMenu = $byClass('tabs-menu', this)!;
    this.#windowId = windowId;
    this.#order = order;
    this.update(tab);
    pipe(
      addListener('click', (e) => {
        showMenu(this.$tabsMenu, this.#appZoom)(e);
      }),
      addListener('mousedown', (e: MouseEvent) => {
        addStyle({ top: '-1000px' })(this.$tabsMenu);
        preShowMenu(this.$tabsMenu, e);
      }),
    )($byClass('tabs-menu-button', this)!);
    return this;
  }
  update(tab: chrome.tabs.Tab) {
    const [$iconIncognito, $tab] = getChildren(this);
    $tab.textContent = tab.title!;
    setTitle(tab, $tab);
    toggleClass('show', tab.incognito)($iconIncognito);
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
  }
  setAppZoom(appZoom: number) {
    this.#appZoom = appZoom;
  }
  get order() {
    return this.#order;
  }
  get windowId() {
    return this.#windowId;
  }
  connect(store: Store) {
    const { windowId, order } = this;
    const buttons = ['collapse-tab', 'minimize-others'] as const;
    setEvents($$byTag('button', this), {
      click(e) {
        const buttonClass = whichClass(buttons, e.currentTarget as HTMLElement);
        switches(buttonClass)
          .case('collapse-tab')
          .then(() => {
            store.dispatch('windowAction', { type: 'collapseWindow', windowId }, true);
            (e.currentTarget as HTMLElement).blur();
          })
          .case('minimize-others')
          .then(() => {
            store.dispatch('windowAction', { type: 'minimizeOthers', windowId }, true);
          })
          .else(undefined);
      },
    });
    pipe(
      addListener('click', (e) => {
        const $target = e.target as HTMLElement;
        switch ($target.dataset.value) {
          case 'add-new-tab': {
            chrome.tabs.create({ windowId });
            chrome.windows.update(windowId, { focused: true });
            store.dispatch('minimizeApp');
            break;
          }
          case 'close-window':
            store.dispatch('windowAction', { type: 'closeWindow', windowId }, true);
            break;
          case 'pin-window-top':
          case 'pin-window-bottom':
            store.dispatch('pinWindow', {
              order,
              place: $target.dataset.value === 'pin-window-top' ? 'top' : 'bottom',
              method: 'add',
            }, true);
            break;
          case 'minimize-others':
            store.dispatch('windowAction', { type: 'minimizeOthers', windowId }, true);
            break;
          case 'unpin-window':
            store.dispatch('pinWindow', { order, method: 'sub' });
            break;
          case 'collapse-tab':
            store.dispatch('windowAction', { type: 'collapseWindow', windowId }, true);
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
  #order!: number;
  #isSearching = false;
  #isCurrent = false;
  #appZoom = 1;
  private tabs!: chrome.tabs.Tab[];
  private $tmplTab!: OpenTab;
  private $header!: WindowHeader;
  init(
    windowId: number,
    order: number,
    tmplTab: OpenTab,
    tabs: chrome.tabs.Tab[],
    collapsed: boolean,
    isSearching: boolean,
    isCurrent: boolean,
  ) {
    this.$header = this.firstElementChild as WindowHeader;
    this.switchCollapseIcon(collapsed);
    this.#windowId = windowId;
    this.#order = order;
    this.$tmplTab = tmplTab;
    this.tabs = tabs;
    this.#isSearching = isSearching;
    this.id = `win-${windowId}`;
    this.setCurrent(isCurrent);
    const [firstTab] = tabs;
    this.$header.init(windowId, firstTab, order);
    return this;
  }
  get windowId() {
    return this.#windowId;
  }
  get order() {
    return this.#order;
  }
  get isCurrent() {
    return this.#isCurrent;
  }
  get appZoom() {
    return this.#appZoom;
  }
  get isCollapsed() {
    return hasClass(this, 'tabs-collapsed');
  }
  setCurrent(isCurrent: boolean) {
    this.#isCurrent = isCurrent;
    this.classList.toggle('current-window', isCurrent);
  }
  setCurrentTab(tabId: number) {
    this.getTabs().forEach((tab) => tab.setCurrent(tab.tabId === tabId));
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
    const [, ...$tabs] = getChildren(this);
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
      dispatch('multiSelPanes', { all: false });
    });
  }
  setAppZoom(appZoom: number) {
    this.#appZoom = appZoom;
    this.$header.setAppZoom(appZoom);
  }
  dispathAction({ newValue: windowAction }: Changes<'windowAction'>, dispatch: Dispatch) {
    if (windowAction?.windowId !== this.#windowId) {
      if (windowAction.type === 'minimizeOthers') {
        chrome.windows.update(this.windowId, { state: 'minimized' });
      }
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
        chrome.windows.remove(this.#windowId).then(() => this.remove());
        break;
      }
      case 'minimizeOthers': {
        dispatch('setCurrentWindowId', { windowId: this.#windowId, isEventTrigger: false }, true);
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

export function isOpenTab($target: HTMLElement) {
  if ($target instanceof OpenTab) {
    return $target;
  }
  if ($target.parentElement instanceof OpenTab) {
    return $target.parentElement;
  }
  return undefined;
}

export class HeaderTabs extends MulitiSelectablePaneHeader implements IPubSubElement {
  readonly paneName = 'windows';
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
    toggleElement(options.showMinimizeAll, '')($byClass('minimize-all', this)!);
    toggleClass('window-order-asc', windowOrderAsc)(this);
    $byClass('tabs-info', this)?.insertAdjacentElement('afterbegin', this.$multiSelPane);
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
        initValue: false,
        target: this.$buttonCollapse,
        eventType: 'click',
        eventProcesser: (_, collapsed) => !collapsed,
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
      minimizeAll: makeAction({
        target: $byClass('minimize-all', this),
        eventType: 'click',
        eventOnly: true,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    $byClass('new-window-plus', this)!.addEventListener('click', () => {
      chrome.windows.create();
      store.dispatch('minimizeApp');
    });
  }
}

export abstract class TabsBase extends MulitiSelectablePaneBody {
  protected $lastClickedTab!: OpenTab | undefined;
  abstract getAllTabs(filter?: (tab: OpenTab) => boolean): OpenTab[];
  clickItem(_: any, e: MouseEvent, states: States, store: StoreSub) {
    const $target = e.target as HTMLDivElement;
    const $tab = isOpenTab($target);
    if ($tab) {
      const { [this.paneName]: paneState, all } = states.multiSelPanes!;
      if (paneState || all) {
        $tab.select();
        if (all) {
          store.dispatch('multiSelPanes', { [this.paneName]: true, all: false });
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
      const { windows, all } = states.multiSelPanes!;
      if (windows || all || e.shiftKey) {
        const openTabs = $window.getTabs();
        const selectAll = openTabs.length / 2 >= openTabs.filter((tab) => tab.selected).length;
        openTabs.map((tab) => tab.select(selectAll));
        this.selectItems(store.dispatch);
        if (all || e.shiftKey) {
          store.dispatch('multiSelPanes', { windows: true, all: false });
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
      chrome.windows.update($window.windowId, { focused: true });
      store.dispatch('minimizeApp');
    }
  }
  selectItems(dispatch: Dispatch, precount?: number) {
    const count = precount ?? $$byClass('selected', this).length;
    dispatch('selectItems', { paneName: this.paneName, count }, true);
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
          const paneState = !multiSelPanes![this.paneName];
          if (dragging) {
            if (!paneState) {
              this.selectItems(store.dispatch);
            }
            return;
          }
          store.dispatch('multiSelPanes', { [this.paneName]: paneState, all: false });
          if (!paneState || multiSelPanes?.all) {
            store.dispatch('multiSelPanes', { all: undefined });
            return;
          }
          $tab?.preMultiSelect(paneState);
          $window?.getTabs().forEach(($tab2) => $tab2.preMultiSelect(paneState));
          this.selectItems(store.dispatch);
        },
        delayMultiSelect,
      );
    }
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
          const { windowId } = $tab;
          $tab.remove();
          return windowId;
        })
        .filter((id, i, ids) => ids.indexOf(id) === i)
        .forEach((windowId) => dispatch('windowAction', { type: 'closeTab', windowId }, true));
      this.selectItems(dispatch);
    });
  }
  multiSelect({ newValue: { [this.paneName]: paneState } }: { newValue: MulitiSelectables }) {
    if (!paneState) {
      this.getAllTabs((tab) => tab.selected)
        .forEach((tab) => tab.select(false, true));
      this.$lastClickedTab = undefined;
    }
  }
}

export class Tabs extends TabsBase implements IPubSubElement, ISearchable {
  override readonly paneName = 'windows';
  #initPromise!: PromiseInitTabs;
  #timerMouseoverLeaf: number | undefined;
  #timerOnActivated: ReturnType<typeof setTimeout> = 0;
  #options!: Options;
  #promiseSwitchTabEnd = Promise.resolve();
  #bmAutoFindTabsDelay = 500;
  #lastScrollTops = undefined as {
    windowsWrap: number,
    pinWrap: number | undefined,
    pinWrapB: number | undefined,
  } | undefined;
  #promiseSmoothScroll!: Promise<any>;
  private $tmplOpenTab!: OpenTab;
  private $tmplWindow!: Window;
  private $pinWrap!: HTMLElement;
  private $pinWrapB!: HTMLElement;
  private $tabsWrap!: HTMLElement;
  private $windosWrap!: HTMLElement;
  private $newWindow!: HTMLElement;
  init(
    $template: DocumentFragment,
    options: Options,
    isSearching: boolean,
    promiseInitTabs: PromiseInitTabs,
    windowOrderAsc: boolean,
    pinWindows: States['pinWindows'],
    windowStates: States['windowStates'],
  ) {
    this.setEvent();
    this.$tmplOpenTab = $('open-tab', $template) as OpenTab;
    this.$tmplWindow = $('open-window', $template) as Window;
    this.$pinWrap = $byClass('pin-wrap-top', this)!;
    this.$pinWrapB = $byClass('pin-wrap-bottom', this)!;
    this.$tabsWrap = $byClass('tabs-wrap', this)!;
    this.$windosWrap = $byClass('windows-wrap', this)!;
    this.$newWindow = $byClass('new-window', this)!;
    this.#options = options;
    if (windowOrderAsc) {
      this.$tabsWrap.insertBefore(this.$newWindow, this.$windosWrap);
    }
    this.initTabs(promiseInitTabs, isSearching, windowOrderAsc, pinWindows, windowStates);
    this.#bmAutoFindTabsDelay = parseInt(options.bmAutoFindTabsDelay, 10) || 0;
    return this;
  }
  initTabs(promiseInitTabs: PromiseInitTabs, isSearching: boolean, windowOrderAsc: boolean, pinWindows: States['pinWindows'], windowStates: States['windowStates']) {
    this.#initPromise = promiseInitTabs.then(([initWindows, currentWindowId]) => {
      const $windows = (windowOrderAsc ? initWindows.concat().reverse() : initWindows)
        .map((win) => {
          const $window = document.importNode(this.$tmplWindow, true);
          const $win = $window.init(
            win.windowId,
            win.order,
            this.$tmplOpenTab,
            win.tabs!,
            windowStates![win.order]?.collapsed ?? true,
            isSearching,
            win.windowId === currentWindowId,
          );
          return $win;
        });
      this.$windosWrap.append(...$windows as Window[]);
      [
        [this.$pinWrap, pinWindows?.top] as const,
        [this.$pinWrapB, pinWindows?.bottom] as const,
      ].forEach(([$container, orders]) => {
        $container.append(...$windows.filter(($win) => orders?.includes($win.order)));
      });
      return [initWindows, currentWindowId];
    });
  }
  get windows() {
    return [
      ...getChildren(this.$pinWrap),
      ...getChildren(this.$windosWrap),
      ...getChildren(this.$pinWrapB),
    ] as Window[];
  }
  setEvent() {
    $byClass('new-window-plus', this)!.addEventListener('click', () => chrome.windows.create());
  }
  getWindows() {
    return getChildren<Window>(this.$windosWrap);
  }
  override getAllTabs(filter: (tab: OpenTab) => boolean = () => true) {
    return this.windows.flatMap(($win) => $win.getTabs()).filter(filter);
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams, dispatch: Dispatch) {
    if (!reFilter) {
      return;
    }
    const tester = includeUrl
      ? (tab: OpenTab) => reFilter.test(tab.textContent + tab.url)
      : (tab: OpenTab) => reFilter.test(tab.text!);
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
    const currentWindow = this.windows.find((win) => win.isCurrent);
    const index = currentWindow?.getTabs().findIndex((tab) => tab.isCurrent);
    const { windowId } = currentWindow!;
    store.dispatch('openHistories', {
      elementIds: [], index: index == null ? undefined : index + 1, windowId, incognito: false,
    });
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
    const $parentWindow = $target.parentWindow;
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
  async mouseoutLeafOrRecentTabs(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $target = (e.target as HTMLElement).parentElement;
    if (!($target instanceof Leaf) && !($target instanceof OpenTab)) {
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
  mouseoverRecentTabs(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $tab = (e.target as HTMLElement).parentElement;
    if (!($tab instanceof OpenTab)) {
      return;
    }
    clearTimeout(this.#timerMouseoverLeaf);
    this.#timerMouseoverLeaf = setTimeout(async () => {
      const dragging = await store.getStates('dragging');
      if (dragging) {
        return;
      }
      const $target = $<OpenTab>(`#tab-${$tab.tabId}:not(.unmatch)`, this);
      if ($target) {
        this.#lastScrollTops = {
          windowsWrap: this.$tabsWrap.scrollTop,
          pinWrap: this.$pinWrap.firstElementChild?.scrollTop,
          pinWrapB: this.$pinWrapB.firstElementChild?.scrollTop,
        };
        $target.setHighlight(true);
        $target.setFocus(true);
        $target.classList.add('match-recent-tab');
        this.scrollToFocused($target);
        // dispatch('setWheelHighlightTab', { leafId, searches });
      }
    }, this.#bmAutoFindTabsDelay);
  }
  async clearFocus(_: any, __: any, ___: any, store: StoreSub) {
    this.getAllTabs().forEach(($tab) => {
      $tab.setFocus(false);
      $tab.setHighlight(false);
      $tab.classList.remove('match-recent-tab');
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
  async activateTab({ newValue: { url, focused, bookmarkId } }: Changes<'activateTab'>, _: any, __:any, store: StoreSub) {
    let target: OpenTab | undefined;
    if (focused) {
      [target] = this.getAllTabs((tab) => tab.focused);
    }
    if (!focused || !target) {
      const tabs = this.getAllTabs();
      const findIndex = tabs.findIndex((tab) => tab.isCurrent && tab.parentWindow.isCurrent);
      const sorted = [
        ...tabs.slice(findIndex + 1),
        ...tabs.slice(0, findIndex + 1),
      ];
      target = sorted.find(await this.getTabFinder(url, bookmarkId));
    }
    if (!target) {
      chrome.bookmarks.get(bookmarkId).then(([bm]) => store.dispatch('addNewTab', bm.url!, true));
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
    const $currentTab = this.getCurrentTab();
    if (!$currentTab) {
      return;
    }
    const $currentWindow = $currentTab.parentWindow;
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
      .then(() => {
        const { animationDuration } = getComputedStyle($currentWindow);
        if (animationDuration !== '0s') {
          setAnimationClass('hilite')($currentWindow);
        }
      });
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
    return this.windows.find((win) => win.windowId === windowId);
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
        top: newValue.place === 'top' ? [newValue.order!] : pinsTop,
        bottom: newValue.place === 'bottom' ? [newValue.order!] : pinsBottom,
      }))
      .else(() => {
        const [top, bottom] = [pinsTop, pinsBottom]
          .map((pin) => pin?.filter((order) => order !== newValue.order));
        return { top, bottom };
      });
    store.dispatch('pinWindows', newState);
  }
  pinWindows({ newValue, isInit }: Changes<'pinWindows'>, _: any, states: States) {
    if (isInit) {
      return;
    }
    const $top = this.getWindows().find(($win) => newValue.top?.includes($win.order));
    if ($top) {
      const translate = $top.offsetTop - this.$tabsWrap.scrollTop;
      this.translateWindow(this.$pinWrap, $top, -translate, newValue, states.toggleWindowOrder!);
      return;
    }
    const $bottom = this.getWindows().find(($win) => newValue.bottom?.includes($win.order));
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
      .filter(($pin) => !pinStates.includes($pin.order));
    if ($targets.length === 0) {
      return;
    }
    await getAllWindows().then((wins) => {
      const newOrders = (windowOrderAsc ? wins.concat().reverse() : wins)
        .filter((win) => !pinStates.includes(win.order))
        .map((win) => this.windows.find(($win) => $win.windowId === win.windowId))
        .filter(isDefined);
      this.$windosWrap.append(...newOrders);
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
  toggleTabCollapsedAll({ newValue }: Changes<'collapseWindowsAll'>, _: any, __: any, store: StoreSub) {
    this.getWindows().forEach((win) => win.switchCollapseIcon(newValue));
    this.resetWindowState(store);
  }
  dispatchWindowActions(changes: Changes<'windowAction'>, _: any, __: any, store: StoreSub) {
    this.windows.forEach((win) => win.dispathAction(changes, store.dispatch));
    if (changes.newValue.type === 'collapseWindow') {
      this.resetWindowState(store);
    }
  }
  checkAllCollapsed(_: any, __: any, ___: any, store: StoreSub) {
    const windows = this.getWindows();
    const collapseds = windows.filter((win) => win.isCollapsed);
    if (collapseds.length === windows.length) {
      store.dispatch('collapseWindowsAll', true);
    } else if (collapseds.length === 0) {
      store.dispatch('collapseWindowsAll', false);
    }
  }
  minimizeAll() {
    this.windows
      .filter(($win) => {
        if ($win.isCurrent) {
          chrome.windows.update($win.windowId, { focused: true });
          return false;
        }
        return true;
      })
      .forEach(($win) => chrome.windows.update($win.windowId, { state: 'minimized' }));
  }
  clearCurrentWindow() {
    this.windows.forEach((win) => win.setCurrent(false));
  }
  resetWindowState(store: StoreSub) {
    getAllWindows().then((wins) => {
      const newStates = wins
        .map((win) => !!this.windows.find(($win) => $win.windowId === win.windowId)?.isCollapsed)
        .map((collapsed) => ({ collapsed }));
      store.dispatch('windowStates', newStates);
    });
  }
  async onCreatedWindow({ newValue: newWin }: Changes<'onCreatedWindow'>, _: any, states: States, store: StoreSub) {
    this.clearCurrentWindow();
    const win = await getAllWindows()
      .then((wins) => wins.find((winInfo) => winInfo.windowId === newWin?.id));
    if (!win) {
      return;
    }
    const $window = document.importNode(this.$tmplWindow, true);
    const $win = $window.init(
      win.windowId,
      win.order,
      this.$tmplOpenTab,
      win.tabs!,
      true,
      states.searching,
      true,
    );
    // eslint-disable-next-line no-undef
    const where: InsertPosition = states.toggleWindowOrder ? 'afterbegin' : 'beforeend';
    this.$windosWrap.insertAdjacentElement(where, $win);
    $win.connect(store as Store);
    store.dispatch('re-search', 'windows');
    this.resetWindowState(store);
  }
  onRemovedWindow({ newValue: windowId }: Changes<'onRemovedWindow'>, _: any, __: States, store: StoreSub) {
    const targetWin = this.windows.find((win) => win.windowId === windowId);
    targetWin?.remove();
    this.resetWindowState(store);
  }
  setCurrentWindow(windowId: number) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      chrome.windows.getAll(chromeEventFilter).then((wins) => {
        if (wins.every((win) => win.state === 'minimized')) {
          this.clearCurrentWindow();
        }
      });
      return;
    }
    const currentWin = this.windows.find((win) => win.windowId === windowId);
    if (currentWin) {
      this.clearCurrentWindow();
      currentWin?.setCurrent(true);
    }
  }
  setCurrentWindowId({ newValue }: Changes<'setCurrentWindowId'>) {
    const { windowId = chrome.windows.WINDOW_ID_NONE, isEventTrigger } = newValue ?? {};
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }
    this.setCurrentWindow(windowId);
    if (isEventTrigger) {
      return;
    }
    const payload: PayloadUpdateWindow = {
      windowId,
      updateInfo: { focused: true },
    };
    postMessage({ type: CliMessageTypes.updateWindow, payload });
  }
  refreshWindow({ newValue: windowId }: Changes<'onUpdateTab'>, _: any, __: any, store: StoreSub) {
    const $win = this.windows.find((win) => win.windowId === windowId);
    if ($win) {
      $win.reloadTabs(store.dispatch);
    }
  }
  onActivatedTab({ newValue: tabId }: Changes<'onActivatedTab'>, _: any, __: any, store: StoreSub) {
    if (!tabId) {
      return;
    }
    clearTimeout(this.#timerOnActivated);
    this.#timerOnActivated = setTimeout(async () => {
      const tab = await chrome.tabs.get(tabId).catch(() => undefined);
      if (!tab) {
        return;
      }
      const $win = this.windows.find((win) => win.windowId === tab.windowId);
      if (!$win || !tab) {
        return;
      }
      if (tab.active) {
        $win.setCurrentTab(tabId);
        return;
      }
      $win.reloadTabs(store.dispatch);
    }, 200);
  }
  getCurrentTab() {
    const $currentTab = this.windows
      .find((win) => win.isCurrent)
      ?.getTabs().find((tab) => tab.isCurrent);
    if (!$currentTab) {
      dialog.alert('Unable to identify a current window');
    }
    return $currentTab;
  }
  addNewTab({ newValue: url }: Changes<'addNewTab'>, _: any, __: any, store: StoreSub) {
    const $tab = this.getCurrentTab();
    if (!$tab) {
      return;
    }
    const tabIndex = $tab.parentWindow.getTabs().findIndex((tab) => tab.tabId === $tab.tabId);
    const index = decode(
      this.#options.newTabPosition,
      ['le', 0],
      ['rs', tabIndex + 1],
      ['ls', tabIndex],
    );
    chrome.tabs.create({ index, url, windowId: $tab.windowId });
    store.dispatch('minimizeApp');
  }
  replaceCurrentTab({ newValue: url }: Changes<'replaceCurrentTab'>) {
    const $tab = this.getCurrentTab();
    if (!$tab) {
      return;
    }
    chrome.tabs.update($tab.tabId, { url });
    chrome.windows.update($tab.windowId, { focused: true });
  }
  async addBookmarkFromTab({ newValue }: Changes<'addBookmarkFromTab'>, _: any, __: any, store: StoreSub) {
    const $tab = this.getCurrentTab();
    if (!$tab) {
      // chrome.windows.update(this.#windowId, { focused: false });
      return;
    }
    const { parentId = '1', index } = newValue ?? {};
    const tab = await chrome.tabs.get($tab.tabId);
    addBookmark(parentId, { ...tab, index }, store.dispatch);
  }
  focusWindow() {
    const $tab = this.getCurrentTab();
    if (!$tab) {
      return;
    }
    chrome.windows.update($tab.windowId, { focused: true });
  }
  setAppZoom({ newValue }: Changes<'setAppZoom'>) {
    this.windows.forEach((win) => win.setAppZoom(newValue));
  }
  override actions() {
    return {
      ...super.actions(),
      windowAction: makeAction({
        initValue: {
          type: '' as 'collapseWindow' | 'closeTab' | 'closeWindow' | 'pinWindowTop' | 'pinWindowBottom' | 'minimizeOthers',
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
        initValue: true,
        persistent: true,
      }),
      pinWindow: makeAction({
        initValue: {
          order: null,
          method: null,
        } as {
          order: number | null,
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
      windowStates: makeAction({
        initValue: [] as State['windowStates'],
        persistent: true,
      }),
      setCurrentWindowId: makeAction({
        initValue: undefined as SetCurrentWindow | undefined,
      }),
      onCreatedWindow: makeAction({
        initValue: undefined as chrome.windows.Window | undefined,
      }),
      onRemovedWindow: makeAction({
        initValue: undefined as number | undefined,
      }),
      onUpdateTab: makeAction({
        initValue: undefined as number | undefined,
      }),
      onActivatedTab: makeAction({
        initValue: undefined as number | undefined,
      }),
      addNewTab: makeAction({
        initValue: '',
      }),
      replaceCurrentTab: makeAction({
        initValue: '',
      }),
      addBookmarkFromTab: makeAction({
        initValue: undefined as chrome.bookmarks.BookmarkCreateArg | undefined,
      }),
      activateWindow: makeAction({
        initValue: '',
      }),
      minimizeApp: {},
    };
  }
  override connect(store: Store) {
    super.connect(store);
    this.#initPromise.then(() => {
      this.windows.forEach(($window) => $window.connect(store));
      this.checkAllCollapsed(undefined, undefined, undefined, store);
    });
    if (!this.#options.windowMode) {
      return;
    }
    // Window Mode
    postMessage({ type: CliMessageTypes.getWindowModeInfo }).then(({ currentWindowId }) => {
      if (currentWindowId && currentWindowId !== chrome.windows.WINDOW_ID_NONE) {
        this.setCurrentWindow(currentWindowId);
      }
    });
    chrome.windows.onCreated.addListener((win) => store.dispatch('onCreatedWindow', win, true), chromeEventFilter);
    chrome.windows.onRemoved.addListener((windowId) => store.dispatch('onRemovedWindow', windowId, true), chromeEventFilter);
    chrome.tabs.onUpdated.addListener((_, __, { windowId }) => store.dispatch('onUpdateTab', windowId, true));
    chrome.tabs.onRemoved.addListener((_, { windowId }) => store.dispatch('onUpdateTab', windowId, true));
    chrome.tabs.onMoved.addListener((_, { windowId }) => store.dispatch('onUpdateTab', windowId, true));
    chrome.tabs.onDetached.addListener((_, { oldWindowId: windowId }) => store.dispatch('onUpdateTab', windowId, true));
    chrome.tabs.onActivated.addListener(({ tabId }) => store.dispatch('onActivatedTab', tabId, true));
  }
}
