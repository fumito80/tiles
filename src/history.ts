/* eslint-disable max-classes-per-file */

import { MyHistoryItem, Options } from './types';
import {
  Dispatch, IPubSubElement, makeAction, States, Store,
} from './store';
import {
  $byClass, addChild, addClass, hasClass, rmAttr, rmStyle, setHTML, setText,
  createNewTab, setAnimationClass, toggleClass, insertHTML, $$byClass, rmClass,
} from './client';
import {
  delayMultiSelect,
  getHistoryById, getLocaleDate, isDateEq, pick, pipe, removeUrlHistory, setLocal,
} from './common';
import { ISearchable, SearchParams } from './search';
import { makeHistory } from './html';
import {
  getVScrollData,
  resetVScrollData,
  rowSetterHistory,
  searchCache,
  setScrollTop,
  setVScroll,
} from './vscroll';
import { MutiSelectableItem, PaneHeader } from './multi-sel-pane';

type ResetParams = {
  initialize?: boolean,
  reFilter?: RegExp,
  includeUrl?: boolean,
  removedHistory?: boolean,
};

function getRowHeight() {
  const $tester = pipe(
    addChild(document.createElement('div')),
    addClass('history'),
    setText('A'),
  )(document.body);
  const styles = getComputedStyle($tester!);
  const props = pick('marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'height')(styles);
  const rowHeight = Object.values(props)
    .reduce((acc, value) => acc + Number.parseFloat(String(value)), 0);
  $tester!.remove();
  return rowHeight;
}

function searchHistory(source: MyHistoryItem[], reFilter: RegExp, includeUrl: boolean) {
  const [results] = source.reduce(([result, prevHeaderDate], el) => {
    if (el.headerDate) {
      return [result, el];
    }
    if (!reFilter.test(el.title || el.url || '') && !(includeUrl && reFilter.test(el.url || ''))) {
      return [result, prevHeaderDate];
    }
    if (!prevHeaderDate) {
      return [[...result, el], null];
    }
    return [[...result, prevHeaderDate, el], null];
  }, [[], null] as [MyHistoryItem[], MyHistoryItem | null]);
  return results;
}

export class HistoryItem extends MutiSelectableItem {
  async getUrl() {
    const { url } = await getHistoryById(this.id);
    return url;
  }
  async open(options: Options) {
    if (this.checkMultiSelect()) {
      return;
    }
    // const $url = $target.title ? $target : $parent;
    const url = await this.getUrl();
    if (!url) {
      return;
    }
    // if (hasClass($target, 'icon-x')) {
    //   setAnimationClass('hilite')($parent);
    //   chrome.history.deleteUrl({ url }).then(() => resetVScrollData(removeUrlHistory(url)));
    //   return;
    // }
    createNewTab(options, url);
  }
  async delete() {
    const url = await this.getUrl();
    if (!url) {
      return;
    }
    setAnimationClass('hilite')(this);
    chrome.history.deleteUrl({ url }).then(() => resetVScrollData(removeUrlHistory(url)));
  }
}

export class History extends HTMLDivElement implements IPubSubElement, ISearchable {
  #options!: Options;
  #includeUrl!: boolean;
  #reFilter!: RegExp | null;
  #jumpDate = '';
  #rowHeight!: number;
  #timerMultiSelect!: number;
  #lastClickedId!: string | undefined;
  private $rows!: HTMLElement;
  private promiseInitHistory!: Promise<MyHistoryItem[]>;
  init(
    promiseInitHistory: Promise<MyHistoryItem[]>,
    options: Options,
    htmlHistory: string,
    isSearching: boolean,
  ) {
    this.#options = options;
    this.promiseInitHistory = promiseInitHistory;
    this.$rows = $byClass('rows', this)!;
    if (isSearching) {
      const header = '<div class="current-date history header-date" style="transform: translateY(-10000px)"></div>';
      const line = '<div class="history" draggable="true" style="transform: translateY(-10000px);"></div>';
      const lines = Array(32).fill(line).join('');
      insertHTML('afterbegin', header + lines)(this.firstElementChild);
    } else {
      insertHTML('afterbegin', htmlHistory)(this.firstElementChild);
    }
    const rowHeight = getRowHeight();
    setLocal({ vscrollProps: { rowHeight } });
    this.#rowHeight = rowHeight;
  }
  search({ reFilter, includeUrl }: SearchParams, dispatch: Store['dispatch']) {
    this.#reFilter = reFilter;
    this.#includeUrl = includeUrl;
    dispatch('historyCollapseDate', false, true);
  }
  async resetHistory({ initialize }: ResetParams = {}) {
    const [init, ...tail] = await this.promiseInitHistory;
    let histories = [init, ...tail];
    if (initialize && !init.headerDate && !isDateEq(init.lastVisitTime, new Date())) {
      const headerDate = { headerDate: true, lastVisitTime: init.lastVisitTime };
      histories = [headerDate, init, ...tail];
      const headerDateHtml = makeHistory({ ...headerDate });
      this.$rows.firstElementChild?.insertAdjacentHTML('afterend', headerDateHtml);
    }
    const queryValue = this.#reFilter?.source;
    let data: MyHistoryItem[] | undefined = histories;
    if (queryValue) {
      data = searchCache.get(queryValue);
      if (!data) {
        data = searchHistory(histories, this.#reFilter!, this.#includeUrl);
        searchCache.set(this.#reFilter!.source, data);
      }
    }
    setVScroll(this, rowSetterHistory, data, this.#rowHeight);
    if (initialize) {
      $$byClass('init').forEach(rmClass('init'));
    }
    if (this.#reFilter || !initialize) {
      [...this.$rows?.children || []].forEach(
        pipe(
          rmStyle('background-image'),
          rmAttr('title'),
          setHTML(''),
        ),
      );
      this.scrollTop = 0;
    }
    this.dispatchEvent(new Event('scroll'));
  }
  async restoreHistory() {
    return this.resetHistory({ reFilter: this.#reFilter!, includeUrl: this.#includeUrl });
  }
  clearSearch(dispatch: Store['dispatch']) {
    this.#reFilter = null;
    dispatch('historyCollapseDate', false, true);
  }
  async collapseHistoryDate(collapsed: boolean) {
    if (!collapsed) {
      await this.restoreHistory();
      if (this.#jumpDate) {
        this.jumpDate();
      }
      return;
    }
    const histories = getVScrollData();
    const data = histories.filter((item) => item.headerDate);
    setVScroll(this, rowSetterHistory, data, this.#rowHeight, false);
    setScrollTop(0);
  }
  async jumpHistoryDate(localeDate: string, dispatch: Store['dispatch']) {
    this.#jumpDate = localeDate;
    dispatch('historyCollapseDate', false, true);
  }
  async jumpDate() {
    const histories = getVScrollData();
    const index = histories.findIndex(
      (item) => item.headerDate && getLocaleDate(item.lastVisitTime) === this.#jumpDate,
    );
    setScrollTop(this.#rowHeight * index);
    this.#jumpDate = '';
  }
  selectWithShift($target: HistoryItem) {
    if (this.#lastClickedId !== $target.id) {
      // const Histories = [] as HistoryItem[];
      // let started = false;
      // for (
      //   let next = $target.parentElement?.firstElementChild as OpenTab | Element | null;
      //   next != null;
      //   next = next.nextElementSibling
      // ) {
      //   if (next === $target || next === this.$lastClickedTab) {
      //     if (started) {
      //       OpenTabs.push(next as OpenTab);
      //       break;
      //     }
      //     started = true;
      //   }
      //   if (started && next instanceof OpenTab) {
      //     OpenTabs.push(next);
      //   }
      // }
      // OpenTabs.forEach(($tab) => $tab.select(true));
    }
  }
  async clickItem(e: MouseEvent, states: Store['getStates'], dispatch: Store['dispatch']) {
    const $target = e.target as HTMLElement;
    if (hasClass($target, 'header-date')) {
      states('historyCollapseDate', (collapsed) => {
        if (collapsed) {
          this.jumpHistoryDate($target.textContent!, dispatch);
        }
      });
      return;
    }
    const $history = $target.parentElement;
    if ($history instanceof HistoryItem) {
      if (hasClass($target, 'icon-x')) {
        $history.delete();
        return;
      }
      const { history, all } = await states('multiSelPanes');
      if (history || all) {
        $history.select();
        if (all) {
          dispatch('multiSelPanes', { history: true });
        }
        if (e.shiftKey) {
          this.selectWithShift($history);
        }
        this.#lastClickedId = $history.id;
        return;
      }
      $history.open(this.#options);
    }
    // const $parent = $target.parentElement!;
    // const $url = $target.title ? $target : $parent;
    // const { url } = await getHistoryById($url.id);
    // if (!url) {
    //   return;
    // }
    // if (hasClass($target, 'icon-x')) {
    //   setAnimationClass('hilite')($parent);
    //   chrome.history.deleteUrl({ url }).then(() => resetVScrollData(removeUrlHistory(url)));
    //   return;
    // }
    // createNewTab(this.#options, url);
  }
  // eslint-disable-next-line class-methods-use-this
  multiSelect({ history: multiSelect }: { history?: boolean }) {
    if (!multiSelect) {
      // this.getWindows()
      //   .flatMap((win) => win.getTabs())
      //   .filter((tab) => tab.selected)
      //   .forEach((tab) => tab.select(false));
      // this.$lastClickedTab = undefined;
    }
  }
  mousedownItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $history = (e.target as HTMLElement).parentElement;
    if ($history instanceof HistoryItem && !hasClass($history, 'header-date')) {
      clearTimeout(this.#timerMultiSelect);
      this.#timerMultiSelect = setTimeout(
        async () => {
          const { dragging, multiSelPanes } = await states();
          if (dragging) {
            return;
          }
          dispatch('multiSelPanes', { history: !multiSelPanes?.history });
          $history.preMultiSelect(!multiSelPanes?.history);
        },
        delayMultiSelect,
      );
    }
  }
  mouseupItem() {
    clearTimeout(this.#timerMultiSelect);
  }
  actions() {
    return {
      resetHistory: makeAction({
        initValue: {} as ResetParams,
      }),
      clickHistory: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mousedownHistory: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
      }),
      mouseupHistory: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('clickHistory', (_, states, dispatch, e) => this.clickItem(e, states, dispatch));
    store.subscribe('clearSearch', (_, __, dispatch) => this.clearSearch(dispatch));
    store.subscribe('resetHistory', (changes) => this.resetHistory(changes.newValue));
    store.subscribe('historyCollapseDate', (changes) => this.collapseHistoryDate(changes.newValue));
    store.subscribe('changeIncludeUrl', (changes) => {
      this.#includeUrl = changes.newValue;
    });
    store.subscribe('mousedownHistory', (_, states, dispatch, e) => this.mousedownItem(e, states, dispatch));
    store.subscribe('mouseupHistory', this.mouseupItem.bind(this));
    store.subscribe('multiSelPanes', ({ newValue }) => this.multiSelect(newValue));
  }
}

export class HeaderHistory extends PaneHeader implements IPubSubElement {
  toggleCollapseIcon(collapsed: boolean) {
    toggleClass('date-collapsed', collapsed)(this);
  }
  // eslint-disable-next-line class-methods-use-this
  get multiSelPaneParams() {
    return {
      className: 'history',
      deleteHandler: ($selecteds: HTMLElement[]) => {
        $selecteds
          .filter(($el): $el is History => $el instanceof History);
        // .map(($history) => $history.url)
        // .forEach(chrome.history.deleteUrl);
      },
    } as const;
  }
  // eslint-disable-next-line class-methods-use-this
  menuClickHandler(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    switch ($target.dataset.value) {
      case 'open-new-tab': {
        // getSelecteds().reverse()
        //   .filter(($el): $el is Leaf => $el instanceof Leaf)
        //   .forEach((leaf) => leaf.openBookmark(this.options, OpenBookmarkType.tab));
        break;
      }
      case 'open-incognito':
      case 'open-new-window': {
        // const selecteds = getSelecteds().map(prop('id'));
        // dropBmInNewWindow(selecteds, 'leaf', $target.dataset.value === 'open-incognito');
        break;
      }
      default:
    }
  }
  override actions() {
    return {
      ...super.actions(),
      historyCollapseDate: makeAction({
        initValue: false,
        target: $byClass('collapse-history-date', this),
        eventType: 'click',
        eventProcesser: (_, currentValue) => !currentValue,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    store.subscribe('historyCollapseDate', (changes) => this.toggleCollapseIcon(changes.newValue));
  }
}
