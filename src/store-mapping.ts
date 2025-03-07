/* eslint-disable import/prefer-default-export */

import { AppMain } from './app-main';
import { HeaderLeafs, Leafs } from './bookmarks';
import { Folders } from './folders';
import { HeaderHistory, History } from './history';
import { FormSearch } from './search';
import { HeaderTabs, Tabs } from './tabs';
import DragAndDropEvents from './drag-drop';
import { registerActions } from './store';
import { Options } from './types';
import { $ } from './client';
import { HeaderRecentTabs, RecentTabs } from './recent-tabs';

type Components = {
  $appMain: AppMain,
  $headerLeafs: HeaderLeafs,
  $leafs: Leafs,
  $folders: Folders,
  $headerTabs: HeaderTabs,
  $tabs: Tabs,
  $headerHistory: HeaderHistory,
  $history: History,
  $formSearch: FormSearch,
  dragAndDropEvents: DragAndDropEvents,
  $headerRecentTabs: HeaderRecentTabs,
  $recentTabs: RecentTabs,
};

export function storeMapping(options: Options, components: Components) {
  const {
    $appMain,
    $headerLeafs,
    $leafs,
    $folders,
    $headerTabs,
    $tabs,
    $headerHistory,
    $history,
    $formSearch,
    dragAndDropEvents,
    $recentTabs,
    $headerRecentTabs,
  } = components;

  // Actions
  const actions = {
    ...$appMain.actions(),
    ...$leafs.actions(),
    ...$headerLeafs.actions(),
    ...$folders.actions(),
    ...$headerTabs.actions(),
    ...$tabs.actions(),
    ...$formSearch.actions(),
    ...$history.actions(),
    ...$headerHistory.actions(),
    ...dragAndDropEvents.actions(),
    ...$recentTabs.actions(),
    ...$headerRecentTabs.actions(),
  };

  // Build store
  const store = registerActions(actions, options);

  // Connect store
  Object.values(components).forEach((compo) => compo.connect(store));

  // Dispatch actions

  const $mainMenuHeader = $('.col-grid.end .pane-header') as HeaderLeafs | HeaderTabs | HeaderHistory | HeaderRecentTabs;

  // Broadcast type

  store.actionContext($mainMenuHeader, 'setIncludeUrl').map(
    $appMain.setIncludeUrl.bind($appMain),
    $history.setIncludeUrl.bind($history),
    $formSearch.resetQuery.bind($formSearch),
  );

  store.actionContext($formSearch, 'clearSearch').map(
    $leafs.clearSearch.bind($leafs),
    $headerTabs.clearSearch.bind($headerTabs),
    $tabs.clearSearch.bind($tabs),
    $history.clearSearch.bind($history),
  );

  store.actionContext($appMain, 'multiSelPanes').map(
    $leafs.multiSelectLeafs.bind($leafs),
    $tabs.multiSelect.bind($tabs),
    $headerHistory.multiSelPanes.bind($headerHistory),
    $history.multiSelect.bind($history),
    $recentTabs.multiSelect.bind($recentTabs),
    $formSearch.multiSelPanes.bind($formSearch),
  );

  store.actionContext($headerHistory, 'historyCollapseDate').map(
    $headerHistory.toggleCollapseIcon.bind($headerHistory),
    $history.collapseHistoryDate.bind($history),
  );

  store.actionContext($headerHistory, 'toggleRecentlyClosed').map(
    $headerHistory.toggleRecentlyClosed.bind($headerHistory),
    $history.resetHistory.bind($history),
  );

  store.actionContext(dragAndDropEvents, 'dragging').map(
    $appMain.dragging.bind($appMain),
    $tabs.dragging.bind($tabs),
    $formSearch.dragging.bind($formSearch),
  );

  store.actionContext($headerTabs, 'collapseWindowsAll').map(
    $headerTabs.toggleTabCollapsedAll.bind($headerTabs),
    $tabs.toggleTabCollapsedAll.bind($tabs),
  );

  store.actionContext($mainMenuHeader, 'setAppZoom').map(
    $appMain.setAppZoom.bind($appMain),
    $headerLeafs.setZoomAppMenu.bind($headerLeafs),
    $headerHistory.setZoomAppMenu.bind($headerHistory),
    $headerTabs.setZoomAppMenu.bind($headerTabs),
    $headerRecentTabs.setZoomAppMenu.bind($headerRecentTabs),
    $tabs.setAppZoom.bind($tabs),
    $folders.setAppZoom.bind($folders),
  );

  // focus subscribe unit

  store.subscribeContext($appMain)
    .map([$appMain, 'clickAppMain'], $appMain.clickAppMain)
    .map([$appMain, 'mousedownAppMain'], $appMain.mousedownAppMain)
    .map([$appMain, 'keydownMain'], $appMain.keydown)
    .map([$formSearch, 'searching'], $appMain.searching)
    .map([$headerTabs, 'minimizeAll'], $appMain.minimize)
    .map([$tabs, 'windowAction'], $appMain.minimizeOthers)
    .map([$tabs, 'minimizeApp'], $appMain.autoMinimize);

  store.subscribeContext($leafs)
    .map([$leafs, 'clickLeafs'], $leafs.clickItem)
    .map([$leafs, 'mousedownLeafs'], $leafs.mousedownItem)
    .map([$leafs, 'mouseupLeafs'], $leafs.mouseupItem)
    .map([$leafs, 'wheelLeafs'], $leafs.wheelHighlightTab)
    .map([$folders, 'clickFolders'], $leafs.clickItem)
    .map([$folders, 'mousedownFolders'], $leafs.mousedownItem)
    .map([$folders, 'mouseupFolders'], $leafs.mouseupItem);

  store.subscribeContext($folders)
    .map([$folders, 'wheelFolders'], $folders.wheelHighlightTab);

  store.subscribeContext($headerTabs)
    .map([$tabs, 'setWheelHighlightTab'], $headerTabs.showBookmarkMatches)
    .map([$tabs, 'tabMatches'], $headerTabs.showTabMatches)
    .map([$headerTabs, 'toggleWindowOrderHeader'], $headerTabs.toggleWindowOrder);

  store.subscribeContext($tabs)
    .map([$headerTabs, 'scrollNextWindow'], $tabs.switchTabWindow)
    .map([$headerTabs, 'scrollPrevWindow'], $tabs.switchTabWindow)
    .map([$headerTabs, 'focusCurrentTab'], $tabs.focusCurrentTab)
    .map([$headerTabs, 'minimizeAll'], $tabs.minimizeAll)
    .map([$tabs, 'windowAction'], $tabs.dispatchWindowActions)
    .map([$tabs, 'toggleWindowOrder'], $tabs.toggleWindowOrder)
    .map([$tabs, 'clickTabs'], $tabs.clickItem)
    .map([$tabs, 'mousedownTabs'], $tabs.mousedownItem)
    .map([$tabs, 'mouseupTabs'], $tabs.mouseupItem)
    .map([$tabs, 'openTabsFromHistory'], $tabs.openTabsFromHistory)
    .map([$tabs, 'activateTab'], $tabs.activateTab)
    .map([$leafs, 'mouseoverLeafs'], $tabs.mouseoverLeaf)
    .map([$leafs, 'mouseoutLeafs'], $tabs.mouseoutLeafOrRecentTabs)
    .map([$leafs, 'nextTabByWheel'], $tabs.nextTabByWheel)
    .map([$leafs, 'mouseoverMenuTabsFind'], $tabs.mouseoverMenuTabsFind)
    .map([$leafs, 'mouseoutMenuTabsFind'], $tabs.clearFocus)
    .map([$folders, 'mouseoverFolders'], $tabs.mouseoverLeaf)
    .map([$appMain, 'focusWindow'], $tabs.focusWindow)
    .map([$folders, 'mouseoutFolders'], $tabs.mouseoutLeafOrRecentTabs)
    .map([$recentTabs, 'mouseoverRecentTabs'], $tabs.mouseoverRecentTabs)
    .map([$recentTabs, 'mouseoutRecentTabs'], $tabs.mouseoutLeafOrRecentTabs);

  store.subscribeContext($history)
    .map([$appMain, 'updateWindowHeight'], $history.resetHistory);

  store.context($appMain)
    .map('changeFocusedWindow', $appMain.changeFocusedWindow)
    .map('resizeWindow', $appMain.resizeWindow)
    .map('updateBookmarks', $appMain.refreshBookmarks)
    .map('applyStyle', $appMain.applyStyle);

  store.context($tabs)
    .map('checkAllCollapsed', $tabs.checkAllCollapsed)
    .map('pinWindow', $tabs.pinWindow)
    .map('pinWindows', $tabs.pinWindows)
    .map('onCreatedWindow', $tabs.onCreatedWindow)
    .map('onRemovedWindow', $tabs.onRemovedWindow)
    .map('setCurrentWindowId', $tabs.setCurrentWindowId)
    .map('onUpdateTab', $tabs.refreshWindow)
    .map('onActivatedTab', $tabs.onActivatedTab)
    .map('addNewTab', $tabs.addNewTab)
    .map('replaceCurrentTab', $tabs.replaceCurrentTab)
    .map('addBookmarkFromTab', $tabs.addBookmarkFromTab);

  store.context($history)
    .map('clickHistory', $history.clickItem)
    .map('resetHistory', $history.resetHistory)
    .map('mousedownHistory', $history.mousedownItem)
    .map('mouseupHistory', $history.mouseupItem)
    .map('openHistories', $history.openHistories)
    .map('addBookmarksHistories', $history.addBookmarks)
    .map('openWindowFromHistory', $history.openWindowFromHistory)
    .map('updateHistory', $history.refreshHistory);

  store.subscribeContext($recentTabs)
    .map([$recentTabs, 'clickRecentTab'], $recentTabs.clickItem)
    .map([$tabs, 'onCreatedWindow'], $recentTabs.refresh)
    .map([$tabs, 'onRemovedWindow'], $recentTabs.refresh)
    .map([$tabs, 'onUpdateTab'], $recentTabs.refresh)
    .map([$tabs, 'onActivatedTab'], $recentTabs.onActivated)
    .map([$recentTabs, 'mousedownRecentTabs'], $recentTabs.mousedownItem)
    .map([$recentTabs, 'mouseupRecentTabs'], $recentTabs.mouseupItem);

  store.context($formSearch)
    .map('inputQuery', $formSearch.inputQuery)
    .map('clearQuery', $formSearch.clearQuery)
    .map('focusQuery', $formSearch.focusQuery)
    .map('search', $formSearch.reSearchAll)
    .map('re-search', $formSearch.reSearch)
    .map('setQuery', $formSearch.setQuery)
    .map('submitForm', $formSearch.submitForm)
    .map('keydownQueries', $formSearch.keydownQueries);

  store.context(dragAndDropEvents)
    .map('dragstart', dragAndDropEvents.dragstart)
    .map('drop', dragAndDropEvents.drop)
    .map('dragend', dragAndDropEvents.dragend);

  return store;
}
