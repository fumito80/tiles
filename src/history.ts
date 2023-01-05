import {
  CliMessageTypes, Collection, MulitiSelectables, MyHistoryItem, Options, pastMSec, State,
} from './types';
import {
  Changes, Dispatch, IPubSubElement, makeAction, States, Store, StoreSub,
} from './popup';
import {
  $byClass, addChild, addClass, hasClass, rmAttr, rmStyle, setHTML, setText,
  createNewTab, setAnimationClass, toggleClass, insertHTML, $$byClass, rmClass, addStyle,
  addBookmark,
  getMessageDeleteSelecteds,
  $$byTag,
} from './client';
import {
  delayMultiSelect, filter, getLocaleDate, isDateEq, map, messages, pick, pipe,
  postMessage, propEq, setLocal, when, whichClass,
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

function filterHistory(source: MyHistoryItem[], fnFilter: (el: MyHistoryItem) => boolean) {
  const [results] = source.reduce(([result, prevHeaderDate], el) => {
    if (el.headerDate) {
      return [result, el];
    }
    if (fnFilter(el)) {
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
    this.setAnimation('hilite-fast');
    return chrome.history.deleteUrl({ url });
  }
  get isSession() {
    return hasClass(this, 'session-window', 'session-tab');
  }
  setAnimation(animationName: Parameters<typeof setAnimationClass>[0]) {
    setAnimationClass(animationName)(this);
  }
}

export class History extends MulitiSelectablePaneBody implements IPubSubElement, ISearchable {
  readonly paneName = 'histories';
  #options!: Options;
  #includeUrl!: boolean;
  #reFilter!: RegExp | null;
  #jumpDate!: string | undefined;
  #rowHeight!: number;
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
    const ids = dragElementIds.map((el) => el.split('-').at(1));
    return this.hookData(
      (data) => data.filter((el) => el.selected || ids.includes(el.id!)),
    );
  }
  async getSelectedUrls(dragElementIds: string[] = []) {
    const selecteds = this.getSelecteds(dragElementIds);
    return this.getHistoriesByIds(selecteds.map((el) => el.id!)).then(map(({ url }) => url!));
  }
  async openHistories({ newValue }: Changes<'openHistories'>) {
    const selecteds = this.getSelecteds(newValue?.elementIds!);
    if (selecteds[0].isSession) {
      chrome.sessions.restore(selecteds[0].id);
      return;
    }
    const urls = await this.getSelectedUrls(selecteds.map((el) => el.id!));
    const { windowId, index, incognito } = newValue!;
    if (!windowId) {
      chrome.windows.create({ url: urls, incognito });
      return;
    }
    postMessage({ type: CliMessageTypes.openUrls, payload: { urls, windowId, index } });
  }
  async addBookmarks({ newValue }: Changes<'addBookmarksHistories'>) {
    const { bookmarkDest } = newValue!;
    const selecteds = this.getSelecteds(newValue?.elementIds!);
    const items = await when(!!selecteds[0].isSession)
      .then(() => (chrome.sessions.getRecentlyClosed as () => Promise<chrome.sessions.Session[]>)()
        .then(
          (sessions) => sessions
            .filter(({ tab, window }) => (tab || window)!.sessionId === selecteds[0].id)
            .flatMap(({ tab, window }) => tab || window?.tabs!),
        ))
      .else(() => this.getHistoriesByIds(selecteds.map((el) => el.id!)));
    const urls = bookmarkDest.index == null ? items : items.reverse();
    urls.forEach(({ url, title }) => {
      addBookmark(
        bookmarkDest.parentId,
        { url, title: title || url?.substring(0, 50), ...bookmarkDest },
        urls.length !== 1,
      );
    });
  }
  openWindowFromHistory({ newValue: incognito }: { newValue: boolean }) {
    this.getSelectedUrls()
      .then((urls) => chrome.windows.create({ url: urls, incognito }, window.close));
  }
  search({ reFilter, includeUrl }: SearchParams, dispatch: Dispatch) {
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
        data = filterHistory(
          histories,
          (el) => !this.#reFilter!.test(el.title || el.url || '') && !(this.#includeUrl && this.#reFilter!.test(el.url || '')),
        );
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
  clearSearch(_: any, __: any, ___: any, store: StoreSub) {
    this.#reFilter = null;
    store.dispatch('historyCollapseDate', false, true);
  }
  async toggleRecentlyClosed({ newValue: shown }: Changes<'toggleRecentlyClosed'>) {
    if (shown) {
      const vData = filterHistory(this.getVScrollData(), (el) => !el.isSession);
      this.setVScroll(rowSetterHistory, vData, false);
      this.setScrollTop(0);
      return;
    }
    await this.resetHistory();
    if (this.#jumpDate) {
      this.jumpDate();
      this.#jumpDate = undefined;
    }
  }
  async collapseHistoryDate({ newValue: collapsed }: Changes<'historyCollapseDate'>) {
    if (collapsed) {
      const vData = this.getVScrollData().filter((item) => item.headerDate);
      this.setVScroll(rowSetterHistory, vData, false);
      this.setScrollTop(0);
      return;
    }
    await this.resetHistory();
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
  async deletesHandler($selecteds: HTMLElement[], dispatch: Dispatch) {
    const selecteds = this.hookData((data) => data.filter(propEq('selected', true)));
    if (selecteds.length === 0) {
      return;
    }
    const ret = await dialog.confirm(getMessageDeleteSelecteds(selecteds.length));
    if (!ret) {
      return;
    }
    $selecteds.filter(($el): $el is HistoryItem => $el instanceof HistoryItem).forEach(($history) => $history.setAnimation('hilite-fast'));
    const promiseIds = selecteds.map(
      (selected) => chrome.history.deleteUrl({ url: selected.url! }).then(() => selected.id!),
    );
    Promise.all(promiseIds).then((ids) => {
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
      this.selectItems(dispatch);
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
  async clickItem(_: any, e: MouseEvent, states: States, store: StoreSub) {
    const $target = e.target as HTMLElement;
    if (hasClass($target, 'header-date')) {
      const {
        searching, historyCollapseDate, multiSelPanes: { histories, all } = {},
      } = states;
      if (histories || all) {
        this.selectDateAll($target, searching, store.dispatch);
        if (all) {
          store.dispatch('multiSelPanes', { histories: true, all: false });
        }
      } else {
        store.dispatch('focusQuery');
      }
      if (historyCollapseDate) {
        this.jumpHistoryDate($target.textContent!, store.dispatch);
        return;
      }
      return;
    }
    const $history = $target.parentElement;
    if ($history instanceof HistoryItem) {
      if ($history.isSession && hasClass($target, 'icon-fa-angle-right')) {
        const [, id] = $history.id.split('-');
        let isOpenClosedWindow = false;
        const vData = ((data) => {
          const findIndex = data.findIndex(propEq('id', id));
          const closedWindow = data[findIndex];
          isOpenClosedWindow = !closedWindow.isOpenSessionWindow;
          if (isOpenClosedWindow) {
            const innerTabs = closedWindow.sessionWindow!
              .map((t) => ({ ...t, isSession: true, isChildSession: true }));
            return data.slice(0, findIndex)
              .concat({ ...closedWindow, isOpenSessionWindow: true })
              .concat(innerTabs)
              .concat(data.slice(findIndex + 1));
          }
          return data.slice(0, findIndex)
            .concat({ ...closedWindow, isOpenSessionWindow: false })
            .concat(data.slice(findIndex + closedWindow.sessionWindow!.length + 1));
        })(this.getVScrollData());
        $history.classList.toggle('open-closed-window', isOpenClosedWindow);
        const { scrollTop } = this;
        this.setVScroll(rowSetterHistory, vData, false);
        this.setScrollTop(scrollTop);
        $$byClass('child-session', this).map(setAnimationClass('fade-in'));
        return;
      }
      if (hasClass($target, 'icon-x')) {
        const [{ url }] = await this.getHistoriesByIds([$history.id]);
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
      const { histories, all } = states.multiSelPanes!;
      if (histories || all) {
        if (hasClass($history, 'session-tab', 'session-window')) {
          dialog.alert(messages.cantSelectMultiple);
          return;
        }
        if (e.shiftKey && this.#lastClickedId && this.#lastClickedId !== $target.id) {
          this.selectWithShift($history, this.#lastClickedId);
        } else {
          const selected = $history.select();
          this.selectItem($history.id, selected);
        }
        this.selectItems(store.dispatch);
        if (all) {
          store.dispatch('multiSelPanes', { histories: true, all: false });
        }
        this.#lastClickedId = $history.id;
        return;
      }
      if ($history.isSession) {
        const [, sessionId] = $history.id.split('session-');
        chrome.sessions.restore(sessionId);
        return;
      }
      const [{ url }] = await this.getHistoriesByIds([$history.id]);
      $history.open(url!, this.#options);
    }
  }
  multiSelect({ newValue: { histories } }: { newValue: MulitiSelectables }) {
    if (!histories) {
      this.applyData((data) => data.map((row) => ({ ...row, selected: false })));
      this.#lastClickedId = undefined;
    }
  }
  mousedownItem(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $target = e.target as HTMLElement;
    const $history = $target instanceof HistoryItem ? $target : $target.parentElement;
    if ($history instanceof HistoryItem) {
      const isHeader = hasClass($history, 'header-date');
      clearTimeout(this.timerMultiSelect);
      this.timerMultiSelect = setTimeout(
        async () => {
          const { dragging, multiSelPanes, searching } = await store.getStates();
          const histories = !multiSelPanes?.histories;
          if (dragging) {
            if (!histories) {
              this.selectItem($history.id, true);
              this.selectItems(store.dispatch);
            }
            return;
          }
          if (hasClass($history, 'session-tab', 'session-window')) {
            dialog.alert(messages.cantSelectMultiple);
            return;
          }
          store.dispatch('multiSelPanes', { histories, all: false });
          if (!histories || multiSelPanes?.all) {
            store.dispatch('multiSelPanes', { all: false });
            return;
          }
          if (isHeader) {
            this.selectDateAll($history, searching, store.dispatch, true);
            return;
          }
          $history.preMultiSelect(histories);
          store.dispatch('selectItems', { paneName: this.paneName, count: 1 }, true);
        },
        delayMultiSelect,
      );
      if (isHeader) {
        return;
      }
      // pre making draggable clones
      this.hookData((data) => {
        const [, cunnretId] = $history.id.split('-');
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
          $div.textContent = `... and ${selecteds.length - cloneCount} more items`;
          addStyle({ padding: '2px' })($div);
        }
      });
    }
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
  // eslint-disable-next-line class-methods-use-this
  async getHistoriesByIds(elementIds: string[]) {
    const ids = elementIds.map((el) => el.replace('hst-', '')).sort();
    const startTime = Date.now() - pastMSec;
    return chrome.history.search({ text: '', startTime, maxResults: 99999 })
      .then((hs): MyHistoryItem[] => {
        if (ids.length === 1) {
          const h = hs.find((el) => el.id === ids[0])! ?? {};
          return [h];
        }
        const results = [];
        const sorted = hs.sort((a, b) => Number(a.id) - Number(b.id));
        for (let [id, ...rest] = ids, i = 0; id != null && i < sorted.length; i += 1) {
          if (sorted[i].id === id) {
            results.push(sorted[i]);
            [id, ...rest] = rest;
          }
        }
        return results;
      });
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
  setIncludeUrl(changes: { isInit: boolean }) {
    if (!changes.isInit) {
      this.resetVScroll();
    }
  }
  changeIncludeUrl(changes: Changes<'changeIncludeUrl'>) {
    this.#includeUrl = changes.newValue;
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
}

export class HeaderHistory extends MulitiSelectablePaneHeader implements IPubSubElement {
  readonly paneName = 'histories';
  private store!: Store;
  readonly multiDeletesTitle = 'Delete selected histories';
  toggleCollapseIcon({ newValue: collapsed }: { newValue: boolean }) {
    toggleClass('date-collapsed', collapsed)(this);
  }
  toggleRecentlyClosed({ newValue: shown }: { newValue: boolean }) {
    toggleClass('show-recently-closed', shown)(this);
  }
  multiSelPanes({ newValue }: Changes<'multiSelPanes'>) {
    const isMultiSelect = Object.values(newValue).some((value) => !!value);
    $$byTag('button', this).forEach(toggleClass('hidden', isMultiSelect));
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
      toggleRecentlyClosed: makeAction({
        initValue: false,
        target: $byClass('toggle-recently-closed', this),
        eventType: 'click',
        eventProcesser: (_, currentValue) => !currentValue,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    this.store = store;
  }
}
