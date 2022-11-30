/* eslint-disable max-classes-per-file */

import {
  Collection, MyHistoryItem, Options, State,
} from './types';
import {
  Dispatch, IPubSubElement, makeAction, States, Store,
} from './store';
import {
  $byClass, addChild, addClass, hasClass, rmAttr, rmStyle, setHTML, setText,
  createNewTab, setAnimationClass, toggleClass, insertHTML, $$byClass, rmClass, addStyle,
} from './client';
import {
  delayMultiSelect,
  find,
  getLocaleDate,
  // getHistoryById,
  // getLocaleDate,
  isDateEq, pick, pipe, propEq, setLocal,
} from './common';
import { ISearchable, SearchParams } from './search';
import { makeHistory } from './html';
import {
  // getVScrollData,
  // resetVScrollData,
  // resetVScrollHeight,
  rowSetterHistory,
  // rowSetterHistory,
  // searchCache,
  // setScrollTop,
  VScrollRowSetter,
  // setVScroll,
} from './vscroll';
import { MulitiSelectablePaneBody, MutiSelectableItem, PaneHeader } from './multi-sel-pane';

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

// function removeHistory(ids: string[]) {
//   let [head, ...rest] = ids;
//   return (histories: MyHistoryItem[]) => histories.filter((row) => {
//     const found = row.id! === head;
//     if (found) {
//       [head = '.', ...rest] = rest;
//     }
//     return !found;
//   });
// }

export class HistoryItem extends MutiSelectableItem {
  // async getUrl() {
  //   const { url } = await getHistoryById(this.id);
  //   return url!;
  // }
  async open(url: string, options: Options) {
    if (this.checkMultiSelect()) {
      return;
    }
    // const url = await this.getUrl();
    createNewTab(options, url);
  }
  // override select(selected?: boolean) {
  //   const isSelected = super.select(selected);
  //   getHistoryById(this.id).then((data) => {
  //     // eslint-disable-next-line no-param-reassign
  //     data.selected = isSelected;
  //   });
  //   return isSelected;
  // }
  async delete(url: string) {
    // const url = await this.getUrl();
    setAnimationClass('hilite')(this);
    return chrome.history.deleteUrl({ url });
  }
}

