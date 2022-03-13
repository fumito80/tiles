import { makeStyleIcon, $$, cssid } from './utils';

type NodeParamas = Pick<chrome.bookmarks.BookmarkTreeNode, 'id' | 'title'> & {
  children: string,
  length: number,
}

export function makeLeaf({
  title, url, id, parentId,
}: chrome.bookmarks.BookmarkTreeNode) {
  const style = makeStyleIcon(url);
  return `
    <div class="leaf" id="${id}" data-parent-id="${parentId}">
      <span class="anchor" draggable="true" title="${title}" style="${style}">${title}</span><button class="leaf-menu-button"><i class="fa fa-ellipsis-v"></i></button>
      <div class="drop-top"></div>
    </div>
  `;
}

export function makeNode({
  id, title, children, length,
}: NodeParamas) {
  return `
    <div class="folder" id="${id}" data-children="${length}">
      <div class="marker" draggable="true">
        <div class="drop-folder"></div><i class="fa fa-angle-right"></i><div class="title" tabindex="2"><span>${title}</span></div><div class="button-wrapper"><button class="folder-menu-button"><i class="fa fa-ellipsis-v"></i></button></div><div class="drop-top"></div><div class="drop-bottom"></div>
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
