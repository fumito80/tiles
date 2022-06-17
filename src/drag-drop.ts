import { dropAreaClasses, positions } from './types';
import {
  pipe,
  cbToResolve,
  curry3,
  cssid,
  whichClass,
  propEq,
  getHistoryById,
  decode,
  when,
  getChromeId,
} from './common';
import {
  $, $$,
  rmClass,
  setHTML,
  addClass,
  addChild,
  $byId,
  $byClass,
  $byTag,
  hasClass,
  addStyle,
  setText,
  addAttr,
  addBookmark,
  getBookmark,
  setHasChildren,
  setAnimationClass,
  addFolderFromTabs,
  setOpenPaths,
} from './client';
import { clearTimeoutZoom, zoomOut } from './zoom';

const sourceClasses = ['leaf', 'marker', 'tab-wrap', 'history', 'window'] as const;
type SourceClass = (typeof sourceClasses)[number];

function getSubTree(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.getSubTree(id, ([treeNode]) => resolve(treeNode));
  });
}

function renameTabsHeader($source: HTMLElement) {
  const $header = $source.parentElement!.firstElementChild as HTMLElement;
  const $first = $header.nextElementSibling as HTMLElement;
  const $content = $byClass('tab', $first);
  addStyle('background-image', $first.style.backgroundImage)($header);
  pipe(
    setText($content.textContent),
    addAttr('title', $content.getAttribute('title')!),
  )($byClass('tab', $header));
}

function moveTab(sourceId: string, dropAreaClass: string, $dropTarget: HTMLElement) {
  const $source = $byId(sourceId)!;
  const $sourceParent = $source.parentElement!;
  const position = positions[dropAreaClass];
  $dropTarget.insertAdjacentElement(position, $source);
  renameTabsHeader($source);
  if ($sourceParent.children.length <= 1) {
    $sourceParent.remove();
    return;
  }
  if ($sourceParent.id !== $dropTarget.parentElement?.id) {
    renameTabsHeader($sourceParent.firstElementChild as HTMLElement);
  }
}

async function getTabInfo(preId: number | string) {
  return new Promise<chrome.tabs.Tab>((resolve) => {
    chrome.tabs.get(getChromeId(preId), resolve);
  });
}

async function dropWithTabs(
  $dropTarget: HTMLElement,
  srcElementId: string,
  sourceClass: SourceClass,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
) {
  if (!hasClass($dropTarget, 'tab-wrap')) {
    const { url, title } = await getTabInfo(srcElementId);
    addBookmark(bookmarkDest.parentId, { url, title, ...bookmarkDest });
    return;
  }
  const { windowId, ...rest } = await getTabInfo($dropTarget.id);
  let index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
  // Bookmark to tabs
  if (sourceClass === 'leaf') {
    const { url } = await getBookmark(srcElementId);
    chrome.tabs.create({ index, url, windowId }, () => {
      chrome.windows.update(windowId, { focused: true });
    });
    return;
  }
  // Merge window
  if (sourceClass === 'window') {
    const sourceWindowId = getChromeId(srcElementId);
    chrome.windows.get(sourceWindowId, { populate: true }, ({ tabs }) => {
      if (!tabs) {
        return;
      }
      const tabIds = tabs.map((tab) => tab.id!);
      chrome.tabs.move(tabIds, { windowId, index }, () => {
        if (chrome.runtime.lastError) {
          // eslint-disable-next-line no-alert
          alert(chrome.runtime.lastError.message);
          return;
        }
        const ids = dropAreaClass === 'drop-top' ? tabIds : tabIds.reverse();
        ids.forEach((id) => moveTab(String(`tab-${id}`), dropAreaClass, $dropTarget));
      });
    });
    return;
  }
  // Move folder to tab
  if (sourceClass === 'marker') {
    chrome.bookmarks.getChildren(srcElementId, (bms) => {
      bms.forEach(({ url }, i) => chrome.tabs.create({ url, index: index + i, windowId }));
    });
    return;
  }
  // Move tab
  const sourceTab = await getTabInfo(srcElementId);
  if (sourceTab.windowId === windowId) {
    index = rest.index - (dropAreaClass === 'drop-bottom' ? 0 : 1);
    if (rest.index < sourceTab.index) {
      // move to right
      index = rest.index;
    }
  } else {
    index = rest.index + (dropAreaClass === 'drop-bottom' ? 1 : 0);
  }
  chrome.tabs.move([sourceTab.id!], { windowId, index }, () => {
    if (chrome.runtime.lastError) {
      // eslint-disable-next-line no-alert
      alert(chrome.runtime.lastError.message);
      return;
    }
    moveTab(srcElementId, dropAreaClass, $dropTarget);
  });
  $byClass('tabs')!.dispatchEvent(new Event('mouseenter'));
}

