import { dropAreaClasses, positions } from './types';
import {
  $,
  $$,
  cbToResolve,
  curry3,
  cssid,
  whichClass,
  propEq,
  getHistoryById,
} from './common';
import {
  addBookmark, getBookmark, setHasChildren, setAnimationClass,
} from './client';
import { zoomOut } from './zoom';

const sourceClasses = ['anchor', 'marker', 'tab', 'history'] as const;
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
    if (sourceClass === 'anchor') {
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
  // return false when not drop target
  if (dropAreaClass == null) {
    return false;
  }
  const $dragSource = $('.drag-source')!;
  const $targetParent = $target.parentElement!;
  // return falses when drop self
  if ($targetParent === $dragSource) {
    return false;
  }
  switch (dropAreaClass) {
    case 'drop-bottom':
      if ($targetParent === $dragSource.previousElementSibling
        || $targetParent.parentElement === $dragSource.parentElement!.previousElementSibling) {
        return false;
      }
      break;
    case 'drop-top':
      if ($targetParent === $dragSource.nextElementSibling
        || $targetParent.parentElement === $dragSource.parentElement!.nextElementSibling) {
        return false;
      }
      break;
    default:
  }
  return true;
}

const dragAndDropEvents = {
  dragstart(e: DragEvent) {
    const $target = e.target as HTMLElement;
    const className = whichClass(sourceClasses, $target);
    const [targetClass, $dragTarget, id] = (() => {
      switch (className) {
        case 'marker':
          return ['drag-start-folder', $target, $target.parentElement!.id] as const;
        case 'anchor':
        case 'tab': {
          const $leaf = $target.parentElement as HTMLElement;
          return ['drag-start-leaf', $leaf, $leaf.id] as const;
        }
        case 'history': {
          return ['drag-start-leaf', $target, $target.id] as const;
        }
        default:
          return ['', null, ''] as const;
      }
    })();
    if (!$dragTarget) {
      return;
    }
    const $main = $('main')!;
    if ($main.classList.contains('zoom-pane')) {
      const $zoomPane = $target.closest('.pane-history, .pane-tabs') as HTMLElement;
      zoomOut($zoomPane, { $main })();
    }
    $dragTarget.classList.remove('hilite');
    $dragTarget.classList.add('drag-source');
    const clone = $dragTarget.cloneNode(true) as HTMLAnchorElement;
    const $draggable = $('.draggable-clone')!.appendChild(clone);
    e.dataTransfer!.setDragImage($draggable, -12, 10);
    e.dataTransfer!.setData('application/source-id', id);
    e.dataTransfer!.setData('application/source-class', className!);
    $('main')!.classList.add(targetClass);
  },
  dragover(e: DragEvent) {
    if (checkDroppable(e)) {
      e.preventDefault();
    }
  },
  dragenter(e: DragEvent) {
    $('.drag-enter')?.classList.remove('drag-enter');
    if (checkDroppable(e)) {
      const $target = e.target as HTMLElement;
      $target.classList.add('drag-enter');
    }
  },
  dragend() {
    $('.drag-source')?.classList.remove('drag-source');
    $('main')!.classList.remove('drag-start-leaf');
    $('main')!.classList.remove('drag-start-folder');
    $('.draggable-clone')!.innerHTML = '';
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
    if (sourceClass === 'tab' || isDroppedTab) {
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
      $source.classList.remove('search-path');
      setAnimationClass($source, 'hilite');
    } else if (!isLeafFrom) {
      const $lastParantElement = $sourceFolders.parentElement;
      $destFolders.insertAdjacentElement(position, $sourceFolders);
      setHasChildren($lastParantElement);
      setHasChildren($sourceFolders.parentElement);
      setAnimationClass($(':scope > .marker', $sourceFolders)!, 'hilite');
    }
    $destLeafs.insertAdjacentElement(position, $sourceLeafs);
    setAnimationClass($sourceLeafs, 'hilite');
  },
};

export default dragAndDropEvents;
