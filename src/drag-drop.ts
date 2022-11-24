/* eslint-disable class-methods-use-this */
import { CliMessageTypes, dropAreaClasses, positions } from './types';
import {
  pipe,
  cssid,
  whichClass,
  propEq,
  getHistoryById,
  decode,
  getChromeId,
  when,
  postMessage,
  extractUrl,
  setEvents,
  prop,
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
  addFromTabs,
  $$byClass,
  panes,
  getPrevTarget,
  addStyle,
  moveBookmarks,
} from './client';
import { clearTimeoutZoom, zoomOut } from './zoom';
import { Window } from './tabs';
import {
  Dispatch, IPubSubElement, makeAction, States, Store,
} from './store';

const sourceClasses = ['leaf', 'marker', 'tab-wrap', 'history', 'window', 'tabs-header'] as const;
type SourceClass = (typeof sourceClasses)[number];

function getSubTree(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.getSubTree(id, ([treeNode]) => resolve(treeNode));
  });
}

function moveTab(sourceId: string, $dropTarget: HTMLElement, dispatch: Store['dispatch']) {
  const $sourceTab = $byId(sourceId);
  const $sourceWindow = $sourceTab.parentElement as Window;
  $sourceWindow.reloadTabs(dispatch);
  const $destWindow = $dropTarget.parentElement as Window;
  if ($sourceWindow.id !== $destWindow?.id) {
    $destWindow.reloadTabs(dispatch);
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
  [sourceId, ...sourceIds]: string[],
  sourceClass: SourceClass,
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
  dispatch: Store['dispatch'],
) {
  // Tab to new window
  if (dropAreaClass === 'new-window-plus') {
    const { id: tabId, incognito } = await getTabInfo(sourceId);
    chrome.windows.create({ tabId, incognito });
    return;
  }
  // Tab to bookmark
  if (!hasClass($dropTarget, 'tab-wrap')) {
    const { url, title } = await getTabInfo(sourceId);
    addBookmark(bookmarkDest.parentId, { url, title, ...bookmarkDest });
    return;
  }
  const { windowId, ...rest } = await getTabInfo($dropTarget.id);
  let index = rest.index + (dropAreaClass === 'drop-top' ? 0 : 1);
  // Bookmark to tabs
  if (sourceClass === 'leaf') {
    const tabs = [sourceId, ...sourceIds].map(
      (srcElementId) => getBookmark(srcElementId)
        .then(({ url }) => chrome.tabs.create({
          index, url, windowId, active: false,
        })),
    );
    Promise.all(tabs)
      .then(() => chrome.windows.update(windowId, { focused: true }).then(window.close));
    return;
  }
  // Merge window
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
        // eslint-disable-next-line no-alert
        alert(errorMessage);
        return;
      }
      ($dropTarget.parentElement as Window).reloadTabs(dispatch);
      $byId(sourceId).remove();
    }
    return;
  }
  // Move folder to tab
  if (sourceClass === 'marker') {
    index = rest.index + (dropAreaClass === 'drop-bottom' ? 1 : 0);
    createTabsFromFolder(sourceId, windowId, index);
    return;
  }
  // Move tab
  const sourceTab = await getTabInfo(sourceId);
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
    moveTab(sourceId, $dropTarget, dispatch);
  });
  if (
    sourceTab.active
    && sourceTab.isCurrentWindow
    && sourceTab.windowId !== windowId
    && sourceTab.incognito === rest.incognito
  ) {
    chrome.tabs.update(sourceTab.id!, { active: true });
    chrome.windows.update(windowId, { focused: true });
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
  if (isDropTargetSelected || hasClass($nextTarget, 'selected')) {
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
  const value = includeUrl
    ? extractUrl($source.style.backgroundImage)
    : $source.firstElementChild?.textContent!;
  dispatch('search', value, true);
}

function getDraggableElement(
  $dragTargets: HTMLElement[],
) {
  const $draggableClone = $byClass('draggable-clone')!;
  const itemHeight = $dragTargets[0].offsetHeight;
  $dragTargets.some(($el, i) => {
    const clone = $el.cloneNode(true) as HTMLElement;
    if (itemHeight * i > 120) {
      const $div = addChild(document.createElement('div'))($draggableClone);
      $div.textContent = `... and ${$dragTargets.length - i} other items`;
      addStyle({ padding: '2px' })($div);
      return true;
    }
    addChild(clone)($draggableClone);
    return false;
  });
  return $draggableClone;
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
  dragstart(e: DragEvent, dispatch: Dispatch) {
    const $target = e.target as HTMLElement;
    const className = whichClass(sourceClasses, $target);
    if (!className) {
      return;
    }
    const $selecteds = $$byClass('selected');
    const isMultiSelect = $selecteds.length > 0;
    const [$dragTargets, ids] = when(className === 'marker')
      .then([[$target], [$target.parentElement!.id]] as const)
      .when(className === 'window')
      .then([[$target.firstElementChild as HTMLElement], [$target.id]] as const)
      // .else([$target, $target.id] as const);
      .else(() => {
        if (!isMultiSelect) {
          return [[$target], [$target.id]] as const;
        }
        $target.classList.add('selected');
        const $targets = $$byClass('selected');
        return [$targets, $targets.map(($el) => $el.id)] as const;
      });
    // const $draggable = getDraggableElement($dragTarget, $selecteds);
    const $main = $byTag('app-main')!;
    if (hasClass($main, 'zoom-pane')) {
      const $zoomPane = $dragTargets[0].closest('.histories, .tabs') as HTMLElement;
      zoomOut($zoomPane, { $main })();
    } else {
      clearTimeoutZoom();
    }
    $dragTargets.forEach(pipe(
      rmClass('hilite'),
      addClass('drag-source'),
    ));
    $$('[role="menu"]').forEach(($menu) => document.body.append($menu));
    // const $menu = $('[role="menu"]', $dragTarget);
    // if ($menu) {
    //   document.body.append($menu);
    // }
    // const isMultiSelect = !!$byClass('selected');
    const $draggable = getDraggableElement($dragTargets as HTMLElement[]);
    e.dataTransfer!.setDragImage($draggable, -12, 10);
    e.dataTransfer!.setData('application/source-id', ids.join(','));
    e.dataTransfer!.setData('application/source-class', className!);
    dispatch('dragging', true);
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
  dragend(e: DragEvent, dispatch: Dispatch) {
    $$byClass('drag-source').forEach(rmClass('drag-source'));
    setHTML('')($byClass('draggable-clone')!);
    if (e.dataTransfer?.dropEffect === 'none') {
      const className = whichClass(sourceClasses, (e.target as HTMLElement));
      const paneClass = decode(className, ['tab-wrap', 'tabs'], ['history', 'histories']);
      $byClass(paneClass ?? null)?.dispatchEvent(new Event('mouseenter'));
    }
    dispatch('dragging', false);
  }
  async drop(e: DragEvent, states: States, dispatch: Dispatch) {
    const $dropArea = e.target as HTMLElement;
    const sourceIdCsv = e.dataTransfer?.getData('application/source-id')!;
    const [sourceId, ...sourceIds] = sourceIdCsv.split(',');
    const sourceClass = e.dataTransfer?.getData('application/source-class')! as SourceClass;
    const dropAreaClass = whichClass(dropAreaClasses, $dropArea)!;
    if (dropAreaClass === 'query') {
      const includeUrl = await states('setIncludeUrl');
      search(sourceId, includeUrl, dispatch);
      return;
    }
    dispatch('multiSelPanes', { all: false });
    const $dropTarget = $dropArea.parentElement?.id
      ? $dropArea.parentElement!
      : $dropArea.parentElement!.parentElement!;
    const destId = $dropTarget.id;
    const isDroppedTab = hasClass($dropTarget, 'tab-wrap');
    let bookmarkDest: chrome.bookmarks.BookmarkDestinationArg = { parentId: destId };
    if (sourceClass === 'tabs-header') {
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
        // eslint-disable-next-line no-alert
        alert('Operation failed with unknown error.');
        return;
      }
      const index = findIndex + (dropAreaClass === 'drop-bottom' ? 1 : 0);
      bookmarkDest = { parentId, index };
    }
    // From History
    if (sourceClass === 'history') {
      dropFromHistory($dropTarget, sourceId, dropAreaClass, bookmarkDest);
      return;
    }
    // From Tab/To Window of tabs
    if (sourceClass === 'tab-wrap' || isDroppedTab) {
      dropWithTabs(
        $dropTarget,
        [sourceId, ...sourceIds],
        sourceClass,
        dropAreaClass,
        bookmarkDest,
        dispatch,
      );
      return;
    }
    const position = positions[dropAreaClass];
    // From Window of tabs
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
    // Bookmark/Folder to new window
    if (dropAreaClass === 'new-window-plus') {
      dropBmInNewWindow([sourceId, ...sourceIds], sourceClass);
      return;
    }
    // Bookmark/Folder move each other
    moveBookmarks(dropAreaClass, bookmarkDest, [sourceId, ...sourceIds], destId);
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
      }),
      drop: makeAction({
        target: this.$appMain,
        eventType: 'drop',
        eventOnly: true,
      }),
      dragend: makeAction({
        target: this.$appMain,
        eventType: 'dragend',
        eventOnly: true,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('dragstart', (_, __, dispatch, e) => this.dragstart(e, dispatch));
    store.subscribe('drop', (_, states, dispatch, e) => this.drop(e, states, dispatch));
    store.subscribe('dragend', (_, __, dispatch, e) => this.dragend(e, dispatch));
  }
}
