import { Collection } from './types';
import { $, makeStyleIcon } from './utils';

export function rowSetterHistory(
  { data, rowTop, dataTop }: { data: Collection, rowTop: number, dataTop: number },
) {
  return (row: Element, index: number) => {
    const { url, title, lastVisitTime } = data[dataTop + index];
    const text = title ?? url;
    const backgroundImage = makeStyleIcon(url);
    const tooltip = `${text}\n${(new Date(lastVisitTime)).toLocaleString()}`;
    // eslint-disable-next-line no-param-reassign
    row.textContent = text;
    row.setAttribute('style', `transform:translateY(${rowTop}px);${backgroundImage}`);
    row.setAttribute('title', tooltip);
  };
}

export type VScrollRowSetter = typeof rowSetterHistory;

export function setVScroll(container: HTMLDivElement, setter: VScrollRowSetter, data: Collection) {
  const rows = $('.rows', container);
  const vscroll = $('.v-scroll-bar', container);
  const vscrollFiller = $('.scroll-filler', container);
  const firstRow = rows?.firstElementChild as HTMLElement;
  if (!firstRow || !rows || !vscroll || !vscrollFiller) {
    return;
  }
  const rowHeight = firstRow.offsetHeight;
  vscrollFiller.style.height = `${rowHeight * data.length}px`;
  vscroll.addEventListener('scroll', () => {
    const rowTop = -(vscroll.scrollTop % rowHeight);
    const dataTop = Math.floor(vscroll.scrollTop / rowHeight);
    [...rows.children].forEach(setter({ data, rowTop, dataTop }));
  });
  rows.addEventListener('wheel', (e: WheelEvent) => {
    vscroll.scrollTop += e.deltaY;
  });
}
