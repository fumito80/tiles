import { Collection, Model } from './types';
import {
  $, getStorage, makeStyleIcon, pick,
} from './utils';

export function rowSetterHistory(
  { data, rowTop, dataTop }: { data: Collection, rowTop: number, dataTop: number },
) {
  return (row: Element, index: number) => {
    const item = data[dataTop + index];
    if (!item) {
      return;
    }
    const { url, title, lastVisitTime } = item;
    const text = title ?? url;
    const backgroundImage = makeStyleIcon(url);
    const tooltip = `${text}\n${(new Date(lastVisitTime)).toLocaleString()}`;
    // eslint-disable-next-line no-param-reassign
    row.textContent = text;
    row.setAttribute('style', `transform:translateY(${rowTop}px);${backgroundImage}`);
    row.setAttribute('title', tooltip);
  };
}

function getRowHeight(el: HTMLElement) {
  const props = pick<Model, string>('height', 'marginTop', 'paddingTop', 'paddingBottom')(getComputedStyle(el));
  return Object.values(props).reduce((acc, value) => acc + Number.parseFloat(String(value)), 0);
}

export type VScrollRowSetter = typeof rowSetterHistory;

let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];

export function setVScroll(container: HTMLDivElement, setter: VScrollRowSetter, data: Collection) {
  const rows = $('.rows', container);
  const vscroll = $('.v-scroll-bar', container);
  const vscrollFiller = $('.scroll-filler', container);
  const firstRow = rows?.firstElementChild as HTMLElement;
  if (!firstRow || !rows || !vscroll || !vscrollFiller) {
    return;
  }
  let rowHeight = getRowHeight(firstRow);
  if (firstRow.offsetHeight === 0) {
    firstRow.textContent = "'";
    rowHeight = getRowHeight(firstRow);
    firstRow.firstChild!.remove();
  }
  vscrollFiller.style.height = `${rowHeight * data.length}px`;
  if (vScrollHandler) {
    vscroll.removeEventListener('scroll', vScrollHandler);
  } else {
    rows.addEventListener('wheel', (e: WheelEvent) => {
      vscroll.scrollTop += e.deltaY;
    });
  }
  vScrollHandler = () => {
    const rowTop = -(vscroll.scrollTop % rowHeight);
    const dataTop = Math.floor(vscroll.scrollTop / rowHeight);
    [...rows.children].forEach(setter({ data, rowTop, dataTop }));
  };
  vscroll.addEventListener('scroll', vScrollHandler);
}

export async function resetHistory(reset?: boolean, reFilter?: RegExp) {
  const { histories } = await getStorage('histories');
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  const rows = $('.rows', $paneHistory);
  const data = !reFilter ? histories : histories.filter(({ title, url }) => reFilter.test(title || url || ''));
  setVScroll($paneHistory, rowSetterHistory, data);
  if (reFilter || reset) {
    [...rows?.children || []].forEach((el) => {
      el.removeAttribute('style');
      el.removeAttribute('title');
      el.firstChild?.remove();
    });
    const vscroll = $('.v-scroll-bar', $paneHistory)!;
    vscroll.dispatchEvent(new Event('scroll'));
  }
}
