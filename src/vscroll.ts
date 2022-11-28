import { State, Collection, MyHistoryItem } from './types';
import {
  pipe, getLocaleDate, htmlEscape, preFaviconUrl, cssEscape,
} from './common';
import {
  $, $byClass,
  addStyle, addAttr, setHTML, rmClass, setText, rmStyle, addClass, rmAttr,
} from './client';

const invisible = { transform: 'translateY(-10000px)' };

export const searchCache = new Map<string, Array<MyHistoryItem>>();
let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];
let vScrollData: MyHistoryItem[];

export function rowSetterHistory(isShowFixedHeader: boolean) {
  const today = getLocaleDate();
  const $currentDate = $('.histories .current-date')!;
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
      const currentDate = today === lastVisitDate ? '' : lastVisitDate!;
      setText(currentDate)($currentDate);
      addAttr('data-value', currentDate)($currentDate);
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
        rmAttr('id'),
      )($row);
      return;
    }
    const text = title || url;
    const tooltip = `${text}\n${(new Date(lastVisitTime!)).toLocaleString()}\n${url}`;
    const pageUrl = (!url || url.startsWith('data')) ? 'none' : cssEscape(url);
    const backgroundImage = `url(${preFaviconUrl}${pageUrl})`;
    pipe(
      rmClass('hilite', 'header-date'),
      setHTML(`<div class="history-title">${htmlEscape(text!)}</div><i class="icon-x"></i>`),
      addStyle('background-image', backgroundImage),
      addAttr('title', htmlEscape(tooltip)),
      addAttr('id', `hst-${id}`),
    )($row);
  };
}

export type VScrollRowSetter = typeof rowSetterHistory;

export async function setVScroll(
  $container: HTMLDivElement,
  rowSetter: VScrollRowSetter,
  data: Collection,
  rowHeight: State['vscrollProps']['rowHeight'],
  isShowFixedHeader = true,
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
  const vScrollHeight = rowHeight * data.length;
  addStyle('height', `${vScrollHeight - $container.offsetHeight + padding}px`)($fakeBottom);
  const setter = rowSetter(isShowFixedHeader);
  const children = [...$rows.children] as HTMLElement[];
  vScrollData = data;
  vScrollHandler = () => {
    const rowTop = -($container.scrollTop % rowHeight);
    const dataTop = Math.floor($container.scrollTop / rowHeight);
    children.forEach(setter(vScrollData, rowTop, dataTop));
  };
  $container.addEventListener('scroll', vScrollHandler);
}

export function resetVScrollData(
  cbVScrollData: (data: MyHistoryItem[]) => MyHistoryItem[],
) {
  vScrollData = cbVScrollData(vScrollData);
  searchCache.clear();
  $byClass('v-scroll')!.dispatchEvent(new Event('scroll'));
}

export function getVScrollData() {
  return vScrollData;
}

export function applyVScrollData<T>(fnSometing: (data: MyHistoryItem[]) => T) {
  return fnSometing(vScrollData);
}

export function setScrollTop(scrollTop: number) {
  const $paneHistory = $byClass('histories') as HTMLDivElement;
  $paneHistory.scrollTop = scrollTop;
  $paneHistory.dispatchEvent(new Event('scroll'));
}
