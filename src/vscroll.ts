import { State, Collection, MyHistoryItem } from './types';
import {
  $, getStorage, pick, setStorage, when, htmlEscape,
} from './utils';

export function rowSetterHistory(
  data: MyHistoryItem[],
  rowTop: number,
  dataTop: number,
  filterd: boolean,
) {
  const latestDate = data[0]?.lastVisitDate;
  const $currentDate = $('.pane-history .current-date')!;
  return (accLastVisitDate: string | null, row: HTMLElement, index: number) => {
    if (index === 0) {
      $currentDate.style.transform = `translateY(${filterd ? '-10000px' : 0})`;
      return accLastVisitDate;
    }
    const item = data[dataTop + index - 1];
    if (!item) {
      row.style.setProperty('transform', 'translateY(-10000px)');
      return accLastVisitDate;
    }
    const {
      url, title, lastVisitTime, lastVisitDate, headerDate,
    } = item;
    if (!filterd && index === 1) {
      $currentDate.textContent = latestDate === lastVisitDate ? '' : lastVisitDate!;
    }
    if (headerDate) {
      // eslint-disable-next-line no-param-reassign
      row.textContent = lastVisitDate!;
      row.style.setProperty('transform', `translateY(${rowTop}px)`);
      row.style.removeProperty('background-image');
      row.classList.add('header-date');
      row.removeAttribute('title');
      if (index === 2) {
        $currentDate.style.transform = `translateY(${rowTop}px)`;
      }
      return lastVisitDate;
    }
    const text = title || url;
    const tooltip = `${text}\n${(new Date(lastVisitTime!)).toLocaleString()}`;
    // eslint-disable-next-line no-param-reassign
    row.textContent = htmlEscape(text!);
    row.style.setProperty('transform', `translateY(${rowTop}px)`);
    row.style.setProperty('background-image', `url('chrome://favicon/${url}')`);
    row.setAttribute('title', tooltip);
    row.classList.remove('header-date');
    return lastVisitDate;
  };
}

function getRowHeight(rows: HTMLElement) {
  const tester = rows.appendChild(document.createElement('div'));
  tester.textContent = 'A';
  const styles = getComputedStyle(tester);
  const props = pick('marginTop', 'marginBottom', 'paddingTop', 'paddingBottom')(styles);
  const elementHeight = Math.round(Number.parseFloat(styles.height));
  const rowHeight: number = Object.values(props)
    .reduce((acc, value) => acc + Number.parseFloat(String(value)), elementHeight) - 2;
  tester.remove();
  [...rows.children].forEach((el) => (el as HTMLElement).style.setProperty('height', `${elementHeight}px`));
  return { rowHeight, elementHeight };
}

export type VScrollRowSetter = typeof rowSetterHistory;

let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];

export function setVScroll(
  container: HTMLDivElement,
  setter: VScrollRowSetter,
  data: Collection,
  { rowHeight }: State['vscrollProps'],
  filterd: boolean,
) {
  const rows = $('.rows', container);
  const vscroll = $('.v-scroll-bar', container);
  const vscrollFiller = $('.scroll-filler', container);
  const firstRow = rows?.firstElementChild as HTMLElement;
  if (!firstRow || !rows || !vscroll || !vscrollFiller) {
    return;
  }
  vscrollFiller.style.height = `${rowHeight * data.length}px`;
  if (vScrollHandler) {
    vscroll.removeEventListener('scroll', vScrollHandler);
  } else {
    rows.addEventListener('wheel', (e: WheelEvent) => {
      vscroll.scrollTop += e.deltaY;
    });
  }
  const children = [...rows.children] as HTMLElement[];
  vScrollHandler = () => {
    const rowTop = -(vscroll.scrollTop % rowHeight);
    const dataTop = Math.floor(vscroll.scrollTop / rowHeight);
    children.reduce<any>(setter(data, rowTop, dataTop, filterd), null);
  };
  vscroll.addEventListener('scroll', vScrollHandler);
}

type ResetParams = { initialize?: boolean, reFilter?: RegExp };

export async function resetHistory({ initialize, reFilter }: ResetParams = {}) {
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  const rows = $('.rows', $paneHistory)!;
  if (initialize) {
    const { rowHeight, elementHeight } = getRowHeight(rows);
    setStorage({ vscrollProps: { rowHeight, elementHeight } });
  }
  const { histories: [init, ...tail], vscrollProps } = await getStorage('histories', 'vscrollProps');
  const today = (new Date()).toLocaleDateString();
  const histories2 = when(!!initialize && init.lastVisitDate !== today && !init.headerDate)
    .then(() => {
      const headerDate = { headerDate: true, lastVisitDate: init.lastVisitDate };
      const histories = [headerDate, init, ...tail];
      rows.firstElementChild?.insertAdjacentHTML('afterend', `<div class="header-date">${init.lastVisitDate}</div>`);
      setStorage({ histories, htmlHistory: rows.innerHTML });
      return histories as MyHistoryItem[];
    })
    .else(() => [init, ...tail]);
  const data = !reFilter ? histories2 : histories2.filter(({ title, url }) => reFilter.test(title || url || ''));
  setVScroll($paneHistory, rowSetterHistory, data, vscrollProps, !!reFilter);
  if (reFilter || !initialize) {
    [...rows?.children || []].forEach((el) => {
      (el as HTMLElement).style.removeProperty('background-image');
      el.removeAttribute('title');
      // eslint-disable-next-line no-param-reassign
      el.textContent = '';
    });
    const vscroll = $('.v-scroll-bar', $paneHistory)!;
    vscroll.scrollTop = 0;
    vscroll.dispatchEvent(new Event('scroll'));
  }
}
