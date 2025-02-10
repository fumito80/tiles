/* eslint-disable import/prefer-default-export */
import { $, getAllWindows } from './client';
import { MulitiSelectablePaneBody, MulitiSelectablePaneHeader } from './multi-sel-pane';
import {
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
  #sortedTabs!: OpenTab[];
  private $tmplOpenTab!: OpenTab;
  private promiseInitTabs!: Promise<InitailTabs>;
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
        this.#sortedTabs = tabs.sort((a, b) => a.tabId - b.tabId);
      });
  }
  refresh(_: any, __: any, ___: any, store: StoreSub) {
    if (!this.#sortedTabs) {
      this.initTabs(store);
      return;
    }
    clearTimeout(this.timerRefresh);
    this.timerRefresh = setTimeout(() => {
      getAllWindows().then((windows) => {
        const newTabs = windows.flatMap((win) => win.tabs);
        let same = false;
        if (newTabs.length === this.#sortedTabs.length) {
          same = newTabs.sort((a, b) => a.id! - b.id!).every(
            (tab, i) => tab.id === this.#sortedTabs[i].tabId || tab.url === this.#sortedTabs[i].url,
          );
        }
        if (!same) {
          this.promiseInitTabs = Promise.resolve(windows);
          this.innerHTML = '';
          this.initTabs(store);
        }
      });
    }, 500);
  }
  onActivated() {
    this.promiseOnActivated = this.promiseOnActivated.then(getAllWindows).then((windows) => {
      const newTabs = windows.flatMap((win) => win.tabs).sort((a, b) => a.id! - b.id!);
      let i = 0;
      let j = 0;
      while (newTabs[i] && this.#sortedTabs[j]) {
        const diff = newTabs[i].id! - this.#sortedTabs[j].tabId;
        if (diff === 0) {
          this.#sortedTabs[j].lastAccessed = newTabs[i].lastAccessed;
          i += 1;
          j += 1;
        } else if (diff > 0) {
          // this.#sortedTabs[j].remove();
          j += 1;
        } else {
          // this.appendChild(this.addTab(newTabs[i], store.dispatch));
          i += 1;
        }
      }
      this.#sortedTabs = ([...this.children] as OpenTab[]).sort((a, b) => a.tabId - b.tabId);
      this.append(...this.#sortedTabs.slice()
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)));
    });
  }
  search({ reFilter, includeUrl }: SearchParams, dispatch: Dispatch) {
    this.#reFilter = reFilter;
    this.#includeUrl = includeUrl;
    dispatch('historyCollapseDate', { collapsed: false }, true);
  }
  clearSearch() {
    this.#includeUrl = false;
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
      chrome.windows.update(windowId, { focused: true });
      chrome.tabs.update($tab.tabId!, { active: true });
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
    };
  }
  override connect(store: Store) {
    super.connect(store);
    // this.$header.connect(store);
    // this.initTabs(store);
  }
}
