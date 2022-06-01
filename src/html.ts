import { MyHistoryItem } from './types';
import {
  makeStyleIcon, $$, cssid, htmlEscape, getLocaleDate,
} from './common';

type NodeParamas = Pick<chrome.bookmarks.BookmarkTreeNode, 'id' | 'title'> & {
  children: string,
  length: number,
}

export function makeLeaf({ title, url, id }: chrome.bookmarks.BookmarkTreeNode) {
  const style = makeStyleIcon(url);
  return `
    <div class="leaf" id="${id}" draggable="true" style="${style}">
      <div class="anchor" title="${htmlEscape(title)}">${htmlEscape(title)}</div><button class="leaf-menu-button"><i class="icon-fa-ellipsis-v"></i></button>
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
        <div class="drop-folder"></div><i class="icon-fa-angle-right"></i><div class="title" tabindex="2"><div>${htmlEscape(title)}</div></div><div class="button-wrapper"><button class="folder-menu-button"><i class="icon-fa-ellipsis-v"></i></button></div><div class="drop-top"></div><div class="drop-bottom"></div>
      </div>
      ${children}
    </div>
  `;
}

export function updateAnker(id: string, { title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
  const style = makeStyleIcon(url);
  $$(cssid(id)).forEach((el) => {
    el.setAttribute('style', style);
    const $anchor = el.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', title);
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
  const tooltip = htmlEscape(title);
  return `
    <div id="tab-${id}" draggable="true" class="tab-wrap ${addClass}" style="${style}">
      <div class="tab" title="${tooltip}">${htmlEscape(content)}</div><i class="icon-x"></i>
      <div class="tooltip">${tooltip}</div>
      <div class="drop-top"></div><div class="drop-bottom"></div>
    </div>
  `;
}

export function makeTabsHeader(
  title: string,
  style: string,
  content: string,
  incognito: boolean,
) {
  const incognitoElem = incognito ? '<i class="icon-private"></i>' : '';
  const tooltip = htmlEscape(title);
  return `
    <div draggable="true" class="tabs-header" style="${style}">
      ${incognitoElem}
      <div class="tab" title="${tooltip}">${htmlEscape(content)}</div>
      <button class="collapse-tab"><i class="icon-list" title="Show list view"></i><i class="icon-grid" title="Show grid view"></i></button>
      <button class="tabs-menu-button"><i class="icon-fa-ellipsis-v"></i></button>
    </div>
  `;
}

export function makeHistory({
  url, title, lastVisitTime, headerDate, id, headerStyle = '',
}: MyHistoryItem & { headerStyle?: string }) {
  if (headerDate) {
    const lastVisitDate = getLocaleDate(lastVisitTime);
    return `<div class="history header-date" draggable="true" style="${headerStyle}">${lastVisitDate}</div>`;
  }
  const dt = `\n${(new Date(lastVisitTime!)).toLocaleString()}`;
  const style = makeStyleIcon(url!);
  const text = title || url;
  if (!text) {
    return '';
  }
  const tooltip = htmlEscape(`${title}${dt}`);
  return `
    <div class="history" draggable="true" id="hst-${id}" title="${tooltip}" style="${style}">
      <div>${htmlEscape(text)}</div><i class="icon-x"></i>
    </div>
  `;
}
