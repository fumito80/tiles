import {
  $, $$byClass, $$byTag, getAllWindows, getChildren, rmClass, toggleClass,
} from './client';
import { decodeUrl, pipe } from './common';
import { MulitiSelectablePaneHeader } from './multi-sel-pane';
import {
  Changes, Dispatch, IPubSubElement, Store, StoreSub, makeAction,
} from './popup';
import { ISearchable, SearchParams } from './search';
import { OpenTab, TabsBase } from './tabs';
import { InitailTabs, Options, PromiseInitTabs } from './types';

export class HeaderRecentTabs extends MulitiSelectablePaneHeader {
  readonly paneName = 'recent-tabs';
  readonly multiDeletesTitle = 'Close selected tabs';
  // eslint-disable-next-line class-methods-use-this
  menuClickHandler(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    switch ($target.dataset.value) {
      default:
    }
  }
}

export class RecentTabs extends TabsBase implements IPubSubElement, ISearchable {
  override readonly paneName = 'recent-tabs';
  #options!: Options;
  #isSearching = false;
  #lastTabs!: { [tabId: string]: OpenTab };
  private $tmplOpenTab!: OpenTab;
  private promiseInitTabs!: Promise<InitailTabs>;
  private promiseReadyTabs = Promise.withResolvers();
  private timerRefresh = 0;
  init(
    $template: DocumentFragment,
    options: Options,
    isSearching: boolean,
    promiseInitTabs: PromiseInitTabs,
  ) {
    this.#options = options;
    this.#isSearching = isSearching;
    this.$tmplOpenTab = $('open-tab', $template) as OpenTab;
    this.promiseInitTabs = promiseInitTabs.then(([windows]) => windows);
  }
  addTab(tab: chrome.tabs.Tab, dispatch: Dispatch) {
    const $openTab = document.importNode(this.$tmplOpenTab!, true);
    return $openTab.init(tab, this.#isSearching, dispatch);
  }
  addTabs(tabs: chrome.tabs.Tab[], dispatch: Dispatch) {
    const $tabs = tabs.map((tab) => this.addTab(tab, dispatch));
    this.append(...$tabs);
    return $tabs;
  }
  initTabs(store: StoreSub) {
    this.promiseInitTabs
      .then((windows) => windows
        .flatMap((win) => win.tabs)
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)))
      .then((tabs) => this.addTabs(tabs, store.dispatch))
      .then((tabs) => {
        this.#lastTabs = tabs.reduce((acc, tab) => ({ ...acc, [tab.tabId]: tab }), {});
      })
      .then(this.promiseReadyTabs.resolve);
  }
  refresh(_: any, __: any, ___: any, store: StoreSub) {
    if (!this.#lastTabs) {
      this.initTabs(store);
      return;
    }
    clearTimeout(this.timerRefresh);
    this.timerRefresh = setTimeout(() => {
      getAllWindows().then((windows) => {
        const newTabs: { [tabId: string]: chrome.tabs.Tab } = windows
          .flatMap((win) => win.tabs)
          .reduce((acc, tab) => ({ ...acc, [tab.id!]: tab }), {});
        let matches = true;
        let matchesLastAccessed = true;
        Object.entries(newTabs).forEach(([k, newTab]) => {
          const lastTab = this.#lastTabs[k];
          if (!lastTab) {
            this.prepend(this.addTab(newTab, store.dispatch));
            matches = false;
            return;
          }
          matchesLastAccessed = matchesLastAccessed && newTab.lastAccessed! > lastTab.lastAccessed!;
          if (newTab.title !== lastTab.title
            || decodeUrl(newTab.url || newTab.pendingUrl) !== lastTab.url) {
            const $newTab = this.addTab(newTab, store.dispatch);
            lastTab.replaceWith($newTab);
            matches = false;
            return;
          }
          lastTab.update(newTab);
        });
        let removes = [];
        if (Object.keys(newTabs).length !== Object.keys(this.#lastTabs).length) {
          removes = Object.entries(this.#lastTabs)
            .filter(([k]) => !newTabs[k])
            .map(([, v]) => v.remove());
        }
        if (!matchesLastAccessed) {
          const sortedTabs = this.getAllTabs().sort((a, b) => a.tabId - b.tabId);
          this.append(...sortedTabs.slice().sort((a, b) => (b.lastAccessed!) - (a.lastAccessed!)));
        }
        if (!matches || removes.length > 0) {
          this.#lastTabs = this.getAllTabs()
            .reduce((acc, tab) => ({ ...acc, [tab.tabId]: tab }), {});
        }
      });
    }, 500);
  }
  async onActivated({ newValue: tabId }: Changes<'onActivatedTab'>) {
    const $target = this.#lastTabs[tabId];
    if (!$target) {
      return;
    }
    this.prepend($target);
    chrome.tabs.get(tabId).then($target.update.bind($target));
  }
  override getAllTabs(filter: (tab: OpenTab) => boolean = () => true) {
    return getChildren<OpenTab>(this).filter(filter);
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams) {
    if (!reFilter) {
      return;
    }
    this.promiseReadyTabs.promise.then(() => {
      const tester = includeUrl
        ? (tab: OpenTab) => reFilter.test(tab.textContent + tab.url)
        : (tab: OpenTab) => reFilter.test(tab.text!);
      $$byClass<OpenTab>(searchSelector, this).forEach((tab) => {
        const isMatch = tester(tab);
        pipe(toggleClass('match', isMatch), toggleClass('unmatch', !isMatch))(tab);
      });
    });
  }
  clearSearch() {
    $$byTag('open-tab', this).forEach(rmClass('match', 'unmatch'));
  }
  override actions() {
    return {
      ...super.actions(),
      clickRecentTab: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mouseoverRecentTabs: makeAction({
        target: this,
        eventType: 'mouseover',
        eventOnly: true,
        noStates: true,
      }),
      mouseoutRecentTabs: makeAction({
        target: this,
        eventType: 'mouseout',
        eventOnly: true,
        noStates: true,
      }),
      mousedownRecentTabs: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
        noStates: true,
      }),
      mouseupRecentTabs: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
        noStates: true,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    if (!this.#options.windowMode) {
      this.initTabs(store);
    }
  }
}
