/* eslint-disable import/prefer-default-export */
import {
  $, $$byClass, $$byTag, getAllWindows, rmClass, toggleClass,
} from './client';
import { decodeUrl, pipe } from './common';
import { MulitiSelectablePaneBody, MulitiSelectablePaneHeader } from './multi-sel-pane';
import {
  Changes,
  Dispatch, IPubSubElement, States, Store, StoreSub, makeAction,
} from './popup';
import { ISearchable, SearchParams } from './search';
import { isOpenTab, OpenTab } from './tabs';
import { InitailTabs, Options, PromiseInitTabs } from './types';

export class HeaderRecentTabs extends MulitiSelectablePaneHeader implements IPubSubElement {
  readonly paneName = 'recent-tabs';
  // multiSelPanes({ newValue }: Changes<'multiSelPanes'>) {
  //   const isMultiSelect = Object.values(newValue).some((value) => !!value);
  //   $$byTag('button', this).forEach(toggleClass('hidden', isMultiSelect));
  // }
  readonly multiDeletesTitle = 'Close selected tabs';
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
      // historyCollapseDate: makeAction({
      //   initValue: {
      //     collapsed: false,
      //     jumpDate: '',
      //   } as {
      //     collapsed: boolean,
      //     jumpDate?: string,
      //   },
      //   target: $byClass('collapse-history-date', this),
      //   eventType: 'click',
      //   eventProcesser: (_, { collapsed }) => ({ jumpDate: '', collapsed: !collapsed }),
      // }),
      // toggleRecentlyClosed: makeAction({
      //   initValue: false,
      //   target: $byClass('toggle-recently-closed', this),
      //   eventType: 'click',
      //   eventProcesser: (_, currentValue) => !currentValue,
      // }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    // this.store = store;
  }
}

export class RecentTabs extends MulitiSelectablePaneBody implements IPubSubElement, ISearchable {
  readonly paneName = 'recent-tabs';
  #options!: Options;
  #isSearching = false;
  #reFilter: RegExp | undefined;
  #includeUrl: Boolean | undefined;
  #lastTabs!: { [tabId: string]: OpenTab };
  private $tmplOpenTab!: OpenTab;
  private promiseInitTabs!: Promise<InitailTabs>;
  private promiseReadyTabs = Promise.withResolvers();
  private promiseOnActivated = Promise.resolve();
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
          const sortedTabs = ([...this.children] as OpenTab[]).sort((a, b) => a.tabId - b.tabId);
          this.append(...sortedTabs.slice().sort((a, b) => (b.lastAccessed!) - (a.lastAccessed!)));
        }
        if (!matches || removes.length > 0) {
          this.#lastTabs = ([...this.children] as OpenTab[])
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
          const { windowId } = $tab;
          $tab.remove();
          return windowId;
        })
        .filter((id, i, ids) => ids.indexOf(id) === i)
        .forEach((windowId) => dispatch('windowAction', { type: 'closeTab', windowId }, true));
      // this.selectItems(dispatch);
    });
  }
  // eslint-disable-next-line class-methods-use-this
  async clickRecentTab(_: any, e: MouseEvent, states: States, store: StoreSub) {
    const $target = e.target as HTMLDivElement;
    const $tab = isOpenTab($target);
    if ($tab) {
      const { windows, all } = states.multiSelPanes!;
      if (windows || all) {
        $tab.select();
        if (all) {
          store.dispatch('multiSelPanes', { windows: true, all: false });
        }
        // if (e.shiftKey) {
        //   this.selectWithShift($target);
        // }
        // this.selectItems(store.dispatch);
        // this.$lastClickedTab = $target;
        return;
      }
      if (all == null) {
        store.dispatch('multiSelPanes', { all: false });
        return;
      }
      // if (this.checkMultiSelect()) {
      //   return;
      // }
      const { windowId } = ($(`.windows #tab-${$tab.tabId}`) as OpenTab);
      const temporaryTab = $tab.isCurrent
        ? await chrome.tabs.create({ windowId, active: true })
        : undefined;
      chrome.tabs.update($tab.tabId!, { active: true });
      if (temporaryTab) {
        chrome.tabs.remove(temporaryTab.id!);
      }
      chrome.windows.update(windowId, { focused: true });
    }
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
    };
  }
  override connect(store: Store) {
    super.connect(store);
    // this.$header.connect(store);
    // this.initTabs(store);
  }
}
