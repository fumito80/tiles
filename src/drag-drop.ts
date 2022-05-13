import { dropAreaClasses, positions } from './types';
import {
  $, $$,
  cbToResolve,
  curry3,
  cssid,
  whichClass,
  propEq,
  getHistoryById,
  rmClass,
  pipe,
  setHTML,
  addClass,
  addChild,
  switches,
} from './common';
import {
  addBookmark,
  getBookmark,
  setHasChildren,
  setAnimationClass,
} from './client';
import { clearTimeoutZoom, zoomOut } from './zoom';

const sourceClasses = ['leaf', 'marker', 'tab-wrap', 'history'] as const;
type SourceClass = (typeof sourceClasses)[number];

function getSubTree(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.getSubTree(id, ([treeNode]) => resolve(treeNode));
  });
}

function dropWithTabs(
  $dropTarget: HTMLElement,
  sourceId: string,
  sourceClass: SourceClass,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
) {
  const isDroppedTab = $dropTarget.classList.contains('tab-wrap');
  const [, tabId] = (isDroppedTab ? $dropTarget.id : sourceId).split('-');
  chrome.tabs.get(Number(tabId), async ({ windowId, ...rest }) => {
    if (!isDroppedTab) {
      const { url, title } = rest;
      addBookmark(bookmarkDest.parentId, { url, title, ...bookmarkDest });
      return;
    }
    if (sourceClass === 'leaf') {
      const index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
      const { url } = await getBookmark(sourceId);
      chrome.tabs.create({ index, url, windowId }, () => {
        chrome.windows.update(windowId, { focused: true });
      });
      return;
    }
    const [, sourceTabId] = sourceId.split('-');
    chrome.tabs.get(Number(sourceTabId), async (sourceTab) => {
      let index: number;
      if (sourceTab.windowId === windowId) {
        index = rest.index - (dropAreaClass === 'drop-bottom' ? 0 : 1);
        if (rest.index < sourceTab.index) {
          // move to right
          index = rest.index;
        }
      } else {
        index = rest.index + (dropAreaClass === 'drop-bottom' ? 1 : 0);
      }
      chrome.tabs.move([Number(sourceTabId)], { windowId, index }, () => {
        if (chrome.runtime.lastError) {
          return;
        }
        let domIndex = index;
        if (sourceTab.windowId === windowId && rest.index > sourceTab.index) {
          domIndex += 1;
        }
        const $source = $(`#${sourceId}`)!;
        const $sourceParent = $source.parentElement!;
        const $destParent = $dropTarget.parentElement!;
        $destParent?.insertBefore($source, $destParent.children[domIndex]);
        if ($sourceParent.children.length === 0) {
          $sourceParent.remove();
        }
      });
    });
    $('.tabs')!.dispatchEvent(new Event('mouseenter'));
  });
}

async function dropFromHistory(
  $dropTarget: HTMLElement,
  sourceId: string,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
) {
  const { url, title } = await getHistoryById(sourceId);
  const isDroppedTab = $dropTarget.classList.contains('tab-wrap');
  if (!isDroppedTab) {
    addBookmark(bookmarkDest.parentId, { url, title, ...bookmarkDest });
    return;
  }
  const [, tabId] = $dropTarget.id.split('-');
  chrome.tabs.get(Number(tabId), async ({ windowId, ...rest }) => {
    const index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
    chrome.tabs.create({ index, url, windowId }, () => {
      chrome.windows.update(windowId, { focused: true });
    });
  });
}

function checkDroppable(e: DragEvent) {
  const $target = e.target as HTMLElement;
  const dropAreaClass = whichClass(dropAreaClasses, $target);
  if (dropAreaClass == null) {
    return false;
  }
  const $dragSource = $('.drag-source')!;
  const sourceId = $dragSource.id || $dragSource.parentElement!.id;
  const $dropTarget = $target.closest('.leaf, .folder, .tab-wrap')!;
  if ($dropTarget.id === sourceId) {
    return false;
  }
  if (dropAreaClass === 'drop-bottom' && $dropTarget.nextElementSibling?.id === sourceId) {
    return false;
  }
  if (dropAreaClass === 'drop-top' && $dropTarget.previousElementSibling?.id === sourceId) {
    return false;
  }
  return true;
}

