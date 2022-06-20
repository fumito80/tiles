/* eslint-disable max-classes-per-file */

import { MyHistoryItem, Options } from './types';
import {
  IPubSubElement, makeAction, Store,
} from './store';
import {
  $byClass, $byTag,
  addChild, addClass, hasClass, rmAttr, rmStyle, setHTML, setText,
  createNewTab, setAnimationClass, toggleClass,
} from './client';
import {
  getHistoryById,
  getLocal, getLocaleDate, isDateEq, pick, pipe, postMessage, removeUrlHistory, setLocal,
} from './common';
import { getReFilter, SearchParams } from './search';
import { makeHistory } from './html';
import {
  getVScrollData, resetVScrollData, rowSetterHistory, searchCache, setScrollTop, setVScroll,
} from './vscroll';

type ResetParams = {
  initialize?: boolean, reFilter?: RegExp, includeUrl?: boolean, removedHistory?: boolean,
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
  return { rowHeight };
}

function searchHistory(source: MyHistoryItem[], reFilter: RegExp, includeUrl: boolean) {
  const [results] = source.reduce(([result, prevHeaderDate], el) => {
    if (el.headerDate) {
      return [result, el];
    }
    if (!reFilter!.test(el.title || el.url || '') && !(includeUrl && reFilter!.test(el.url || ''))) {
      return [result, prevHeaderDate];
    }
    if (!prevHeaderDate) {
      return [[...result, el], null];
    }
    return [[...result, prevHeaderDate, el], null];
  }, [[], null] as [MyHistoryItem[], MyHistoryItem | null]);
  return results;
}

export class History extends HTMLDivElement implements IPubSubElement {
  #includeUrl!: boolean;
  #reFilter!: RegExp;
  #store!: Store;
  private $main = $byTag('main');
  init(options: Options) {
    this.setEvents(options);
  }
  setEvents(options: Options) {
    this.addEventListener('click', async (e) => {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'header-date') && hasClass(this.$main, 'date-collapsed')) {
        this.jumpHistoryDate($target.textContent!);
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
        const result = await postMessage({ type: 'cl-remove-history', payload: url });
        if (result) {
          resetVScrollData(removeUrlHistory(url));
        }
        return;
      }
      createNewTab(options, url);
    });
  }
  search({ value, includeUrl }: SearchParams) {
    const reFilter = getReFilter(value)!;
    this.#reFilter = reFilter;
    this.#store.dispatch('historyCollapseDate', false);
    this.resetHistory({ reFilter, includeUrl });
  }
  async resetHistory({
    initialize,
    reFilter,
    includeUrl,
  }: ResetParams = {}) {
    const $rows = $byClass('rows', this)!;
    if (initialize) {
      const { rowHeight } = getRowHeight();
      await setLocal({ vscrollProps: { rowHeight } });
    }
    const { histories: [init, ...tail], vscrollProps } = await getLocal('histories', 'vscrollProps');
    let histories = [init, ...tail];
    if (initialize && !init.headerDate && !isDateEq(init.lastVisitTime, new Date())) {
      const headerDate = { headerDate: true, lastVisitTime: init.lastVisitTime };
      histories = [headerDate, init, ...tail];
      const headerDateHtml = makeHistory({ ...headerDate });
      $rows.firstElementChild?.insertAdjacentHTML('afterend', headerDateHtml);
      await setLocal({ histories, htmlHistory: $rows.innerHTML });
    }
    const queryValue = reFilter?.source;
    let data: MyHistoryItem[] | undefined = histories;
    if (queryValue) {
      data = searchCache.get(queryValue);
      if (!data) {
        data = searchHistory(histories, reFilter, includeUrl!);
        searchCache.set(reFilter.source, data);
      }
    }
    setVScroll(this, rowSetterHistory, data, vscrollProps);
    if (reFilter || !initialize) {
      [...$rows?.children || []].forEach(
        pipe(
          rmStyle('background-image'),
          rmAttr('title'),
          setHTML(''),
        ),
      );
      this.scrollTop = 0;
      this.dispatchEvent(new Event('scroll'));
    }
  }
  async restoreHistory() {
    return this.resetHistory({ reFilter: this.#reFilter, includeUrl: this.#includeUrl });
  }
  async collapseHistoryDate(collapsed: boolean) {
    if (!collapsed) {
      this.restoreHistory();
      return;
    }
    const { vscrollProps } = await getLocal('vscrollProps');
    const histories = getVScrollData();
    const data = histories.filter((item) => item.headerDate);
    setVScroll(this, rowSetterHistory, data, vscrollProps);
    setScrollTop(0);
  }
  async jumpHistoryDate(localeDate: string) {
    const { vscrollProps } = await getLocal('vscrollProps');
    await this.restoreHistory();
    const histories = getVScrollData();
    const index = histories.findIndex(
      (item) => item.headerDate && getLocaleDate(item.lastVisitTime) === localeDate,
    );
    setScrollTop(vscrollProps.rowHeight * index);
  }
  // eslint-disable-next-line class-methods-use-this
  provideActions() {
    return {
      resetHistory: makeAction({
        initValue: {} as ResetParams,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('search', (changes) => this.search(changes.newValue));
    store.subscribe('clearSearch', () => this.resetHistory());
    store.subscribe('resetHistory', (changes) => this.resetHistory(changes.newValue));
    store.subscribe('historyCollapseDate', (changes) => this.collapseHistoryDate(changes.newValue));
    store.subscribe('changeIncludeUrl', (changes) => {
      this.#includeUrl = changes.newValue;
    });
    this.#store = store;
  }
}

export class HeaderHistory extends HTMLDivElement implements IPubSubElement {
  toggleCollapseIcon(collapsed: boolean) {
    toggleClass('date-collapsed', collapsed)(this);
  }
  provideActions() {
    return {
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
