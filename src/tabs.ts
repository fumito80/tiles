/* eslint-disable max-classes-per-file */

import {
  $$byClass, $byClass, $byTag,
  addClass, addStyle, hasClass, rmClass, rmStyle, setAnimationClass, showMenu, toggleClass,
} from './client';
import {
  addListener, extractDomain, htmlEscape, makeStyleIcon, pipe,
} from './common';
import {
  IPubSubElement, ISubscribeElement, makeAction, Store,
} from './store';

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
  if (tab.url?.startsWith('file://')) {
    return {
      'data-initial': htmlEscape(tab.title!.substring(0, 1)),
      'data-file': 'yes',
    };
  }
  if (tab.favIconUrl || !tab.url?.startsWith('http')) {
    const faviconUrl = makeStyleIcon(tab.url);
    return { style: faviconUrl };
  }
  return { 'data-initial': htmlEscape(tab.title!.substring(0, 1)) };
}

function getTooltip(tab: chrome.tabs.Tab) {
  if (tab.url?.startsWith('file:///')) {
    return htmlEscape(`${tab.title}\n${tab.url}`);
  }
  const [scheme, domain] = extractDomain(tab.url);
  const schemeAdd = scheme.startsWith('https') ? '' : scheme;
  return htmlEscape(`${tab.title}\n${schemeAdd}${domain}`);
}

