import { MyHistoryItem } from './types';
import {
  makeStyleIcon, htmlEscape, getLocaleDate,
} from './common';

type NodeParamas = Pick<chrome.bookmarks.BookmarkTreeNode, 'id' | 'title'> & {
  children: string,
  length: number,
}

export function makeLeaf(
  { title, url, id }: chrome.bookmarks.BookmarkTreeNode,
  isSearching = false,
) {
  const style = makeStyleIcon(url);
  return `
    <bm-leaf class="leaf${isSearching ? ' search-path' : ''}" id="${id}" draggable="true" style="${style}">
      <div class="anchor" title="${htmlEscape(title)}\n${htmlEscape(url!)}">${htmlEscape(title)}</div><button class="leaf-menu-button"><i class="icon-fa-ellipsis-v"></i></button>
      <div class="drop-top"></div><div class="drop-bottom"></div>
    </bm-leaf>
  `;
}

export function makeNode({
  id, title, children, length,
}: NodeParamas) {
  return `
    <div is="bm-folder" class="folder" id="${id}" data-children="${length}">
      <div class="marker" draggable="true" title="${htmlEscape(title)}">
        <div class="drop-folder"></div><i class="icon-fa-angle-right"></i><div class="title" tabindex="2"><div>${htmlEscape(title)}</div></div><div class="button-wrapper"><button class="folder-menu-button"><i class="icon-fa-ellipsis-v"></i></button></div><div class="drop-top"></div><div class="drop-bottom"></div>
      </div>
      ${children}
    </div>
  `;
}

export function makeHistory({
  url, title, lastVisitTime, headerDate, id, headerStyle = '',
}: MyHistoryItem & { headerStyle?: string }) {
  if (headerDate) {
    const lastVisitDate = getLocaleDate(lastVisitTime);
    return `<history-item class="history header-date" draggable="true" style="${headerStyle}">${lastVisitDate}</history-item>`;
  }
  // const dt = new Date(lastVisitTime!).toLocaleString();
  const style = makeStyleIcon(url);
  const text = title || url;
  // const tooltip = htmlEscape(`${title}\n${dt}\n${url}`);
  return `
    <history-item class="history" draggable="true" id="hst-${id}" style="${style}">
      <div class="history-title">${htmlEscape(text!)}</div><i class="icon-x"></i>
    </history-item>
  `;
}
