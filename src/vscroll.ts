import { $, makeStyleIcon } from './utils';

export default function setVScroll(container: HTMLDivElement, data: Array<{ [key: string]: any }>) {
  const rows = $('.rows', container);
  const vscroll = $('.v-scroll-bar', container);
  const vscrollFiller = $('.scroll-filler', container);
  const firstRow = rows?.firstElementChild as HTMLElement;
  if (!firstRow || !rows || !vscroll || !vscrollFiller) {
    return;
  }
  const rowHeight = firstRow.offsetHeight;
  vscrollFiller.style.height = `${rowHeight * data.length}px`;
  vscroll.addEventListener('scroll', (e: Event) => {
    const scrollBar = e.target! as HTMLElement;
    const { scrollTop } = scrollBar;
    const cellTop = -(scrollTop % rowHeight);
    const dataTop = Math.floor(scrollTop / rowHeight);
    [...rows.children].forEach((row, i) => {
      const {
        url, title, lastVisitTime,
      } = data[dataTop + i];
      const text = title ?? url;
      const backgroundImage = makeStyleIcon(url);
      const tooltip = `${text}\n${(new Date(lastVisitTime)).toLocaleString()}`;
      const oldTextNode = row.firstChild;
      const textNode = document.createTextNode(text);
      if (oldTextNode) {
        row.replaceChild(textNode, oldTextNode);
      } else {
        row.appendChild(textNode);
      }
      row.setAttribute('style', `transform:translateY(${cellTop}px);${backgroundImage}`);
      row.setAttribute('title', tooltip);
    });
  });
  (rows as HTMLElement).addEventListener('wheel', (e: WheelEvent) => {
    vscroll.scrollTop += e.deltaY;
  });
}
