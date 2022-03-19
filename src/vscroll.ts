import { IState, Collection } from './types';
import {
  $, getStorage, pick, setStorage,
} from './utils';

export function rowSetterHistory(
  data: Collection,
  rowTop: number,
  dataTop: number,
) {
  return (row: HTMLElement, index: number) => {
    const item = data[dataTop + index];
    if (!item) {
      Object.assign(row.style, { transform: 'translateY(-10000px)' });
      return;
    }
    const { url, title, lastVisitTime } = item;
    const text = title ?? url;
    const tooltip = `${text}\n${(new Date(lastVisitTime)).toLocaleString()}`;
    Object.assign(row, { textContent: text });
    Object.assign(row.style, {
      transform: `translateY(${rowTop}px)`,
      backgroundImage: `url('chrome://favicon/${url}')`,
    });
    row.setAttribute('title', tooltip);
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
  [...rows.children].forEach((el) => Object.assign((el as HTMLElement).style, { height: `${elementHeight}px` }));
  return { rowHeight, elementHeight };
}

export type VScrollRowSetter = typeof rowSetterHistory;

let vScrollHandler: Parameters<HTMLElement['removeEventListener']>[1];

export function setVScroll(
  container: HTMLDivElement,
  setter: VScrollRowSetter,
  data: Collection,
  { rowHeight }: IState['vscrollProps'],
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
    children.forEach(setter(data, rowTop, dataTop));
  };
  vscroll.addEventListener('scroll', vScrollHandler);
}

export async function resetHistory(reset?: boolean, reFilter?: RegExp) {
  const $paneHistory = $<HTMLDivElement>('.pane-history')!;
  const rows = $('.rows', $paneHistory)!;
  if (!reset) {
    const { rowHeight, elementHeight } = getRowHeight(rows);
    setStorage({ vscrollProps: { rowHeight, elementHeight } });
  }
  const { histories, vscrollProps } = await getStorage('histories', 'vscrollProps');
  const data = !reFilter ? histories : histories.filter(({ title, url }) => reFilter.test(title || url || ''));
  setVScroll($paneHistory, rowSetterHistory, data, vscrollProps);
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
