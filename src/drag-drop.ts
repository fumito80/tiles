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
  getChromeId,
  when,
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
  addBookmark,
  getBookmark,
  setHasChildren,
  setAnimationClass,
  addFromTabs,
  setOpenPaths,
  $$byClass,
  panes,
} from './client';
import { clearTimeoutZoom, zoomOut } from './zoom';
import { Window } from './tabs';

const sourceClasses = ['leaf', 'marker', 'tab-wrap', 'history', 'window'] as const;
type SourceClass = (typeof sourceClasses)[number];

function getSubTree(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.getSubTree(id, ([treeNode]) => resolve(treeNode));
  });
}

function moveTab(sourceId: string, $dropTarget: HTMLElement) {
  const $sourceTab = $byId(sourceId);
  const $sourceWindow = $sourceTab.parentElement as Window;
  $sourceWindow.reloadTabs();
  const $destWindow = $dropTarget.parentElement as Window;
  if ($sourceWindow.id !== $destWindow?.id) {
    $destWindow.reloadTabs();
  }
}

async function getTabInfo(preId: number | string) {
  return new Promise<chrome.tabs.Tab & {
    isCurrentWindow: boolean, incognito: boolean
  }>((resolve) => {
    chrome.windows.getCurrent((currentWindow) => {
      chrome.tabs.get(getChromeId(preId), (tab) => {
        chrome.windows.get(tab.windowId, { populate: true }, (win) => {
          resolve({
            ...tab,
            isCurrentWindow: tab.windowId === currentWindow.id,
            incognito: win.incognito,
          });
        });
      });
    });
  });
}

async function getBookmarks(parentId: string, nodes: chrome.bookmarks.BookmarkTreeNode[]) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
    chrome.bookmarks.getChildren(parentId, (btn) => {
      const children = btn.flatMap((bm) => {
        if (bm.url) {
          return bm;
        }
        return getBookmarks(bm.id, []);
      });
      Promise.all(children).then((treeNodes) => resolve([...nodes, ...treeNodes.flat()]));
    });
  });
}

function createTabs(windowId: number, nodes: chrome.bookmarks.BookmarkTreeNode[], startIndex = 0) {
  nodes.forEach(async (next, i) => {
    await chrome.tabs.create({ url: next.url, windowId, index: i + startIndex });
  });
}

async function createTabsFromFolder(parentId: string, windowId?: number) {
  const [bm, ...rest] = await getBookmarks(parentId, []);
  if (windowId == null) {
    chrome.windows.create({ url: bm.url }, (win) => createTabs(win!.id!, rest, 1));
    return;
  }
  chrome.windows.get(
    windowId,
    { populate: true },
    (win) => createTabs(windowId, [bm, ...rest], win.tabs?.length!),
  );
}

async function dropWithTabs(
  $dropTarget: HTMLElement,
  srcElementId: string,
  sourceClass: SourceClass,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
) {
  if (dropAreaClass === 'new-window-plus') {
    const { id: tabId } = await getTabInfo(srcElementId);
    chrome.windows.create({ tabId });
    return;
  }
  if ($dropTarget.closest('.folders')) {
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
      chrome.windows.update(windowId, { focused: true }).then(window.close);
    });
    return;
  }
  // Merge window
  if (sourceClass === 'window') {
    if ($dropTarget.closest('.tabs')) {
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
          ($dropTarget.parentElement as Window).reloadTabs();
          $byId(srcElementId).remove();
        });
      });
    }
    return;
  }
  // Move folder to tab
  if (sourceClass === 'marker') {
    createTabsFromFolder(srcElementId, windowId);
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
    moveTab(srcElementId, $dropTarget);
  });
  if (
    sourceTab.active
    && sourceTab.isCurrentWindow
    && sourceTab.windowId !== windowId
    && sourceTab.incognito === rest.incognito
  ) {
    chrome.windows.update(windowId, { focused: true });
    chrome.tabs.update(sourceTab.id!, { active: true });
  }
  $byClass('tabs')!.dispatchEvent(new Event('mouseenter'));
}

async function dropFromHistory(
  $dropTarget: HTMLElement,
  sourceId: string,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
) {
  const { url, title } = await getHistoryById(sourceId);
  if (dropAreaClass === 'new-window-plus') {
    chrome.windows.create({ url });
    return;
  }
  if (!hasClass($dropTarget, 'tab-wrap')) {
    addBookmark(bookmarkDest.parentId, { url, title, ...bookmarkDest });
    return;
  }
  const { windowId, ...rest } = await getTabInfo($dropTarget.id);
  const index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
  chrome.tabs.create({ index, url, windowId }, window.close);
}

function dropBmInNewWindow(sourceId: string, sourceClass: Extract<typeof sourceClasses[number], 'leaf' | 'marker'>) {
  if (sourceClass === 'leaf') {
    getBookmark(sourceId).then(({ url }) => chrome.windows.create({ url }));
    return;
  }
  createTabsFromFolder(sourceId);
}

