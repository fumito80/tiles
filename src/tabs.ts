/* eslint-disable max-classes-per-file */

import { extractDomain, htmlEscape, makeStyleIcon } from './common';

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

export class WindowHeader extends HTMLDivElement {
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

export class OpenTab extends HTMLDivElement {
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

export class OpenTabs extends HTMLDivElement {
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
