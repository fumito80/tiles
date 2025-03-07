import { MyHistoryItem } from './types';
import {
  makeStyleIcon, htmlEscape, getLocaleDate, getShortTime, decodeUrl,
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
  const decodedUrl = decodeUrl(url);
  return `
    <bm-leaf class="leaf${isSearching ? ' search-path' : ''}" id="${id}" draggable="true" style="${style}">
      <div class="anchor" title="${htmlEscape(title)}\n${htmlEscape(decodedUrl)}">${htmlEscape(title)}</div><button class="leaf-menu-button"><i class="icon-fa-ellipsis-v"></i></button>
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
  url, title, lastVisitTime, headerDate, id, isSession, sessionWindow, headerStyle = '',
}: MyHistoryItem & { headerStyle?: string }) {
  if (headerDate) {
    const lastVisitDate = getLocaleDate(lastVisitTime);
    return `<history-item class="history-item header-date" draggable="true" style="${headerStyle}">${lastVisitDate}</history-item>`;
  }
  const {
    elementId, addClassName, style,
  } = isSession
    ? {
      elementId: `session-${id}`,
      addClassName: sessionWindow ? ' session-window' : ' session-tab',
      style: sessionWindow ? '' : makeStyleIcon(url),
    }
    : {
      elementId: `hst-${id}`,
      addClassName: '',
      style: makeStyleIcon(url),
    };
  const text = title || url;
  const date = new Date(lastVisitTime!);
  const time = getShortTime(date);
  return `
    <history-item class="history-item${addClassName}" draggable="true" id="${elementId}" style="${style}">
      <i class="icon-fa-angle-right"></i>
      <div class="history-title">${htmlEscape(text!)}</div><div class="time">${time}</div><i class="icon-x"></i>
    </history-item>
  `;
}