const dragAndDropEvents = {
  dragstart(e: DragEvent) {
    const $target = e.target as HTMLElement;
    const className = whichClass(sourceClasses, $target);
    if (!className) {
      return;
    }
    const [targetClass, $dragTarget, id] = switches(className)
      .case('marker')
      .then(['drag-start-folder', $target, $target.parentElement!.id] as const)
      .else(['drag-start-leaf', $target, $target.id] as const);
    const $main = $('main')!;
    if ($main.classList.contains('zoom-pane')) {
    // if ([...$main.classList].some((name) => ['zoom-pane', 'init-zoom'].includes(name))) {
      const $zoomPane = $target.closest('.histories, .tabs') as HTMLElement;
      zoomOut($zoomPane, { $main })();
    } else {
      clearTimeoutZoom();
    }
    pipe(
      rmClass('hilite'),
      addClass('drag-source'),
    )($dragTarget);
    const clone = $dragTarget.cloneNode(true) as HTMLAnchorElement;
    const $draggable = addChild(clone)($('.draggable-clone'));
    e.dataTransfer!.setDragImage($draggable, -12, 10);
    e.dataTransfer!.setData('application/source-id', id);
    e.dataTransfer!.setData('application/source-class', className!);
    addClass(targetClass)($('main'));
  },
  dragover(e: DragEvent) {
    if (checkDroppable(e)) {
      e.preventDefault();
    }
  },
  dragenter(e: DragEvent) {
    rmClass('drag-enter')($('.drag-enter'));
    if (checkDroppable(e)) {
      addClass('drag-enter')(e.target as HTMLElement);
    }
  },
  dragend(e: DragEvent) {
    rmClass('drag-source')($('.drag-source'));
    rmClass('drag-start-leaf', 'drag-start-folder')($('main'));
    setHTML('')($('.draggable-clone'));
    if (e.dataTransfer?.dropEffect === 'none') {
      const className = whichClass(sourceClasses, (e.target as HTMLElement));
      const paneClass = switches(className)
        .case('tab-wrap')
        .then('.tabs')
        .case('history')
        .then('.histories')
        .else(null);
      $(paneClass)?.dispatchEvent(new Event('mouseenter'));
    }
  },
  async drop(e: DragEvent) {
    const $dropArea = e.target as HTMLElement;
    const sourceId = e.dataTransfer?.getData('application/source-id')!;
    const sourceClass = e.dataTransfer?.getData('application/source-class')! as SourceClass;
    const dropAreaClass = whichClass(dropAreaClasses, $dropArea)!;
    const $dropTarget = $dropArea.parentElement?.id
      ? $dropArea.parentElement!
      : $dropArea.parentElement!.parentElement!;
    const destId = $dropTarget.id;
    const isDroppedTab = $dropTarget.classList.contains('tab-wrap');
    let bookmarkDest: chrome.bookmarks.BookmarkDestinationArg = { parentId: $dropTarget.id };
    if (!isDroppedTab && dropAreaClass !== 'drop-folder') {
      const parentId = $dropTarget.parentElement?.id! || '1';
      const subTree = await getSubTree(parentId);
      const findIndex = subTree.children?.findIndex(propEq('id', $dropTarget.id));
      if (findIndex == null) {
        // eslint-disable-next-line no-alert
        alert('Operation failed with unknown error.');
        return;
      }
      const index = findIndex + (dropAreaClass === 'drop-bottom' ? 1 : 0);
      bookmarkDest = { parentId, index };
    }
    if (sourceClass === 'history') {
      dropFromHistory($dropTarget, sourceId, dropAreaClass, bookmarkDest);
      return;
    }
    if (sourceClass === 'tab-wrap' || isDroppedTab) {
      dropWithTabs($dropTarget, sourceId, sourceClass, dropAreaClass, bookmarkDest);
      return;
    }
    await cbToResolve(curry3(chrome.bookmarks.move)(sourceId)(bookmarkDest));
    const position = positions[dropAreaClass];
    const [$sourceLeafs, $sourceFolders] = $$(cssid(sourceId));
    const [$destLeafs, $destFolders] = $$(cssid(destId));
    const isRootTo = $destLeafs.parentElement.id === '1' && dropAreaClass !== 'drop-folder';
    const isRootFrom = $sourceLeafs.parentElement.id === '1';
    const isLeafFrom = $sourceLeafs.classList.contains('leaf');
    if (isLeafFrom && isRootFrom && !isRootTo) {
      $sourceFolders.remove();
    } else if (isLeafFrom && isRootTo) {
      const $source = isRootFrom ? $sourceFolders : $sourceLeafs.cloneNode(true);
      $destFolders.insertAdjacentElement(position, $source);
      pipe(
        rmClass('search-path'),
        setAnimationClass('hilite'),
      )($source);
    } else if (!isLeafFrom) {
      const $lastParantElement = $sourceFolders.parentElement;
      $destFolders.insertAdjacentElement(position, $sourceFolders);
      setHasChildren($lastParantElement);
      setHasChildren($sourceFolders.parentElement);
      setAnimationClass('hilite')($(':scope > .marker', $sourceFolders));
    }
    $destLeafs.insertAdjacentElement(position, $sourceLeafs);
    setAnimationClass('hilite')($sourceLeafs);
  },
};

export default dragAndDropEvents;