async function dropFromHistory(
  $dropTarget: HTMLElement,
  sourceId: string,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
) {
  const { url, title } = await getHistoryById(sourceId);
  if (!hasClass($dropTarget, 'tab-wrap')) {
    addBookmark(bookmarkDest.parentId, { url, title, ...bookmarkDest });
    return;
  }
  const { windowId, ...rest } = await getTabInfo($dropTarget.id);
  const index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
  chrome.tabs.create({ index, url, windowId }, () => {
    chrome.windows.update(windowId, { focused: true });
  });
}

function checkDroppable(e: DragEvent) {
  const $target = e.target as HTMLElement;
  const dropAreaClass = whichClass(dropAreaClasses, $target);
  if (dropAreaClass == null) {
    return false;
  }
  const $dragSource = $byClass('drag-source')!;
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
    const [targetClass, $dragTarget, id] = when(className === 'marker')
      .then(['drag-start-folder', $target, $target.parentElement!.id] as const)
      .when(className === 'window').then(['drag-start-folder', $target.firstElementChild!, $target.id] as const)
      .else(['drag-start-leaf', $target, $target.id] as const);
    const $main = $byTag('main')!;
    if (hasClass($main, 'zoom-pane')) {
      const $zoomPane = $target.closest('.histories, .tabs') as HTMLElement;
      zoomOut($zoomPane, { $main })();
    } else {
      clearTimeoutZoom();
    }
    pipe(
      rmClass('hilite'),
      addClass('drag-source'),
    )($dragTarget);
    const $menu = $('[role="menu"]', $target);
    if ($menu) {
      document.body.append($menu);
    }
    const clone = $dragTarget.cloneNode(true) as HTMLAnchorElement;
    const $draggable = addChild(clone)($byClass('draggable-clone'));
    e.dataTransfer!.setDragImage($draggable, -12, 10);
    e.dataTransfer!.setData('application/source-id', id);
    e.dataTransfer!.setData('application/source-class', className!);
    setTimeout(() => addClass(targetClass)($byTag('main')), 0);
  },
  dragover(e: DragEvent) {
    if (checkDroppable(e)) {
      e.preventDefault();
    }
  },
  dragenter(e: DragEvent) {
    rmClass('drag-enter')($byClass('drag-enter'));
    if (checkDroppable(e)) {
      addClass('drag-enter')(e.target as HTMLElement);
    }
  },
  dragend(e: DragEvent) {
    rmClass('drag-source')($byClass('drag-source'));
    rmClass('drag-start-leaf', 'drag-start-folder')($byTag('main'));
    setHTML('')($byClass('draggable-clone'));
    if (e.dataTransfer?.dropEffect === 'none') {
      const className = whichClass(sourceClasses, (e.target as HTMLElement));
      const paneClass = decode(className, ['tab-wrap', 'tabs'], ['history', 'histories']);
      $byClass(paneClass ?? null)?.dispatchEvent(new Event('mouseenter'));
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
    const isDroppedTab = hasClass($dropTarget, 'tab-wrap');
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
    if (sourceClass === 'window') {
      // eslint-disable-next-line no-console
      addFolderFromTabs(bookmarkDest.parentId!, bookmarkDest.index!, sourceId);
      return;
    }
    await cbToResolve(curry3(chrome.bookmarks.move)(sourceId)(bookmarkDest));
    const position = positions[dropAreaClass];
    const [$sourceLeafs, $sourceFolders] = $$(cssid(sourceId));
    const [$destLeafs, $destFolders] = $$(cssid(destId));
    const isRootTo = $destLeafs.parentElement.id === '1' && dropAreaClass !== 'drop-folder';
    const isRootFrom = $sourceLeafs.parentElement.id === '1';
    const isLeafFrom = hasClass($sourceLeafs, 'leaf');
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
      setOpenPaths($sourceFolders);
      setAnimationClass('hilite')($(':scope > .marker', $sourceFolders));
    }
    $destLeafs.insertAdjacentElement(position, $sourceLeafs);
    setAnimationClass('hilite')($sourceLeafs);
  },
};

export default dragAndDropEvents;
