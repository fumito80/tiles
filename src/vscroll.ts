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

type RowSetReduceAcc = [prevLastVisitDate: string, rowIndex: number];

export function rowSetterHistory(isShowFixedHeader: boolean) {
  const today = getLocaleDate();
  const $currentDate = $('.histories .current-date')!;
  addStyle(invisible)($currentDate);
  return (
    data: MyHistoryItem[],
    rowTop: number,
    dataTop: number,
  ) => (
    [prevLastVisitDate, rowIndex]: RowSetReduceAcc,
    $row: HTMLElement,
    index: number,
  ): RowSetReduceAcc => {
    if (index === 0) {
      if (isShowFixedHeader) {
        rmStyle('transform')($currentDate);
      }
      return ['', rowIndex];
    }
    const item = data[dataTop + rowIndex];
    if (!item) {
      addStyle(invisible)($row);
      return ['', rowIndex];
    }
    const {
      url, title, lastVisitTime, id,
    } = item;
    const lastVisitDate = getLocaleDate(lastVisitTime);
    const headerDate = lastVisitDate === prevLastVisitDate ? undefined : lastVisitDate;
    if (index === 1) {
      const currentDate = today === lastVisitDate ? '' : lastVisitDate!;
      setText(currentDate)($currentDate);
      addAttr('data-value', currentDate)($currentDate);
      if (headerDate && rowTop !== 0 && isShowFixedHeader) {
        addStyle(invisible)($row);
        return ['', rowIndex];
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
      return [lastVisitDate, rowIndex];
    }
    const text = title || url;
    const tooltip = `${text}\n${(new Date(lastVisitTime!)).toLocaleString()}\n${url}`;
    const pageUrl = (!url || url.startsWith('data')) ? 'none' : cssEscape(url);
    const backgroundImage = `url(${preFaviconUrl}${pageUrl})`;
    pipe(
      rmClass('hilite', 'header-date'),
      setHTML(`<div>${htmlEscape(text!)}</div><i class="icon-x"></i>`),
      addStyle('background-image', backgroundImage),
      addAttr('title', htmlEscape(tooltip)),
      addAttr('id', `hst-${id}`),
    )($row);
    return [lastVisitDate, rowIndex + 1];
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
  const bottomIndex = Math.ceil(($rows.parentElement!.offsetHeight - padding) / rowHeight) + 1;
  [...$rows.children].forEach((el, i) => {
    addStyle('display', i > bottomIndex ? 'none' : '')(el);
  });
  const vScrollHeight = rowHeight * data.length;
  addStyle('height', `${vScrollHeight - $container.offsetHeight + padding}px`)($fakeBottom);
  const setter = rowSetter(isShowFixedHeader);
  const children = [...$rows.children] as HTMLElement[];
  vScrollData = data;
  vScrollHandler = () => {
    const rowTop = -($container.scrollTop % rowHeight);
    const dataTop = Math.floor($container.scrollTop / rowHeight);
    children.reduce(setter(vScrollData, rowTop, dataTop), ['', 0]);
  };
  $container.addEventListener('scroll', vScrollHandler);
}

export function resetVScrollData(
  cbVScrollData: (data: Collection) => Collection,
) {
  vScrollData = cbVScrollData(vScrollData);
  searchCache.clear();
  $byClass('v-scroll')!.dispatchEvent(new Event('scroll'));
}

export function getVScrollData() {
  return vScrollData;
}

export function setScrollTop(scrollTop: number) {
  const $paneHistory = $byClass('histories') as HTMLDivElement;
  $paneHistory.scrollTop = scrollTop;
  $paneHistory.dispatchEvent(new Event('scroll'));
}
