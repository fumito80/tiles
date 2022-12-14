/* eslint-disable max-classes-per-file */

import {
  CliMessageTypes, Collection, MulitiSelectables, MyHistoryItem, Options, State,
} from './types';
import {
  Dispatch, IPubSubElement, makeAction, States, Store,
} from './store';
import {
  $byClass, addChild, addClass, hasClass, rmAttr, rmStyle, setHTML, setText,
  createNewTab, setAnimationClass, toggleClass, insertHTML, $$byClass, rmClass, addStyle,
  addBookmark,
  getMessageDeleteSelecteds,
} from './client';
import {
  delayMultiSelect, filter, getLocaleDate, isDateEq, pick, pipe,
  postMessage, propEq, setLocal, whichClass,
} from './common';
import { ISearchable, SearchParams } from './search';
import { makeHistory } from './html';
import { rowSetterHistory, VScrollRowSetter } from './vscroll';
import { MulitiSelectablePaneBody, MulitiSelectablePaneHeader, MutiSelectableItem } from './multi-sel-pane';
import { dialog } from './dialogs';

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
  async open(url: string, options: Options) {
    if (this.checkMultiSelect()) {
      return;
    }
    createNewTab(options, url);
  }
  async delete(url: string) {
    setAnimationClass('hilite-fast')(this);
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
  private preSelectAll = false;
  private $draggableClone!: HTMLElement;
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
    this.$draggableClone = $byClass('draggable-clone')!;
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
  getSelecteds(dragElementIds: string[]) {
    const ids = dragElementIds.map((el) => el.replace('hst-', ''));
    return this.hookData(
      (data) => data.filter((el) => el.selected || ids.includes(el.id!)).map((el) => el.id!),
    );
  }
  getSelectedUrls(dragElementIds: string[] = []) {
    const selecteds = this.getSelecteds(dragElementIds);
    return selecteds.map((id) => this.getHistoryById(id!)).map(({ url }) => url!);
  }
  async openHistories(args: Store['actions']['openHistories']['initValue']) {
    const { windowId, index, incognito } = args!;
    const urls = this.getSelectedUrls(args?.elementIds!);
    if (!windowId) {
      chrome.windows.create({ url: urls, incognito });
      return;
    }
    postMessage({ type: CliMessageTypes.openUrls, payload: { urls, windowId, index } });
  }
  async addBookmarks(args: Store['actions']['addBookmarksHistories']['initValue']) {
    const { bookmarkDest } = args!;
    const selecteds = this.getSelecteds(args?.elementIds!);
    (bookmarkDest.index == null ? selecteds : selecteds.reverse())
      .map((id) => this.getHistoryById(id!))
      .forEach(({ url, title }) => {
        addBookmark(
          bookmarkDest.parentId,
          { url, title: title || url?.substring(0, 50), ...bookmarkDest },
          true,
        );
      });
  }
  openWindowFromHistory(incognito: boolean) {
    const urls = this.getSelectedUrls();
    chrome.windows.create({ url: urls, incognito }, window.close);
  }
  search({ reFilter, includeUrl }: SearchParams, dispatch: Store['dispatch']) {
    this.#reFilter = reFilter;
    this.#includeUrl = includeUrl;
    dispatch('historyCollapseDate', false, true);
  }
  async resetHistory() {
    const initialize = !this.#histories;
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
    return this.resetHistory();
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
  selectItems(dispatch: Dispatch) {
    const count = this.hookData(filter(propEq('selected', true))).length;
    dispatch('selectItems', { paneName: this.paneName, count }, true);
  }
  async deletesHandler($selecteds: HTMLElement[], store: Store) {
    const count = this.hookData((data) => data.filter(propEq('selected', true))).length;
    if (count === 0) {
      return;
    }
    const ret = await dialog.confirm(getMessageDeleteSelecteds(count));
    if (!ret) {
      return;
    }
    const promiseUrls = $selecteds
      .filter(($el): $el is HistoryItem => $el instanceof HistoryItem)
      .map(($history) => {
        const { url } = this.getHistoryById($history.id);
        return [url, $history] as [url: string, historyItem: HistoryItem];
      });
    Promise.all(promiseUrls)
      .then((urls) => urls.map(([url, $history]) => $history.delete(url).then(() => $history.id)))
      .then((ids) => Promise.all(ids))
      .then((ids) => ids.map((id) => id.replace('hst-', '')))
      .then((ids) => {
        this.applyData((histories) => {
          let [head, ...rest] = ids;
          return histories.filter((row) => {
            const found = row.id! === head;
            if (found) {
              [head = '.', ...rest] = rest;
            }
            return !found;
          });
        });
        this.selectItems(store.dispatch);
      });
  }
  selectItem(elementId: string, selected: boolean) {
    const [, id] = elementId.split('-');
    this.applyData((data) => {
      const newData = [] as MyHistoryItem[];
      for (let i = 0; i < data.length; i += 1) {
        if (data[i].id === id) {
          newData.push({ ...data[i], selected }, ...data.slice(i + 1));
          break;
        }
        newData.push(data[i]);
      }
      return newData;
    });
  }
  selectDateAll(
    $headerDate: HTMLElement,
    searching: boolean,
    dispatch: Dispatch,
    preSelect = false,
  ) {
    if (this.preSelectAll) {
      this.preSelectAll = false;
      return;
    }
    this.preSelectAll = preSelect;
    const currentDate = $headerDate.textContent;
    if (searching) {
      const selecteds = this.getVScrollData()
        .filter((row) => getLocaleDate(row.lastVisitTime) === currentDate && !row.headerDate);
      const selectedIds = selecteds.map((row) => row.id);
      const selected = !selecteds[0].selected;
      this.applyData((data) => {
        let [head, ...rest] = selectedIds;
        return data.map((row) => {
          const found = row.id! === head;
          if (found) {
            [head = '.', ...rest] = rest;
          }
          return found ? { ...row, selected } : row;
        });
      });
      this.selectItems(dispatch);
      return;
    }
    this.applyData((data) => {
      const newData = [];
      let matched = false;
      let selected = true;
      for (let i = 0; i < data.length; i += 1) {
        const row = data[i];
        const isMatch = getLocaleDate(row.lastVisitTime) === currentDate && !row.headerDate;
        if (matched && !isMatch) {
          newData.push(...data.slice(i));
          break;
        }
        if (!matched && isMatch) {
          selected = !row.selected;
        }
        newData.push(isMatch ? { ...row, selected } : row);
        matched = isMatch;
      }
      return newData;
    });
    this.selectItems(dispatch);
  }
  selectWithShift($target: HistoryItem, lastElementId: string) {
    const [, lastClickedId] = lastElementId.split('-');
    const [, clickedId] = $target.id.split('-');
    this.applyData((data) => {
      const newDate = [] as MyHistoryItem[];
      let ranged = false;
      for (let i = 0; i < data.length; i += 1) {
        const row = data[i];
        const bound = [lastClickedId, clickedId].includes(row.id!);
        if (ranged || bound) {
          newDate.push({ ...row, selected: true });
          if (ranged && bound) {
            newDate.push(...data.slice(i + 1));
            break;
          }
          ranged = true;
        } else {
          newDate.push(row);
        }
      }
      return newDate;
    });
  }
  async clickItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLElement;
    if (hasClass($target, 'header-date')) {
      const {
        searching, historyCollapseDate, multiSelPanes: { histories, all } = {},
      } = await states();
      if (histories || all) {
        this.selectDateAll($target, searching, dispatch);
        if (all) {
          dispatch('multiSelPanes', { histories: true });
        }
      } else {
        dispatch('focusQuery');
      }
      if (historyCollapseDate) {
        this.jumpHistoryDate($target.textContent!, dispatch);
        return;
      }
      return;
    }
    const $history = $target.parentElement;
    if ($history instanceof HistoryItem) {
      if (hasClass($target, 'icon-x')) {
        const { url } = this.getHistoryById($history.id);
        $history.delete(url!).then(() => {
          const [, id] = $history.id.split('-');
          this.applyData((data) => {
            const newData = [] as MyHistoryItem[];
            for (let i = 0; i < data.length; i += 1) {
              if (data[i].id === id) {
                newData.push(...data.slice(i + 1));
                break;
              }
              newData.push(data[i]);
            }
            return newData;
          });
        });
        return;
      }
      const { histories, all } = await states('multiSelPanes');
      if (histories || all) {
        if (e.shiftKey && this.#lastClickedId && this.#lastClickedId !== $target.id) {
          this.selectWithShift($history, this.#lastClickedId);
        } else {
          const selected = $history.select();
          this.selectItem($history.id, selected);
        }
        this.selectItems(dispatch);
        if (all) {
          dispatch('multiSelPanes', { histories: true });
        }
        this.#lastClickedId = $history.id;
        return;
      }
      const { url } = this.getHistoryById($history.id);
      $history.open(url!, this.#options);
    }
  }
  multiSelect({ histories: multiSelect }: MulitiSelectables) {
    if (!multiSelect) {
      this.applyData((data) => data.map((row) => ({ ...row, selected: false })));
      this.#lastClickedId = undefined;
    }
  }
  mousedownItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLElement;
    const $history = $target instanceof HistoryItem ? $target : $target.parentElement;
    if ($history instanceof HistoryItem) {
      const isHeader = hasClass($history, 'header-date');
      clearTimeout(this.#timerMultiSelect);
      this.#timerMultiSelect = setTimeout(
        async () => {
          const { dragging, multiSelPanes, searching } = await states();
          if (dragging) {
            if (multiSelPanes?.histories) {
              this.selectItem($history.id, true);
              this.selectItems(dispatch);
            }
            return;
          }
          dispatch('multiSelPanes', { histories: !multiSelPanes?.histories });
          if (multiSelPanes?.histories) {
            return;
          }
          if (isHeader) {
            this.selectDateAll($history, searching, dispatch, true);
            return;
          }
          $history.preMultiSelect(!multiSelPanes?.histories);
          dispatch('selectItems', { paneName: this.paneName, count: 1 }, true);
        },
        delayMultiSelect,
      );
      if (isHeader) {
        return;
      }
      // pre making draggable clones
      this.hookData((data) => {
        const cunnretId = $history.id.replace('hst-', '');
        const selecteds = data.filter((el) => el.selected || el.id === cunnretId);
        const html = [] as string[];
        let cloneCount = 0;
        selecteds.some((el, i) => {
          if (this.#rowHeight * i > 120) {
            cloneCount = i;
            return true;
          }
          html.push(makeHistory(el));
          return false;
        });
        this.$draggableClone.innerHTML = html.join('');
        if (cloneCount > 0) {
          const $div = this.$draggableClone.appendChild(document.createElement('div'));
          $div.textContent = `... and ${selecteds.length - cloneCount} other items`;
          addStyle({ padding: '2px' })($div);
        }
      });
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
  resetVScroll() {
    this.searchCache.clear();
    this.dispatchEvent(new Event('scroll'));
  }
  hookData<T>(fnHook: (data: MyHistoryItem[]) => T) {
    return fnHook(this.#histories);
  }
  applyData(
    fnApply: (data: MyHistoryItem[]) => MyHistoryItem[],
  ) {
    this.vScrollData = fnApply(this.vScrollData);
    this.#histories = fnApply(this.#histories);
    this.resetVScroll();
  }
  getVScrollData() {
    return this.vScrollData;
  }
  getHistoryById(elementId: string) {
    const id = elementId.replace('hst-', '');
    return this.#histories.find(propEq('id', id))!;
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
  override actions() {
    return {
      ...super.actions(),
      openHistories: makeAction({
        initValue: {
          elementIds: [],
          windowId: undefined,
          index: undefined,
          incognito: false,
        } as {
          elementIds: string[],
          windowId?: number | undefined,
          index?: number | undefined,
          incognito: boolean,
        },
      }),
      addBookmarksHistories: makeAction({
        initValue: {
          elementIds: [] as string[],
          bookmarkDest: {} as chrome.bookmarks.BookmarkDestinationArg,
        },
      }),
      openWindowFromHistory: makeAction({
        initValue: false, // incognito?
      }),
      resetHistory: makeAction(),
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
      updateSelCount: makeAction({
        initValue: 0,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    store.subscribe('clickHistory', (_, e) => this.clickItem(e, store.getStates, store.dispatch));
    store.subscribe('clearSearch', () => this.clearSearch(store.dispatch));
    store.subscribe('resetHistory', this.resetHistory.bind(this));
    store.subscribe('historyCollapseDate', (changes) => this.collapseHistoryDate(changes.newValue));
    store.subscribe('changeIncludeUrl', (changes) => {
      this.#includeUrl = changes.newValue;
    });
    store.subscribe('setIncludeUrl', (changes) => {
      if (!changes.isInit) {
        this.resetVScroll();
      }
    });
    store.subscribe('mousedownHistory', (_, e) => this.mousedownItem(e, store.getStates, store.dispatch));
    store.subscribe('mouseupHistory', this.mouseupItem.bind(this));
    store.subscribe('multiSelPanes', ({ newValue }) => this.multiSelect(newValue));
    store.subscribe('openHistories', ({ newValue }) => this.openHistories(newValue));
    store.subscribe('addBookmarksHistories', ({ newValue }) => this.addBookmarks(newValue));
    store.subscribe('openWindowFromHistory', ({ newValue }) => this.openWindowFromHistory(newValue));
  }
}

export class HeaderHistory extends MulitiSelectablePaneHeader implements IPubSubElement {
  readonly paneName = 'histories';
  private store!: Store;
  readonly multiDeletesTitle = 'Delete selected histories';
  toggleCollapseIcon(collapsed: boolean) {
    toggleClass('date-collapsed', collapsed)(this);
  }
  multiSelPanes(newValue: NonNullable<Store['actions']['multiSelPanes']['initValue']>) {
    const isMultiSelect = Object.values(newValue).some((value) => !!value);
    $byClass('collapse-history-date', this)?.classList.toggle('hidden', isMultiSelect);
  }
  // eslint-disable-next-line class-methods-use-this
  menuClickHandler(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    const className = whichClass(['open-new-tab', 'open-new-window', 'open-incognito'] as const, $target);
    switch (className) {
      case 'open-new-tab': {
        this.store.dispatch('openTabsFromHistory');
        break;
      }
      case 'open-incognito':
      case 'open-new-window': {
        this.store.dispatch('openWindowFromHistory', className === 'open-incognito', true);
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
    store.subscribe('multiSelPanes', (changes) => this.multiSelPanes(changes.newValue));
    this.store = store;
  }
}
