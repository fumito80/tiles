/* eslint-disable max-classes-per-file */

import { MyHistoryItem, Options } from './types';
import { IPubSubElement, makeAction, Store } from './store';
import {
  $byClass, addChild, addClass, hasClass, rmAttr, rmStyle, setHTML, setText,
  createNewTab, setAnimationClass, toggleClass, insertHTML, $$byClass, rmClass,
} from './client';
import {
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
import { PaneHeader } from './bookmarks';

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
  const styles = getComputedStyle($tester);
  const props = pick('marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'height')(styles);
  const rowHeight = Object.values(props)
    .reduce((acc, value) => acc + Number.parseFloat(String(value)), 0);
  $tester.remove();
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

export class History extends HTMLDivElement implements IPubSubElement, ISearchable {
  #includeUrl!: boolean;
  #reFilter!: RegExp | null;
  #jumpDate = '';
  #rowHeight!: number;
  #store!: Store;
  private $rows!: HTMLElement;
  private promiseInitHistory!: Promise<MyHistoryItem[]>;
  init(
    promiseInitHistory: Promise<MyHistoryItem[]>,
    options: Options,
    htmlHistory: string,
    isSearching: boolean,
  ) {
    this.promiseInitHistory = promiseInitHistory;
    this.$rows = $byClass('rows', this)!;
    if (isSearching) {
      const header = '<div class="current-date history header-date" style="transform: translateY(-10000px)"></div>';
      const line = '<div class="history" draggable="true" style="transform: translateY(-10000px);"></div>';
      const lines = Array(30).fill(line).join('');
      insertHTML('afterbegin', header + lines)(this.firstElementChild);
    } else {
      insertHTML('afterbegin', htmlHistory)(this.firstElementChild);
    }
    this.setEvents(options);
    const rowHeight = getRowHeight();
    setLocal({ vscrollProps: { rowHeight } });
    this.#rowHeight = rowHeight;
  }
  setEvents(options: Options) {
    this.addEventListener('click', async (e) => {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'header-date')) {
        this.#store.getState('historyCollapseDate', (collapsed) => {
          if (collapsed) {
            this.jumpHistoryDate($target.textContent!);
          }
        });
        return;
      }
      const $parent = $target.parentElement!;
      const $url = $target.title ? $target : $parent;
      const { url } = await getHistoryById($url.id);
      if (!url) {
        return;
      }
      if (hasClass($target, 'icon-x')) {
        setAnimationClass('hilite')($parent);
        chrome.history.deleteUrl({ url }).then(() => resetVScrollData(removeUrlHistory(url)));
        return;
      }
      createNewTab(options, url);
    });
  }
  search({ reFilter, includeUrl }: SearchParams) {
    this.#reFilter = reFilter;
    this.#includeUrl = includeUrl;
    this.#store.dispatch('historyCollapseDate', false, true);
  }
  async resetHistory({
    initialize,
  }: ResetParams = {}) {
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
  clearSearch() {
    this.#reFilter = null;
    this.#store.dispatch('historyCollapseDate', false, true);
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
  async jumpHistoryDate(localeDate: string) {
    this.#jumpDate = localeDate;
    this.#store.dispatch('historyCollapseDate', false, true);
  }
  async jumpDate() {
    const histories = getVScrollData();
    const index = histories.findIndex(
      (item) => item.headerDate && getLocaleDate(item.lastVisitTime) === this.#jumpDate,
    );
    setScrollTop(this.#rowHeight * index);
    this.#jumpDate = '';
  }
  // eslint-disable-next-line class-methods-use-this
  actions() {
    return {
      resetHistory: makeAction({
        initValue: {} as ResetParams,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('clearSearch', this.clearSearch.bind(this));
    store.subscribe('resetHistory', (changes) => this.resetHistory(changes.newValue));
    store.subscribe('historyCollapseDate', (changes) => this.collapseHistoryDate(changes.newValue));
    store.subscribe('changeIncludeUrl', (changes) => {
      this.#includeUrl = changes.newValue;
    });
    this.#store = store;
  }
}

export class HeaderHistory extends PaneHeader implements IPubSubElement {
  toggleCollapseIcon(collapsed: boolean) {
    toggleClass('date-collapsed', collapsed)(this);
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
  connect(store: Store) {
    store.subscribe('historyCollapseDate', (changes) => this.toggleCollapseIcon(changes.newValue));
  }
}
