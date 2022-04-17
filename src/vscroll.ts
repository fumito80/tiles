import { State, Collection, MyHistoryItem } from './types';
import {
  $, getLocal, setLocal, pick, htmlEscape, getLocaleDate, isDateEq,
} from './common';
import { makeHistory } from './html';

const searchCache = new Map<string, Array<MyHistoryItem>>();
let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];
let vScrollData: Collection;

export function rowSetterHistory(
  data: MyHistoryItem[],
  rowTop: number,
  dataTop: number,
) {
  const today = getLocaleDate();
  const $currentDate = $('.pane-history .current-date')!;
  $currentDate.style.transform = 'translateY(-2px)';
  return (row: HTMLElement, index: number) => {
    if (index === 0) {
      return;
    }
    const item = data[dataTop + index - 1];
    if (!item) {
      row.style.setProperty('transform', 'translateY(-10000px)');
      return;
    }
    const {
      url, title, lastVisitTime, headerDate, id,
    } = item;
    if (index === 1) {
      const lastVisitDate = getLocaleDate(lastVisitTime);
      $currentDate.textContent = today === lastVisitDate ? '' : lastVisitDate!;
    }
    row.style.setProperty('transform', `translateY(${rowTop}px)`);
    row.classList.remove('hilite');
    if (headerDate) {
      const lastVisitDate = getLocaleDate(lastVisitTime);
      // eslint-disable-next-line no-param-reassign
      row.innerHTML = lastVisitDate!;
      row.style.removeProperty('background-image');
      row.classList.add('header-date');
      row.removeAttribute('title');
      if (index === 2) {
        $currentDate.style.transform = `translateY(${rowTop}px)`;
      }
      return;
    }
    const text = title || url;
    const tooltip = `${text}\n${(new Date(lastVisitTime!)).toLocaleString()}`;
    row.setAttribute('id', `hst-${id}`);
    // eslint-disable-next-line no-param-reassign
    row.innerHTML = `<span>${htmlEscape(text!)}</span><i class="icon-x"></i>`;
    row.style.setProperty('background-image', `url('chrome://favicon/${url}')`);
    row.setAttribute('title', tooltip);
    row.classList.remove('header-date');
  };
}

function getRowHeight(rows: HTMLElement) {
  const tester = rows.appendChild(document.createElement('div'));
  tester.className = 'history';
  tester.textContent = 'A';
  const styles = getComputedStyle(tester);
  const props = pick('marginTop', 'marginBottom', 'paddingTop', 'paddingBottom')(styles);
  const elementHeight = Math.ceil(Number.parseFloat(styles.height));
  const rowHeight = Object.values(props)
    .reduce((acc, value) => acc + Number.parseFloat(String(value)), elementHeight);
  tester.remove();
  [...rows.children].forEach((el) => (el as HTMLElement).style.setProperty('height', `${elementHeight}px`));
  return { rowHeight, elementHeight };
}

export type VScrollRowSetter = typeof rowSetterHistory;

export function setVScroll(
  container: HTMLDivElement,
  setter: VScrollRowSetter,
  data: Collection,
  { rowHeight }: State['vscrollProps'],
) {
  const rows = $('.rows', container);
  const vscroll = $('.v-scroll-bar', container);
  const vscrollFiller = $('.scroll-filler', container);
  const firstRow = rows?.firstElementChild as HTMLElement;
  if (!firstRow || !rows || !vscroll || !vscrollFiller) {
    return;
  }
  const { paddingTop, paddingBottom } = getComputedStyle(rows);
  const padding = Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom);
  vscrollFiller.style.height = `${rowHeight * data.length + padding}px`;
  if (vScrollHandler) {
    vscroll.removeEventListener('scroll', vScrollHandler);
  } else {
    rows.addEventListener('wheel', (e: WheelEvent) => {
      vscroll.scrollTop += e.deltaY;
    });
  }
  const children = [...rows.children] as HTMLElement[];
  vScrollData = data;
  vScrollHandler = () => {
    const rowTop = -(vscroll.scrollTop % rowHeight);
    const dataTop = Math.floor(vscroll.scrollTop / rowHeight);
    children.forEach(setter(vScrollData, rowTop, dataTop));
  };
  vscroll.addEventListener('scroll', vScrollHandler);
}

export function refreshVScroll() {
  const vscroll = $('.pane-history .v-scroll-bar')!;
  vscroll.dispatchEvent(new Event('scroll'));
}

export function resetVScrollData(
  cbVScrollData: (data: Collection) => Collection,
) {
  vScrollData = cbVScrollData(vScrollData);
  searchCache.clear();
  refreshVScroll();
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
  const rows = $('.rows', $paneHistory)!;
  if (initialize) {
    const { rowHeight, elementHeight } = getRowHeight(rows);
    await setLocal({ vscrollProps: { rowHeight, elementHeight } });
  }
  const { histories: [init, ...tail], vscrollProps } = await getLocal('histories', 'vscrollProps');
  let histories = [init, ...tail];
  if (initialize && !init.headerDate && !isDateEq(init.lastVisitTime, new Date())) {
    const headerDate = { headerDate: true, lastVisitTime: init.lastVisitTime };
    histories = [headerDate, init, ...tail];
    const headerStyle = `height: ${vscrollProps.elementHeight}px`;
    const headerDateHtml = makeHistory({ ...headerDate, headerStyle });
    rows.firstElementChild?.insertAdjacentHTML('afterend', headerDateHtml);
    await setLocal({ histories, htmlHistory: rows.innerHTML });
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
    [...rows?.children || []].forEach((el) => {
      (el as HTMLElement).style.removeProperty('background-image');
      el.removeAttribute('title');
      // eslint-disable-next-line no-param-reassign
      el.innerHTML = '';
    });
    const vscroll = $('.v-scroll-bar', $paneHistory)!;
    vscroll.scrollTop = 0;
    vscroll.dispatchEvent(new Event('scroll'));
  }
}