function checkDroppable(e: DragEvent) {
  const $dropArea = e.target as HTMLElement;
  const dropAreaClass = whichClass(dropAreaClasses, $dropArea);
  if (dropAreaClass == null) {
    return false;
  }
  const $dragSource = $byClass('drag-source');
  const sourceId = $dragSource.id || $dragSource.parentElement!.id;
  const $dropTarget = $dropArea.closest('.leaf, .folder, .tab-wrap')!;
  if ($dropTarget?.id === sourceId) {
    return false;
  }
  if (dropAreaClass === 'drop-bottom' && $dropTarget.nextElementSibling?.id === sourceId) {
    return false;
  }
  if (dropAreaClass === 'drop-top' && $dropTarget.previousElementSibling?.id === sourceId) {
    return false;
  }
  const dragSource = whichClass(sourceClasses, $dragSource);
  const dropPane = whichClass(panes, $dropArea.closest('.folders, .leafs, .tabs') as HTMLElement);
  if (dragSource === 'marker' && dropPane === 'leafs') {
    return false;
  }
  const dragPanes = whichClass(panes, $dragSource.closest('.folders, .leafs, .tabs') as HTMLElement);
  if (dropAreaClass === 'leafs') {
    return !(dragPanes === 'leafs' && $(`.leafs ${cssid($dragSource.id)}:last-of-type`));
  }
  if (
    dropPane === 'folders'
    && ['leaf', 'tab-wrap', 'history'].includes(dragSource!)
    && ['drop-bottom', 'drop-top'].includes(dropAreaClass)
    && hasClass($dropArea.parentElement?.parentElement?.parentElement || null, 'folder')
  ) {
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
    const [$dragTarget, id] = when(className === 'marker')
      .then([$target, $target.parentElement!.id] as const)
      .when(className === 'window').then([$target.firstElementChild!, $target.id] as const)
      .else([$target, $target.id] as const);
    const $main = $byTag('app-main')!;
    if (hasClass($main, 'zoom-pane')) {
      const $zoomPane = $dragTarget.closest('.histories, .tabs') as HTMLElement;
      zoomOut($zoomPane, { $main })();
    } else {
      clearTimeoutZoom();
    }
    pipe(
      rmClass('hilite'),
      addClass('drag-source'),
    )($dragTarget);
    const $menu = $('[role="menu"]', $dragTarget);
    if ($menu) {
      document.body.append($menu);
    }
    const clone = $dragTarget.cloneNode(true) as HTMLAnchorElement;
    const $draggable = addChild(clone)($byClass('draggable-clone'));
    e.dataTransfer!.setDragImage($draggable, -12, 10);
    e.dataTransfer!.setData('application/source-id', id);
    e.dataTransfer!.setData('application/source-class', className!);
    setTimeout(() => addClass('drag-start')($main), 0);
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
    rmClass('drag-start')($byTag('app-main'));
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
    if (dropAreaClass === 'leafs') {
      const parentId = $byClass('open')?.id || '1';
      bookmarkDest = { parentId };
    } else if (!isDroppedTab && dropAreaClass !== 'drop-folder') {
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
    const position = positions[dropAreaClass];
    if (sourceClass === 'window') {
      const dropPane = whichClass(panes, $dropArea.closest('.folders, .leafs, .tabs') as HTMLElement);
      addFromTabs(
        bookmarkDest.parentId!,
        bookmarkDest.index!,
        sourceId,
        destId,
        position,
        dropPane,
        dropAreaClass === 'new-window-plus',
      );
      return;
    }
    if (dropAreaClass === 'new-window-plus') {
      dropBmInNewWindow(sourceId, sourceClass);
      return;
    }
    const [$sourceLeafs, $sourceFolders] = $$(cssid(sourceId));
    const [$destLeafs, $destFolders] = dropAreaClass === 'leafs' ? $$byClass('open') : $$(cssid(destId));
    if (!$destLeafs) {
      return;
    }
    await cbToResolve(curry3(chrome.bookmarks.move)(sourceId)(bookmarkDest));
    const isRootTo = $destLeafs.parentElement?.id === '1' && dropAreaClass !== 'drop-folder';
    const isRootFrom = $sourceLeafs.parentElement?.id === '1';
    const isLeafFrom = hasClass($sourceLeafs, 'leaf');
    if (isLeafFrom && isRootFrom && !isRootTo) {
      $sourceFolders.remove();
    } else if (isLeafFrom && isRootTo) {
      const $source = isRootFrom ? $sourceFolders : $sourceLeafs.cloneNode(true) as HTMLElement;
      $destFolders.insertAdjacentElement(position, $source);
      pipe(
        rmClass('search-path'),
        setAnimationClass('hilite'),
      )($source);
    } else if (!isLeafFrom) {
      const $lastParantElement = $sourceFolders.parentElement!;
      $destFolders.insertAdjacentElement(position, $sourceFolders);
      setHasChildren($lastParantElement);
      setHasChildren($sourceFolders.parentElement!);
      setOpenPaths($sourceFolders);
      setAnimationClass('hilite')($(':scope > .marker', $sourceFolders));
    }
    $destLeafs.insertAdjacentElement(position, $sourceLeafs);
    setAnimationClass('hilite')($sourceLeafs);
  },
};

export default dragAndDropEvents;
