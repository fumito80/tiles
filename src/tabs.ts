/* eslint-disable max-classes-per-file */

import { $byClass, toggleClass, toggleElement } from './client';
import { extractDomain, htmlEscape, makeStyleIcon } from './common';
import { IPubSubElement, makeAction, Store } from './store';

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

export class WindowHeader extends HTMLElement {
  init(tab: chrome.tabs.Tab) {
    const [$iconIncognito, $tab] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    if (!tab.incognito) {
      $iconIncognito.remove();
    }
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
  }
}

export class OpenTab extends HTMLElement {
  init(tab: chrome.tabs.Tab) {
    this.id = `tab-${tab.id}`;
    this.classList.toggle('current-tab', tab.active);
    const [$tab,, $tooltip] = [...this.children];
    $tab.textContent = tab.title!;
    const tooltip = getTooltip(tab);
    $tab.setAttribute('title', tooltip);
    $tooltip.textContent = tooltip;
    Object.entries(getTabFaviconAttr(tab)).forEach(([k, v]) => this.setAttribute(k, v));
  }
}

export class Window extends HTMLElement {
  #tmplTab: OpenTab | null = null;
  #tmplHeader: WindowHeader | null = null;
  init(
    windowId: number,
    isCurrent: boolean,
    isCollapsed: boolean,
    tmplTab: OpenTab,
    tmplHeader: WindowHeader,
    tabs?: chrome.tabs.Tab[],
  ) {
    this.id = `win-${windowId}`;
    this.classList.toggle('current-window', isCurrent);
    this.classList.toggle('tabs-collapsed', isCollapsed);
    this.#tmplTab = tmplTab;
    this.#tmplHeader = tmplHeader;
    this.addTabs(tabs!);
  }
  addTab(tab: chrome.tabs.Tab, template: OpenTab | WindowHeader) {
    const $openTab = this.appendChild(document.importNode(template, true));
    $openTab.init(tab);
  }
  addTabs([first, ...rest]: chrome.tabs.Tab[]) {
    this.addTab(first, this.#tmplHeader!);
    [first, ...rest].forEach((tab) => this.addTab(tab, this.#tmplTab!));
  }
}

export class Tabs extends HTMLDivElement {
  init(
    store: Store,
    windows: chrome.windows.Window[],
    currentWindowId: number,
    isCollapse: boolean,
    tmplOpenTab: OpenTab,
    tmplHeader: WindowHeader,
    tmplWindows: Window,
  ) {
    windows.forEach((win) => {
      const $win = this.firstElementChild!.appendChild(document.importNode(tmplWindows, true));
      $win.init(
        win.id!,
        currentWindowId === win.id,
        isCollapse,
        tmplOpenTab,
        tmplHeader,
        win.tabs,
      );
    });
    store.subscribe('collapsed-all', (changes) => {
      [...this.firstElementChild!.children].forEach(toggleClass('tabs-collapsed', changes.newValue));
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
  #buttonCollapse = $byClass('collapse-tabs', this);
  init(collapsed: boolean) {
    this.#collapsed = collapsed;
  }
  provideActions() {
    return {
      'collapsed-all': makeAction({
        initValue: !this.#collapsed,
        target: this.#buttonCollapse,
        eventType: 'click',
        valueProcesser: (_, currentValue) => !currentValue,
      }),
    };
  }
  setStore(store: Store) {
    store.subscribe('collapsed-all', (changes) => {
      toggleElement(changes.newValue)($byClass('icon-list', this));
      toggleElement(!changes.newValue)($byClass('icon-grid', this));
    });
    store.dispatch('collapsed-all', this.#collapsed);
  }
}