export class History extends MulitiSelectablePaneBody implements IPubSubElement, ISearchable {
  readonly paneName = 'histories';
  #options!: Options;
  #includeUrl!: boolean;
  #reFilter!: RegExp | null;
  #jumpDate!: string | undefined;
  #rowHeight!: number;
  #timerMultiSelect!: number;
  #lastClickedId!: string | undefined;
  #histories!: MyHistoryItem[];
  private $rows!: HTMLElement;
  private promiseInitHistory!: Promise<MyHistoryItem[]>;
  // V-Scroll
  private $fakeBottom!: HTMLElement;
  private searchCache = new Map<string, Array<MyHistoryItem>>();
  private vScrollHandler!: Parameters<HTMLElement['removeEventListener']>[1];
  private vScrollData!: MyHistoryItem[];
  init(
    promiseInitHistory: Promise<MyHistoryItem[]>,
    options: Options,
    htmlHistory: string,
    isSearching: boolean,
  ) {
    this.#options = options;
    this.promiseInitHistory = promiseInitHistory;
    this.$rows = $byClass('rows', this)!;
    this.$fakeBottom = $byClass('v-scroll-fake-bottom', this)!;
    if (isSearching) {
      const header = '<history-item class="current-date history header-date" style="transform: translateY(-10000px)"></history-item>';
      const line = '<history-item class="history" draggable="true" style="transform: translateY(-10000px);"></history-item>';
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
    if (initialize) {
      this.#histories = await this.promiseInitHistory;
    }
    const [init, ...tail] = this.#histories;
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
      data = this.searchCache.get(queryValue);
      if (!data) {
        data = searchHistory(histories, this.#reFilter!, this.#includeUrl);
        this.searchCache.set(this.#reFilter!.source, data);
      }
    }
    this.setVScroll(rowSetterHistory, data);
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
    if (collapsed) {
      const histories = this.getVScrollData();
      const data = histories.filter((item) => item.headerDate);
      this.setVScroll(rowSetterHistory, data, false);
      this.setScrollTop(0);
      return;
    }
    await this.restoreHistory();
    if (this.#jumpDate) {
      this.jumpDate();
      this.#jumpDate = undefined;
    }
  }
  async jumpHistoryDate(localeDate: string, dispatch: Store['dispatch']) {
    this.#jumpDate = localeDate;
    dispatch('historyCollapseDate', false, true);
  }
  async jumpDate() {
    const histories = this.getVScrollData();
    const index = histories.findIndex(
      (item) => item.headerDate && getLocaleDate(item.lastVisitTime) === this.#jumpDate,
    );
    this.setScrollTop(this.#rowHeight * index);
    this.#jumpDate = '';
  }
  // eslint-disable-next-line class-methods-use-this
  deletesHandler($selecteds: HTMLElement[], store: Store) {
    const promiseUrls = $selecteds
      .filter(($el): $el is HistoryItem => $el instanceof HistoryItem)
      .map(($history) => this.getHistoryById($history.id).then(({ url }) => {
        const [, id] = $history.id.split('-');
        return [url, id] as [url: string, id: string];
      }));
    Promise.all(promiseUrls)
      .then((urls) => urls.map(([url, id]) => chrome.history.deleteUrl({ url }).then(() => id)))
      .then((ids) => Promise.all(ids))
      .then((ids) => store.dispatch('deleteVScroll', ids));
    // .then((ids) => {
    //   const newData = resetVScrollData(removeHistory(ids));
    //   resetVScrollHeight(this, this.#rowHeight, newData.length);
    //   this.#histories = removeHistory(ids)(this.#histories);
    // });
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
        const { url } = await this.getHistoryById($history.id);
        $history.delete(url!).then(() => {
          const [, id] = $history.id.split('-');
          dispatch('deleteVScroll', [id]);
          // const newData = resetVScrollData(removeHistory([id]));
          // resetVScrollHeight(this, this.#rowHeight, newData.length);
          // this.#histories = removeHistory([id])(this.#histories);
        });
        return;
      }
      const { histories, all } = await states('multiSelPanes');
      if (histories || all) {
        const isSelected = $history.select();
        this.getHistoryById($history.id).then((data) => {
          // eslint-disable-next-line no-param-reassign
          data.selected = isSelected;
        });
        if (all) {
          dispatch('multiSelPanes', { histories: true });
        }
        if (e.shiftKey) {
          this.selectWithShift($history);
        }
        this.#lastClickedId = $history.id;
        return;
      }
      const { url } = await this.getHistoryById($history.id);
      $history.open(url!, this.#options);
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
  multiSelect({ histories: multiSelect }: { histories?: boolean }, store: Store) {
    if (!multiSelect) {
      // applyVScrollData((data) => {
      //   data.filter(propEq('selected', true)).forEach((selected) => {
      //     // eslint-disable-next-line no-param-reassign
      //     selected!.selected = false;
      //   });
      // });
      // this.resetHistory();
      // resetVScrollData(map((row) => ({ ...row, selected: false })));
      store.dispatch('unselectVScroll');
      this.#lastClickedId = undefined;
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
          dispatch('multiSelPanes', { histories: !multiSelPanes?.histories });
          $history.preMultiSelect(!multiSelPanes?.histories);
        },
        delayMultiSelect,
      );
    }
  }
  mouseupItem() {
    clearTimeout(this.#timerMultiSelect);
  }
  // V-Scroll
  async setVScroll(
    rowSetter: VScrollRowSetter,
    data: Collection,
    isShowFixedHeader = true,
  ) {
    const firstRow = this.$rows?.firstElementChild as HTMLElement;
    if (!firstRow || !this.$rows) {
      return;
    }
    const { paddingTop, paddingBottom } = getComputedStyle(this.$rows);
    const padding = Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom);
    addStyle('height', `${this.offsetHeight - padding}px`)(this.$rows);
    this.removeEventListener('scroll', this.vScrollHandler);
    // resetVScrollHeight($container, rowHeight, data.length);
    rmStyle('height')(this.$fakeBottom);
    const vScrollHeight = this.#rowHeight * data.length;
    addStyle('height', `${vScrollHeight - this.offsetHeight + padding}px`)(this.$fakeBottom);
    const setter = rowSetter(isShowFixedHeader);
    const children = [...this.$rows.children] as HTMLElement[];
    this.vScrollData = data;
    this.vScrollHandler = () => {
      const rowTop = -(this.scrollTop % this.#rowHeight);
      const dataTop = Math.floor(this.scrollTop / this.#rowHeight);
      children.forEach(setter(this.vScrollData, rowTop, dataTop));
    };
    this.addEventListener('scroll', this.vScrollHandler);
  }
  resetVScrollData(
    cbVScrollData: (data: MyHistoryItem[]) => MyHistoryItem[],
  ) {
    this.vScrollData = cbVScrollData(this.vScrollData);
    this.searchCache.clear();
    $byClass('v-scroll')!.dispatchEvent(new Event('scroll'));
    return this.vScrollData;
  }
  getVScrollData() {
    return this.vScrollData;
  }
  applyVScrollData<T>(fnSometing: (data: MyHistoryItem[]) => T) {
    return fnSometing(this.vScrollData);
  }
  async getHistoryById(historyId: string) {
    const [, id] = historyId.split('-');
    return this.applyVScrollData(find(propEq('id', id)));
  }
  getRowsPadding() {
    const $rows = $byClass('rows', this)!;
    const { paddingTop, paddingBottom } = getComputedStyle($rows);
    return Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom);
  }
  resetVScrollHeight(
    rowHeight: State['vscrollProps']['rowHeight'],
    dataCount: number,
  ) {
    const padding = this.getRowsPadding();
    const $fakeBottom = $byClass('v-scroll-fake-bottom', this)!;
    const vScrollHeight = rowHeight * dataCount;
    addStyle('height', `${vScrollHeight - this.offsetHeight + padding}px`)($fakeBottom);
  }
  setScrollTop(scrollTop: number) {
    this.scrollTop = scrollTop;
    this.dispatchEvent(new Event('scroll'));
  }
  // Store
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
      selectVScroll: makeAction({
        initValue: [] as string[],
      }),
      unselectVScroll: makeAction({
        force: true,
      }),
      deleteVScroll: makeAction({
        initValue: [] as string[],
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    store.subscribe('clickHistory', (_, e) => this.clickItem(e, store.getStates, store.dispatch));
    store.subscribe('clearSearch', () => this.clearSearch(store.dispatch));
    store.subscribe('resetHistory', (changes) => this.resetHistory(changes.newValue));
    store.subscribe('historyCollapseDate', (changes) => this.collapseHistoryDate(changes.newValue));
    store.subscribe('changeIncludeUrl', (changes) => {
      this.#includeUrl = changes.newValue;
    });
    store.subscribe('setIncludeUrl', (changes) => {
      if (!changes.isInit) {
        this.resetVScrollData((data) => data);
      }
    });
    store.subscribe('mousedownHistory', (_, e) => this.mousedownItem(e, store.getStates, store.dispatch));
    store.subscribe('mouseupHistory', this.mouseupItem.bind(this));
    store.subscribe('multiSelPanes', ({ newValue }) => this.multiSelect(newValue, store));
  }
}

export class HeaderHistory extends PaneHeader implements IPubSubElement {
  readonly paneName = 'histories';
  toggleCollapseIcon(collapsed: boolean) {
    toggleClass('date-collapsed', collapsed)(this);
  }
  // eslint-disable-next-line class-methods-use-this
  // get multiSelPaneParams() {
  //   return {
  //     className: 'histories',
  //     // deleteHandler: ($selecteds: HTMLElement[]) => {
  //     //   const [idList, promiseUrls] = $selecteds
  //     //     .filter(($el): $el is HistoryItem => $el instanceof HistoryItem)
  //     //     .reduce(
  //     //       ([ids, urls], $history) => [[...ids, $history.id], [...urls, $history.getUrl()]],
  //     //       [[], []] as [string[], Promise<string>[]],
  //     //     );
  //     //   Promise.all(promiseUrls)
  //     //     .then((urls) => urls.map((url) => ({ url })).forEach(chrome.history.deleteUrl));
  //     // },
  //   } as const;
  // }
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