export class OpenTab extends HTMLElement implements ISubscribeElement {
  #windowId = -1;
  #tabId = -1;
  private $main = $byTag('main');
  private $tooltip = $byClass('tooltip', this);
  init(tab: chrome.tabs.Tab) {
    this.updateTab(tab);
    this.#tabId = tab.id!;
    this.id = `tab-${tab.id}`;
    const [$tab,, $tooltip] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    $tooltip.textContent = tooltip;
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
    return this;
  }
  updateTab(tab: chrome.tabs.Tab) {
    this.#windowId = tab.windowId;
    this.classList.toggle('current-tab', tab.active);
  }
  // moveWindow(windowId: number, index: number) {
  //   chrome.tabs.move(this.#tabId, { windowId, index }, this.updateTab.bind(this));
  // }
  gotoTab() {
    chrome.windows.update(this.#windowId, { focused: true });
    chrome.tabs.update(this.#tabId, { active: true }, window.close);
  }
  closeTab(store: Store) {
    return (e: MouseEvent) => {
      e.stopPropagation();
      this.addEventListener('animationend', () => {
        chrome.tabs.remove(this.#tabId, () => {
          this.remove();
          store.dispatch('closeTab', this.#windowId, true);
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
    addListener('click', this.gotoTab)(this);
    addListener('mouseover', this.setTooltipPosition)(this);
  }
}

export class WindowHeader extends HTMLElement implements ISubscribeElement {
  #windowId = -1;
  private $btnCollapseTabs = $byClass<HTMLButtonElement>('collapse-tab', this);
  private $tabsMenu = $byClass('tabs-menu', this);
  init(tab: chrome.tabs.Tab) {
    this.#windowId = tab.windowId;
    const [$iconIncognito, $tab] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    if (!tab.incognito) {
      $iconIncognito.remove();
    }
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
    pipe(
      addListener('click', showMenu(this.$tabsMenu)),
      addListener('mousedown', () => addStyle({ top: '-1000px' })(this.$tabsMenu)),
    )($byClass('tabs-menu-button', this));
    return this;
  }
  connect(store: Store) {
    this.$btnCollapseTabs.addEventListener('click', () => {
      store.dispatch('collapseWindow', this.#windowId, true);
    });
    pipe(
      addListener('click', (e) => {
        const $target = e.target as HTMLElement;
        switch ($target.dataset.value) {
          case 'add-new-tab': {
            chrome.tabs.create({ windowId: this.#windowId });
            chrome.windows.update(this.#windowId, { focused: true });
            break;
          }
          case 'close-window':
            store.dispatch('closeWindow', this.#windowId, true);
            break;
          default:
        }
      }),
      addListener('mousedown', (e) => e.preventDefault()),
    )(this.$tabsMenu);
  }
}

export class Window extends HTMLElement implements ISubscribeElement {
  #windowId = -1;
  private $header = this.firstElementChild as WindowHeader;
  private $openTabs: OpenTab[] | null = null;
  init(
    windowId: number,
    isCurrent: boolean,
    tmplTab: OpenTab,
    [firstTab, ...rest]: chrome.tabs.Tab[],
    collapseTabs: boolean,
  ) {
    this.switchCollapseIcon(collapseTabs);
    this.#windowId = windowId;
    this.id = `win-${windowId}`;
    this.classList.toggle('current-window', isCurrent);
    this.$header.init(firstTab);
    this.$openTabs = this.addTabs([firstTab, ...rest], tmplTab);
    this.addEventListener('click', (e) => {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'tabs-header', 'collapse-tab')) {
        return;
      }
      chrome.windows.update(this.#windowId, { focused: true });
    });
    return this;
  }
  addTab(tab: chrome.tabs.Tab, tmplTab: OpenTab) {
    const $openTab = this.appendChild(document.importNode(tmplTab, true));
    return $openTab.init(tab);
  }
  addTabs(tabs: chrome.tabs.Tab[], tmplTab: OpenTab) {
    return tabs.map((tab) => this.addTab(tab, tmplTab));
  }
  switchCollapseIcon(collapsed: boolean) {
    toggleClass('tabs-collapsed', collapsed)(this);
  }
  getTab(id: string) {
    return this.$openTabs?.find(($tab) => $tab.id === id);
  }
  refreshTabs() {
    chrome.windows.get(this.#windowId, { populate: true }, (win) => {
      win.tabs!.forEach((tab) => {
        this.getTab(`tab-${tab.id}`)?.updateTab(tab);
      });
    });
  }
  connect(store: Store) {
    this.$header.connect(store);
    this.$openTabs?.forEach(($openTab) => $openTab.connect(store));
    store.subscribe('collapseWindowsAll', (changes) => {
      this.switchCollapseIcon(changes.newValue);
    });
    store.subscribe('collapseWindow', (changes) => {
      if (changes.newValue !== this.#windowId) {
        return;
      }
      collapseTab(store, this);
    });
    store.subscribe('closeTab', (changes) => {
      if (changes.newValue !== this.#windowId) {
        return;
      }
      if (this.childElementCount <= 1) {
        this.remove();
      }
    });
    store.subscribe('closeWindow', (changes) => {
      if (changes.newValue === this.#windowId) {
        chrome.windows.remove(this.#windowId, () => this.remove());
      }
    });
  }
}

export class Tabs extends HTMLDivElement implements IPubSubElement {
  #tabsWrap = this.firstElementChild!;
  #initPromise: Promise<void> | null = null;
  private $windows: Window[] | null = null;
  async init(
    $tmplOpenTab: OpenTab,
    $tmplWindow: Window,
    collapseTabs: boolean,
  ) {
    const queryOptions = { windowTypes: ['normal', 'app'] } as chrome.windows.WindowEventFilter;
    this.#initPromise = new Promise<void>((resolve) => {
      chrome.windows.getCurrent(queryOptions, (currentWindow) => {
        chrome.windows.getAll({ ...queryOptions, populate: true }, (windows) => {
          this.$windows = windows.map((win) => {
            const $window = this.#tabsWrap.appendChild(document.importNode($tmplWindow, true));
            return $window.init(
              win.id!,
              currentWindow.id === win.id,
              $tmplOpenTab,
              win.tabs!,
              collapseTabs,
            );
          });
          resolve();
        });
      });
    });
    return this;
  }
  // eslint-disable-next-line class-methods-use-this
  provideActions() {
    return {
      collapseWindow: makeAction({ initValue: -1 }),
      closeTab: makeAction({ initValue: -1 }),
      closeWindow: makeAction({ initValue: -1 }),
    };
  }
  connect(store: Store) {
    this.#initPromise?.then(() => {
      this.$windows?.forEach(($window) => $window.connect(store));
      store.subscribe('scrollNextWindow', () => switchTabWindow(this, true));
      store.subscribe('scrollPrevWindow', () => switchTabWindow(this, false));
    });
  }
  // search(selectorTabs: ) {
  //   $$byClass(selectorTabs, $paneTabs).forEach((el) => {
  //     const tab = el.firstElementChild as HTMLElement;
  //     const isMatch = reFilter.test(tab.textContent!)
  //       || (includeUrl && reFilter.test(extractUrl(el.style.backgroundImage)));
  //     el.classList.toggle('match', isMatch);
  //     el.classList.toggle('unmatch', !isMatch);
  //   });
  //   ([...$paneTabs.children] as HTMLElement[])
  //     .forEach((win) => win.classList.toggle('empty', win.offsetHeight < 10));
  // }
}

export class HeaderTabs extends HTMLDivElement implements IPubSubElement {
  #collapsed = true;
  private $buttonCollapse = $byClass('collapse-tabs', this);
  private $buttonPrevWin = $byClass('win-prev', this);
  private $buttonNextWin = $byClass('win-next', this);
  init(collapsed: boolean) {
    this.#collapsed = collapsed;
    this.switchCollapseIcon(collapsed);
  }
  provideActions() {
    return {
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
  switchCollapseIcon(collapsed: boolean) {
    toggleClass('tabs-collapsed-all', collapsed)(this);
  }
  connect(store: Store) {
    store.subscribe('collapseWindowsAll', (changes) => this.switchCollapseIcon(changes.newValue));
    this.$buttonPrevWin.addEventListener('click', () => store.dispatch('scrollPrevWindow', null, true));
    this.$buttonNextWin.addEventListener('click', () => store.dispatch('scrollNextWindow', null, true));
  }
}
