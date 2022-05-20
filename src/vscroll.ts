import { State, Collection, MyHistoryItem } from './types';
import {
  $, $byClass, $byTag,
  pipe, pick,
  getLocal, setLocal, getLocaleDate,
  isDateEq, htmlEscape,
  addStyle, addAttr, setHTML, rmClass, setText, rmStyle, addClass, rmAttr, addChild, hasClass,
} from './common';
import { makeHistory } from './html';

const invisible = { transform: 'translateY(-10000px)' };

const searchCache = new Map<string, Array<MyHistoryItem>>();
let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];
let vScrollData: Collection;

export function rowSetterHistory() {
  const today = getLocaleDate();
  const $currentDate = $('.histories .current-date')!;
  const isShowFixedHeader = !hasClass($byTag('main'), 'date-collapsed');
  addStyle(invisible)($currentDate);
  return (
    data: MyHistoryItem[],
    rowTop: number,
    dataTop: number,
  ) => ($row: HTMLElement, index: number) => {
    if (index === 0) {
      if (isShowFixedHeader) {
        rmStyle('transform')($currentDate);
      }
      return;
    }
    const item = data[dataTop + index - 1];
    if (!item) {
      addStyle(invisible)($row);
      return;
    }
    const {
      url, title, lastVisitTime, headerDate, id,
    } = item;
    if (index === 1) {
      const lastVisitDate = getLocaleDate(lastVisitTime);
      setText(today === lastVisitDate ? '' : lastVisitDate!)($currentDate);
      if (headerDate && rowTop !== 0 && isShowFixedHeader) {
        addStyle(invisible)($row);
        return;
      }
    }
    const transform = `translateY(${rowTop}px)`;
    addStyle({ transform })($row);
    if (headerDate) {
      if (index === 2 && isShowFixedHeader) {
        addStyle({ transform })($currentDate);
      }
      pipe(
        setHTML(getLocaleDate(lastVisitTime)!),
        rmStyle('background-image'),
        addClass('header-date'),
        rmAttr('title'),
      )($row);
      return;
    }
    const text = title || url;
    const tooltip = `${text}\n${(new Date(lastVisitTime!)).toLocaleString()}`;
    pipe(
      rmClass('hilite', 'header-date'),
      setHTML(`<div>${htmlEscape(text!)}</div><i class="icon-x"></i>`),
      addStyle('background-image', `url('chrome://favicon/${url}')`),
      addAttr('title', tooltip),
      addAttr('id', `hst-${id}`),
    )($row);
  };
}

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

export type VScrollRowSetter = typeof rowSetterHistory;

export async function setVScroll(
  $container: HTMLDivElement,
  rowSetter: VScrollRowSetter,
  data: Collection,
  { rowHeight }: State['vscrollProps'],
) {
  const $rows = $byClass('rows', $container);
  const firstRow = $rows?.firstElementChild as HTMLElement;
  if (!firstRow || !$rows) {
    return;
  }
  const { paddingTop, paddingBottom } = getComputedStyle($rows);
  const padding = Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom);
  addStyle('height', `${$container.offsetHeight - padding}px`)($rows);
  $container.removeEventListener('scroll', vScrollHandler);
  const $fakeBottom = $byClass('v-scroll-fake-bottom', $container)!;
  rmStyle('height')($fakeBottom);
  const bottomIndex = Math.ceil(($rows.parentElement!.offsetHeight - padding) / rowHeight) + 1;
  [...$rows.children].forEach((el, i) => {
    addStyle('display', i > bottomIndex ? 'none' : '')(el);
  });
  const vScrollHeight = rowHeight * data.length;
  addStyle('height', `${vScrollHeight - $container.offsetHeight + padding}px`)($fakeBottom);
  const setter = rowSetter();
  const children = [...$rows.children] as HTMLElement[];
  vScrollData = data;
  vScrollHandler = () => {
    const rowTop = -($container.scrollTop % rowHeight);
    const dataTop = Math.floor($container.scrollTop / rowHeight);
    children.forEach(setter(vScrollData, rowTop, dataTop));
  };
  $container.addEventListener('scroll', vScrollHandler);
}

export function refreshVScroll() {
  $byClass('v-scroll')!.dispatchEvent(new Event('scroll'));
}

export function resetVScrollData(
  cbVScrollData: (data: Collection) => Collection,
) {
  vScrollData = cbVScrollData(vScrollData);
  searchCache.clear();
  refreshVScroll();
}

export function getVScrollData() {
  return vScrollData;
}

export function setScrollTop(scrollTop: number) {
  const $paneHistory = $byClass('histories') as HTMLDivElement;
  $paneHistory.scrollTop = scrollTop;
  $paneHistory.dispatchEvent(new Event('scroll'));
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

type ResetParams = {
  initialize?: boolean, reFilter?: RegExp, includeUrl?: boolean, removedHistory?: boolean,
};

export async function resetHistory({
  initialize,
  reFilter,
  includeUrl,
}: ResetParams = {}) {
  const $paneHistory = $byClass<HTMLDivElement>('histories')!;
  rmClass('date-collapsed')($byTag('main'));
  const $rows = $byClass('rows', $paneHistory)!;
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
  setVScroll($paneHistory, rowSetterHistory, data, vscrollProps);
  if (reFilter || !initialize) {
    [...$rows?.children || []].forEach(
      pipe(
        rmStyle('background-image'),
        rmAttr('title'),
        setHTML(''),
      ),
    );
    $paneHistory.scrollTop = 0;
    $paneHistory.dispatchEvent(new Event('scroll'));
  }
}
