import { MyHistoryItem } from './types';
import {
  makeStyleIcon, $$, cssid, htmlEscape,
} from './common';

type NodeParamas = Pick<chrome.bookmarks.BookmarkTreeNode, 'id' | 'title'> & {
  children: string,
  length: number,
}

export function makeLeaf({ title, url, id }: chrome.bookmarks.BookmarkTreeNode) {
  const style = makeStyleIcon(url);
  return `
    <div class="leaf" id="${id}">
      <span class="anchor" draggable="true" title="${title}" style="${style}">${htmlEscape(title)}</span><button class="leaf-menu-button"><i class="icon-fa-ellipsis-v"></i></button>
      <div class="drop-top"></div><div class="drop-bottom"></div>
    </div>
  `;
}

export function makeNode({
  id, title, children, length,
}: NodeParamas) {
  return `
    <div class="folder" id="${id}" data-children="${length}">
      <div class="marker" draggable="true">
        <div class="drop-folder"></div><i class="icon-fa-angle-right"></i><div class="title" tabindex="2"><span>${htmlEscape(title)}</span></div><div class="button-wrapper"><button class="folder-menu-button"><i class="icon-fa-ellipsis-v"></i></button></div><div class="drop-top"></div><div class="drop-bottom"></div>
      </div>
      ${children}
    </div>
  `;
}

export function updateAnker(id: string, { title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
  const style = makeStyleIcon(url);
  $$(cssid(id)).forEach((el) => {
    const $anchor = el.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', title);
    $anchor.setAttribute('style', style);
    $anchor.textContent = title;
  });
}

export function makeTab(
  id: number,
  addClass: string,
  title: string,
  style: string,
  content: string,
) {
  return `
    <div id="tab-${id}" class="tab-wrap ${addClass}" title="${title}">
      <span class="tab" draggable="true" style="${style}">${htmlEscape(content)}</span><i class="icon-x"></i>
      <div class="drop-top"></div><div class="drop-bottom"></div>
    </div>
  `;
}

export function makeHistory({
  url, title, lastVisitTime, headerDate, lastVisitDate, id,
}: MyHistoryItem) {
  if (headerDate) {
    return `<div class="history header-date" draggable="true">${lastVisitDate}</div>`;
  }
  const dt = `\n${(new Date(lastVisitTime!)).toLocaleString()}`;
  const style = makeStyleIcon(url!);
  const text = title || url;
  if (!text) {
    return '';
  }
  return `
    <div class="history" draggable="true" id="hst-${id}" title="${title}${dt}" style="${style}">
      <span>${htmlEscape(text)}</span><i class="icon-x"></i>
    </div>
  `;
}
