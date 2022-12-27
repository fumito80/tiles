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
};

export function storeMapping(options: Options, {
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
}: Components) {
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
  };
  // Build store
  const store = registerActions(actions, options);

  // Dispatch actions
  store.subscribeContext()
    .map(
      [$headerLeafs, 'setIncludeUrl'],
      $appMain.setIncludeUrl.bind($appMain),
      $history.setIncludeUrl.bind($history),
    )
    .map(
      [$formSearch, 'clearSearch'],
      $leafs.clearSearch.bind($leafs),
      $headerTabs.clearSearch.bind($headerTabs),
      $tabs.clearSearch.bind($tabs),
      $history.clearSearch.bind($history),
    )
    .map(
      [$appMain, 'multiSelPanes'],
      $leafs.multiSelectLeafs.bind($leafs),
      $tabs.multiSelect.bind($tabs),
      $headerHistory.multiSelPanes.bind($headerHistory),
      $history.multiSelect.bind($history),
      $formSearch.multiSelPanes.bind($formSearch),
    )
    .map(
      [$headerHistory, 'historyCollapseDate'],
      $headerHistory.toggleCollapseIcon.bind($headerHistory),
      $history.collapseHistoryDate.bind($history),
    );

  store.subscribeContext($appMain)
    .map([$appMain, 'clickAppMain'], $appMain.clickAppMain)
    .map([$appMain, 'keydownMain'], $appMain.keydown)
    .map([$appMain, 'keyupMain'], $appMain.keyup)
    .map([$formSearch, 'searching'], $appMain.searching)
    .map([dragAndDropEvents, 'dragging'], $appMain.dragging);

  store.subscribeContext($leafs)
    .map([$leafs, 'clickLeafs'], $leafs.clickItem)
    .map([$leafs, 'mousedownLeafs'], $leafs.mousedownItem)
    .map([$leafs, 'mouseupLeafs'], $leafs.mouseupItem)
    .map([$leafs, 'wheelLeafs'], $leafs.wheelHighlightTab)
    .map([$folders, 'clickFolders'], $leafs.clickItem)
    .map([$folders, 'mousedownFolders'], $leafs.mousedownItem)
    .map([$folders, 'mouseupFolders'], $leafs.mouseupItem);

  store.subscribeContext($headerLeafs);

  store.subscribeContext($folders)
    .map([$folders, 'wheelFolders'], $folders.wheelHighlightTab);

  store.subscribeContext($headerTabs)
    .map([$headerTabs, 'collapseWindowsAll'], $headerTabs.switchCollapseIcon)
    .map([$tabs, 'setWheelHighlightTab'], $headerTabs.showBookmarkMatches)
    .map([$tabs, 'tabMatches'], $headerTabs.showTabMatches);

  store.subscribeContext($tabs)
    .map([$headerTabs, 'scrollNextWindow'], $tabs.switchTabWindow)
    .map([$headerTabs, 'scrollPrevWindow'], $tabs.switchTabWindow)
    .map([$tabs, 'clickTabs'], $tabs.clickItem)
    .map([$tabs, 'mousedownTabs'], $tabs.mousedownItem)
    .map([$tabs, 'mouseupTabs'], $tabs.mouseupItem)
    .map([$tabs, 'openTabsFromHistory'], $tabs.openTabsFromHistory)
    .map([$leafs, 'mouseoverLeafs'], $tabs.mouseoverLeaf)
    .map([$leafs, 'mouseoutLeafs'], $tabs.mouseoutLeaf)
    .map([$folders, 'mouseoverFolders'], $tabs.mouseoverLeaf)
    .map([$folders, 'mouseoutFolders'], $tabs.mouseoutLeaf)
    .map([$leafs, 'nextTabByWheel'], $tabs.nextTabByWheel)
    .map([$tabs, 'activateTab'], $tabs.activateTab)
    .map([$headerTabs, 'focusCurrentTab'], $tabs.focusCurrentTab);

  store.subscribeContext($headerHistory);

  store.subscribeContext($history)
    .map([$history, 'clickHistory'], $history.clickItem)
    .map([$history, 'resetHistory'], $history.resetHistory)
    .map([$history, 'mousedownHistory'], $history.mousedownItem)
    .map([$history, 'mouseupHistory'], $history.mouseupItem)
    .map([$history, 'openHistories'], $history.openHistories)
    .map([$history, 'addBookmarksHistories'], $history.addBookmarks)
    .map([$history, 'openWindowFromHistory'], $history.openWindowFromHistory);

  store.subscribeContext($formSearch)
    .map([$formSearch, 'inputQuery'], $formSearch.inputQuery)
    .map([$formSearch, 'changeIncludeUrl'], $formSearch.resetQuery)
    .map([$formSearch, 'clearQuery'], $formSearch.clearQuery)
    .map([$formSearch, 'focusQuery'], $formSearch.focusQuery)
    .map([$formSearch, 'search'], $formSearch.reSearchAll)
    .map([$formSearch, 're-search'], $formSearch.reSearch)
    .map([$formSearch, 'setQuery'], $formSearch.setQuery)
    .map([$formSearch, 'keydownQueries'], $formSearch.keydownQueries);

  store.subscribeContext(dragAndDropEvents)
    .map([dragAndDropEvents, 'dragstart'], dragAndDropEvents.dragstart)
    .map([dragAndDropEvents, 'drop'], dragAndDropEvents.drop)
    .map([dragAndDropEvents, 'dragend'], dragAndDropEvents.dragend);

  return store;
}
