import { makeStyleIcon } from './utils';

type NodeParamas = Pick<chrome.bookmarks.BookmarkTreeNode, 'id' | 'title'> & {
  children: string,
  length: number,
}

export function makeLeaf({
  title, url, id, parentId,
}: chrome.bookmarks.BookmarkTreeNode) {
  const style = makeStyleIcon(url);
  return `
    <div is="bx-leaf" class="leaf" draggable="true" id="${id}" data-parent-id="${parentId}">
      <a class="anchor" draggable="true" href="#nul" title="${title}" style="${style}">${title}</a><button class="leaf-menu-button"><i class="fa fa-ellipsis-v"></i></button>
      <div class="drop-top"></div>
    </div>
  `;
}

export function makeNode({
  id, title, children, length,
}: NodeParamas) {
  return `
    <div is="bx-node" id="${id}" class="folder" data-children="${length}">
      <div class="marker" draggable="true">
        <div class="drop-folder"></div><i class="fa fa-angle-right"></i><div class="title" tabindex="2"><span>${title}</span></div><div class="button-wrapper"><button class="folder-menu-button"><i class="fa fa-ellipsis-v"></i></button></div><div class="drop-top"></div><div class="drop-bottom"></div>
      </div>
      ${children}
    </div>
  `;
}

export function updateAnker({ title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
  const style = makeStyleIcon(url);
  return ($anchor: HTMLAnchorElement) => {
    $anchor.setAttribute('title', title);
    $anchor.setAttribute('style', style);
  };
}
