/* eslint-disable class-methods-use-this */
import { CliMessageTypes, dropAreaClasses, positions } from './types';
import {
  pipe,
  cssid,
  whichClass,
  propEq,
  decode,
  getChromeId,
  when,
  postMessage,
  extractUrl,
  setEvents,
  prop,
  getTabInfo,
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
  getBookmark,
  $$byClass,
  panes,
  getPrevTarget,
  addStyle,
  moveBookmarks,
  addFolderFromTabs,
  addBookmarksFromTabs,
} from './client';
import { clearTimeoutZoom, zoomOut } from './zoom';
import { Window } from './tabs';
import {
  Dispatch, IPubSubElement, makeAction, Store, StoreSub,
} from './popup';
import { dialog } from './dialogs';
import { MutiSelectableItem } from './multi-sel-pane';

const sourceClasses = ['leaf', 'marker', 'tab-wrap', 'history', 'window', 'tabs-header', 'pin-bookmark'] as const;
type SourceClass = (typeof sourceClasses)[number];

function getSubTree(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.getSubTree(id, ([treeNode]) => resolve(treeNode));
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

async function createTabs(
  windowId: number,
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  startIndex = 0,
) {
  return nodes.map(async (next, i) => {
    await chrome.tabs.create({
      url: next.url, windowId, index: i + startIndex, active: false,
    });
  });
}

async function createTabsFromFolder(parentId: string, windowId?: number, index?: number) {
  const [bm, ...rest] = await getBookmarks(parentId, []);
  if (!bm?.url) {
    return;
  }
  if (windowId == null) {
    const url = [bm, ...rest].map(prop('url')) as string[];
    chrome.windows.create({ url, incognito: false });
    return;
  }
  const createds = await createTabs(windowId, [bm, ...rest], index);
  Promise.all(createds).then(() => chrome.windows.update(windowId, { focused: true }));
}

async function dropWithTabs(
  $dropTarget: HTMLElement,
  sourceIds: string[],
  sourceClass: SourceClass,
  dropAreaClass: (typeof dropAreaClasses)[number],
  dispatch: Dispatch,
) {
  // tab to new window
  if (dropAreaClass === 'new-window-plus') {
    const payload = await Promise.all(sourceIds.map(getTabInfo))
      .then((tabs) => tabs.map(({ id, incognito }) => ({ tabId: id!, incognito })));
    const { windowId, message } = await postMessage(
      { type: CliMessageTypes.moveTabsNewWindow, payload },
    );
    if (message) {
      await dialog.alert(message);
    }
    chrome.windows.update(windowId, { focused: true });
    return;
  }
  // bookmark to tabs
  const { windowId, incognito, ...rest } = await getTabInfo($dropTarget.id);
  const index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
  if (sourceClass === 'leaf') {
    Promise.resolve(sourceIds.map(getBookmark))
      .then((tabs) => Promise.all(tabs))
      .then((tabs) => tabs.map((tab) => tab.url!))
      .then((urls) => postMessage({
        type: CliMessageTypes.openUrls, payload: { urls, windowId, index },
      }))
      .then(window.close);
    return;
  }
  // merge window
  const [sourceId] = sourceIds;
  if (sourceClass === 'window') {
    if ($dropTarget.closest('.tabs')) {
      const sourceWindow = $byId(sourceId) as Window;
      const sourceWindowId = sourceWindow.windowId;
      const focused = sourceWindow.isCurrent;
      const errorMessage = await postMessage({
        type: CliMessageTypes.moveWindow,
        payload: {
          sourceWindowId, windowId, index, focused,
        },
      });
      if (errorMessage) {
        dialog.alert(errorMessage);
        return;
      }
      ($dropTarget.parentElement as Window).reloadTabs(dispatch);
      $byId(sourceId).remove();
    }
    return;
  }
  // move folder to tab
  if (sourceClass === 'marker') {
    createTabsFromFolder(sourceId, windowId, index);
    return;
  }
  // move tab
  Promise
    .all(sourceIds.map((id) => getTabInfo(id)))
    .then((sourceTabs) => postMessage({
      type: CliMessageTypes.moveTabs,
      payload: {
        sourceTabs, windowId, incognito, index,
      },
    }))
    .then((message) => {
      if (typeof message === 'string') {
        dialog.alert(message);
        return;
      }
      const sourceWindowIds = sourceIds
        .map((id) => $byId(id).parentElement)
        .filter((win): win is Window => win instanceof Window)
        .filter((win, i, self) => self.indexOf(win) === i)
        .map((win) => {
          win.reloadTabs(dispatch);
          return win.id;
        });
      const $destWindow = $dropTarget.parentElement as Window;
      if (!sourceWindowIds.includes($destWindow?.id)) {
        $destWindow.reloadTabs(dispatch);
      }
      dispatch('re-search', 'tabs', true);
      $byClass('tabs')!.dispatchEvent(new Event('mouseenter'));
    });
}

async function dropFromHistory(
  $dropTarget: HTMLElement,
  elementIds: string[],
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
  dispatch: Dispatch,
) {
  if (dropAreaClass === 'new-window-plus') {
    dispatch('openHistories', { elementIds, incognito: false });
    return;
  }
  if (!hasClass($dropTarget, 'tab-wrap')) {
    dispatch('addBookmarksHistories', { elementIds, bookmarkDest });
    return;
  }
  const { windowId, ...rest } = await getTabInfo($dropTarget.id);
  const index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
  dispatch('openHistories', {
    elementIds, index, windowId, incognito: false,
  });
}

export function dropBmInNewWindow(
  sourceIds: string[],
  sourceClass: Extract<typeof sourceClasses[number], 'leaf' | 'marker'>,
  incognito = false,
) {
  if (sourceClass === 'leaf') {
    Promise.all(sourceIds.map(getBookmark))
      .then((bms) => bms.map((bm) => bm.url!))
      .then((url) => chrome.windows.create({ url, incognito }));
    return;
  }
  const [sourceId] = sourceIds;
  createTabsFromFolder(sourceId);
}

function checkDroppable(e: DragEvent) {
  const $dropArea = e.target as HTMLElement;
  const dropAreaClass = whichClass(dropAreaClasses, $dropArea);
  if (dropAreaClass == null) {
    return undefined;
  }
  const $dragSource = $byClass('drag-source')!;
  const sourceId = $dragSource.id || $dragSource.parentElement!.id;
  const $dropTarget = $dropArea.closest('.leaf, .folder, .tab-wrap') as HTMLElement;
  if ($dropTarget?.id === sourceId) {
    return undefined;
  }
  if (dropAreaClass === 'drop-bottom' && $dropTarget.nextElementSibling?.id === sourceId) {
    return undefined;
  }
  if (dropAreaClass === 'drop-top' && $dropTarget.previousElementSibling?.id === sourceId) {
    return undefined;
  }
  const isDropTargetSelected = hasClass($dropTarget, 'selected');
  const $nextTarget = getPrevTarget('leaf', 'tab-wrap')($dropTarget);
  if (isDropTargetSelected || (dropAreaClass === 'drop-top' && hasClass($nextTarget, 'selected'))) {
    return undefined;
  }
  const dragSource = whichClass(sourceClasses, $dragSource) || '';
  if (dropAreaClass === 'query' && !['leaf', 'tab-wrap', 'history'].includes(dragSource)) {
    return undefined;
  }
  const dropPane = whichClass(panes, $dropArea.closest('.folders, .leafs, .tabs') as HTMLElement);
  if (dragSource === 'marker' && dropPane === 'leafs') {
    return undefined;
  }
  if (dropPane === 'tabs' && hasClass($dragSource, 'session-tab', 'session-window')) {
    return undefined;
  }
  const dragPanes = whichClass(panes, $dragSource.closest('.folders, .leafs, .tabs') as HTMLElement);
  if (dropAreaClass === 'leafs') {
    return ['leaf', 'tab-wrap', 'history', 'tabs-header'].includes(dragSource)
      && !hasClass($byTag('app-main'), 'searching')
      && !(dragPanes === 'leafs' && $(`.leafs ${cssid($dragSource.id)}:last-of-type`))
      && !$('.leafs .selected:last-of-type');
  }
  if (
    dropPane === 'folders'
    && ['leaf', 'tab-wrap', 'history'].includes(dragSource)
    && ['drop-bottom', 'drop-top'].includes(dropAreaClass)
    && hasClass($dropArea.parentElement?.parentElement?.parentElement || undefined, 'folder')
  ) {
    return undefined;
  }
  return dropAreaClass;
}

function search(sourceId: string, includeUrl: boolean, dispatch: Store['dispatch']) {
  const $source = $byId(sourceId);
  const [$title1, $title2, $title3] = [...$source.children] as HTMLElement[];
  const value = when(includeUrl)
    .then(() => {
      let url = extractUrl($source.style.backgroundImage);
      if (!url) {
        [, url] = ($title1.title || $title2.title || $title3.title).split('\n') || [];
      }
      return url;
    })
    .else($title1.textContent || $title2.textContent);
  dispatch('search', value!, true);
}

function getDraggableElement(
  $dragTargets: HTMLElement[],
) {
  const $draggableClone = $byClass('draggable-clone')!;
  $draggableClone.innerHTML = '';
  const itemHeight = $dragTargets[0].offsetHeight;
  $dragTargets.some(($el, i) => {
    if (itemHeight * i > 120) {
      const $div = addChild(document.createElement('div'))($draggableClone);
      $div.textContent = `... and ${$dragTargets.length - i} more items`;
      addStyle({ padding: '2px' })($div);
      return true;
    }
    const clone = $el.cloneNode(true) as HTMLElement;
    clone.style.removeProperty('transform');
    addChild(clone)($draggableClone);
    return false;
  });
  return $draggableClone;
}

function resetMultiSelect($target: HTMLElement, $selecteds: HTMLElement[], dispatch: Dispatch) {
  if ($selecteds.length === 0) {
    return [$target];
  }
  if ($target instanceof MutiSelectableItem) {
    const className = $target.constructor.name;
    const selecteds = $selecteds.filter(($el) => $el.constructor.name === className);
    if (selecteds.length === 0) {
      dispatch('multiSelPanes', { all: false });
      return [$target];
    }
    if ($target.selected) {
      return $selecteds;
    }
    $target.select(true);
  }
  return undefined;
}

export default class DragAndDropEvents implements IPubSubElement {
  $appMain: HTMLElement;
  timerDragEnterFolder = 0;
  constructor($appMain: HTMLElement) {
    this.$appMain = $appMain;
    const dragAndDropEvents = {
      dragover: this.dragover,
      dragenter: this.dragenter,
    };
    setEvents([$appMain], dragAndDropEvents, undefined, this);
  }
  dragstart(_: any, e: DragEvent, __: any, store: StoreSub) {
    const $target = e.target as HTMLElement;
    const className = whichClass(sourceClasses, $target);
    if (!className) {
      return;
    }
    const [$dragTargets, ids] = when(className === 'marker')
      .then([[$target], [$target.parentElement!.id]] as const)
      .when(className === 'window')
      .then([[$target.firstElementChild as HTMLElement], [$target.id]] as const)
      .when(className === 'pin-bookmark')
      .then(() => {
        store.dispatch('multiSelPanes', {
          bookmarks: false, tabs: false, histories: false, all: false,
        });
        const $source = $('.current-window .current-tab')!;
        return [[$source], [$source.id]] as const;
      })
      .else(() => {
        const $selecteds = $$byClass('selected');
        const $reselecteds = resetMultiSelect($target, $selecteds, store.dispatch) || $$byClass('selected');
        return [$reselecteds, $reselecteds.map(($el) => $el.id)] as const;
      });
    const $main = $byTag('app-main')!;
    if (hasClass($main, 'zoom-pane')) {
      const $zoomPane = $dragTargets[0]?.closest('.histories, .tabs') as HTMLElement;
      setTimeout(zoomOut($zoomPane, { $main }), 100);
    } else {
      clearTimeoutZoom();
    }
    $dragTargets.forEach(pipe(
      rmClass('hilite'),
      addClass('drag-source'),
    ));
    document.body.append(...$$('[role="menu"]:not(.menu-tree)'));
    const $draggable = when(className === 'history')
      .then(() => {
        const $draggableClone = $byClass('draggable-clone')!;
        if ($draggableClone.children.length > 1) {
          $target.classList.add('selected');
        }
        return $draggableClone;
      })
      .else(() => getDraggableElement($dragTargets as HTMLElement[]));
    const sourceClassName = className === 'pin-bookmark' ? 'tab-wrap' : className;
    e.dataTransfer!.setDragImage($draggable, -12, 10);
    e.dataTransfer!.setData('application/source-id', ids.join(','));
    e.dataTransfer!.setData('application/source-class', sourceClassName);
    e.dataTransfer!.effectAllowed = 'move';
    store.dispatch('dragging', true);
  }
  dragover(e: DragEvent) {
    if (checkDroppable(e)) {
      e.preventDefault();
    }
  }
  dragenter(e: DragEvent) {
    $byClass('drag-enter')?.classList.remove('drag-enter');
    const dropAreaClass = checkDroppable(e);
    if (dropAreaClass) {
      addClass('drag-enter')(e.target as HTMLElement);
      clearTimeout(this.timerDragEnterFolder);
      if (dropAreaClass === 'drop-folder') {
        const $folder = (e.target as HTMLElement).parentElement?.parentElement!;
        if (hasClass($folder, 'path') || ($folder.dataset.children ?? '0') === '0') {
          return;
        }
        this.timerDragEnterFolder = setTimeout(() => {
          $folder.classList.add('path');
        }, 1500);
      }
    }
  }
  dragend(_: any, e: DragEvent, __: any, store: StoreSub) {
    $$byClass('drag-source').forEach(rmClass('drag-source'));
    setHTML('')($byClass('draggable-clone')!);
    if (e.dataTransfer?.dropEffect === 'none') {
      const className = whichClass(sourceClasses, (e.target as HTMLElement));
      const paneClass = decode(className, ['tab-wrap', 'tabs'], ['history', 'histories']);
      $byClass(paneClass ?? null)?.dispatchEvent(new Event('mouseenter'));
    }
    store.dispatch('dragging', false);
  }
  async drop(_: any, e: DragEvent, __: any, store: StoreSub) {
    const $dropArea = e.target as HTMLElement;
    const sourceIdCsv = e.dataTransfer?.getData('application/source-id')!;
    const sourceIds = sourceIdCsv.split(',');
    const [sourceId] = sourceIds;
    const sourceClass = e.dataTransfer?.getData('application/source-class')! as SourceClass;
    const dropAreaClass = whichClass(dropAreaClasses, $dropArea)!;
    if (dropAreaClass === 'query') {
      store.getStates('setIncludeUrl').then((includeUrl) => search(sourceId, includeUrl, store.dispatch));
      store.dispatch('multiSelPanes', { all: false });
      return;
    }
    const $dropTarget = $dropArea.parentElement?.id
      ? $dropArea.parentElement!
      : $dropArea.parentElement!.parentElement!;
    const destId = $dropTarget.id;
    const isDroppedTab = hasClass($dropTarget, 'tab-wrap');
    let bookmarkDest: chrome.bookmarks.BookmarkDestinationArg = { parentId: destId };
    if (sourceClass === 'tabs-header' || sourceClass === 'pin-bookmark') {
      return;
    }
    if (dropAreaClass === 'leafs') {
      const parentId = $byClass('open')?.id || '1';
      bookmarkDest = { parentId };
    } else if (!isDroppedTab && dropAreaClass !== 'drop-folder') {
      const parentId = $dropTarget.parentElement?.id! || '1';
      const subTree = await getSubTree(parentId);
      const findIndex = subTree.children?.findIndex(propEq('id', destId));
      if (findIndex == null) {
        dialog.alert('Operation failed with unknown error.');
        return;
      }
      const index = findIndex + (dropAreaClass === 'drop-bottom' ? 1 : 0);
      bookmarkDest = { parentId, index };
    }
    // from history
    if (sourceClass === 'history') {
      await dropFromHistory($dropTarget, sourceIds, dropAreaClass, bookmarkDest, store.dispatch);
      store.dispatch('multiSelPanes', { all: false });
      return;
    }
    store.dispatch('multiSelPanes', { all: false });
    // from tabs to bookmarks/folder
    const dropPane = whichClass(panes, $dropArea.closest('.folders, .leafs, .tabs') as HTMLElement);
    const isRootFolder = ['drop-top', 'drop-bottom'].includes(dropAreaClass) && $(`.leafs ${cssid(destId)}`)?.parentElement?.id === '1';
    if (
      sourceClass === 'tab-wrap'
      && !isDroppedTab
      && (dropPane === 'leafs' || dropAreaClass === 'drop-folder' || isRootFolder)
    ) {
      const tabs = await Promise.all(sourceIds.map(getTabInfo));
      addBookmarksFromTabs(tabs, bookmarkDest);
      return;
    }
    // from tabs to window of tabs
    if (sourceClass === 'tab-wrap' || isDroppedTab) {
      dropWithTabs($dropTarget, sourceIds, sourceClass, dropAreaClass, store.dispatch);
      return;
    }
    // from window of tabs
    if (sourceClass === 'window') {
      const windowId = getChromeId(sourceId);
      if (dropAreaClass === 'new-window-plus') {
        // to new window
        postMessage({ type: CliMessageTypes.moveWindowNew, payload: { windowId } });
        return;
      }
      // to bookmarks/folder
      chrome.windows.get(windowId, { populate: true }).then(({ tabs }) => {
        if (dropPane === 'leafs') {
          addBookmarksFromTabs(tabs!, bookmarkDest);
          return;
        }
        const position = positions[dropAreaClass];
        addFolderFromTabs(tabs!, bookmarkDest, destId, position);
      });
      return;
    }
    // bookmark/folder to new window
    if (dropAreaClass === 'new-window-plus') {
      dropBmInNewWindow(sourceIds, sourceClass);
      return;
    }
    // bookmark/folder move each other
    moveBookmarks(dropAreaClass, bookmarkDest, sourceIds, destId);
  }
  actions() {
    return {
      dragging: makeAction({
        initValue: false,
      }),
      dragstart: makeAction({
        target: this.$appMain,
        eventType: 'dragstart',
        eventOnly: true,
        noStates: true,
      }),
      drop: makeAction({
        target: this.$appMain,
        eventType: 'drop',
        eventOnly: true,
        noStates: true,
      }),
      dragend: makeAction({
        target: this.$appMain,
        eventType: 'dragend',
        eventOnly: true,
        noStates: true,
      }),
    };
  }
  connect() {}
}
