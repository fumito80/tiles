import { State, Collection, MyHistoryItem } from './types';
import {
  $,
  pipe, pick,
  getLocal, setLocal, getLocaleDate,
  isDateEq, htmlEscape,
  addStyle, addAttr, setHTML, rmClass, setText, rmStyle, addClass, rmAttr, addChild,
} from './common';
import { makeHistory } from './html';

const searchCache = new Map<string, Array<MyHistoryItem>>();
let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];
let vScrollData: Collection;

export function rowSetterHistory() {
  const today = getLocaleDate();
  const $currentDate = $('.pane-history .current-date')!;
  const isShowFixedHeader = !document.body.classList.contains('date-collapsed');
  addStyle('transform', 'translateY(-10000px)')($currentDate);
  return (
    data: MyHistoryItem[],
    rowTop: number,
    dataTop: number,
  ) => ($row: HTMLElement, index: number) => {
    if (index === 0) {
      if (isShowFixedHeader) {
        addStyle('transform', 'translateY(-2px)')($currentDate);
      }
      return;
    }
    const item = data[dataTop + index - 1];
    if (!item) {
      addStyle('transform', 'translateY(-10000px)')($row);
      return;
    }
    const {
      url, title, lastVisitTime, headerDate, id,
    } = item;
    if (index === 1) {
      const lastVisitDate = getLocaleDate(lastVisitTime);
      setText(today === lastVisitDate ? '' : lastVisitDate!)($currentDate);
      if (headerDate && rowTop !== 0 && isShowFixedHeader) {
        addStyle('transform', 'translateY(-10000px)')($row);
        return;
      }
    }
    addStyle('transform', `translateY(${rowTop}px)`)($row);
    if (headerDate) {
      if (index === 2 && isShowFixedHeader) {
        addStyle('transform', `translateY(${rowTop}px)`)($currentDate);
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
      setHTML(`<span>${htmlEscape(text!)}</span><i class="icon-x"></i>`),
      addStyle('background-image', `url('chrome://favicon/${url}')`),
      addAttr('title', tooltip),
      addAttr('id', `hst-${id}`),
    )($row);
  };
}

function getRowHeight($rows: HTMLElement) {
  const $tester = pipe(
    addChild(document.createElement('div')),
    addClass('history'),
    setText('A'),
  )($rows);
  const styles = getComputedStyle($tester);
  const props = pick('marginTop', 'marginBottom', 'paddingTop', 'paddingBottom')(styles);
  const elementHeight = Math.ceil(Number.parseFloat(styles.height));
  const rowHeight = Object.values(props)
    .reduce((acc, value) => acc + Number.parseFloat(String(value)), elementHeight);
  $tester.remove();
  [...$rows.children].forEach(addStyle('height', `${elementHeight}px`));
  return { rowHeight, elementHeight };
}

export type VScrollRowSetter = typeof rowSetterHistory;

export function setVScroll(
  $container: HTMLDivElement,
  rowSetter: VScrollRowSetter,
  data: Collection,
  { rowHeight }: State['vscrollProps'],
) {
  const $rows = $('.rows', $container);
  const firstRow = $rows?.firstElementChild as HTMLElement;
  if (!firstRow || !$rows) {
    return;
  }
  const $fakeBottom = $('.v-scroll-fake-bottom', $container)!;
  $fakeBottom.style.removeProperty('height');
  $container.removeEventListener('scroll', vScrollHandler);
  const { paddingTop, paddingBottom } = getComputedStyle($rows);
  const padding = Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom);
  const vScrollHeight = rowHeight * data.length + padding;
  const margin = $container.scrollHeight + ($container.scrollHeight - $container.offsetHeight);
  $fakeBottom.style.height = `${vScrollHeight - margin}px`;
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
  $('.v-scroll')!.dispatchEvent(new Event('scroll'));
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
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  document.body.classList.remove('date-collapsed');
  const $rows = $('.rows', $paneHistory)!;
  if (initialize) {
    const { rowHeight, elementHeight } = getRowHeight($rows);
    await setLocal({ vscrollProps: { rowHeight, elementHeight } });
  }
  const { histories: [init, ...tail], vscrollProps } = await getLocal('histories', 'vscrollProps');
  let histories = [init, ...tail];
  if (initialize && !init.headerDate && !isDateEq(init.lastVisitTime, new Date())) {
    const headerDate = { headerDate: true, lastVisitTime: init.lastVisitTime };
    histories = [headerDate, init, ...tail];
    const headerStyle = `height: ${vscrollProps.elementHeight}px`;
    const headerDateHtml = makeHistory({ ...headerDate, headerStyle });
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
