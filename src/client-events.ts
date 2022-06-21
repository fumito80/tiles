import { Options } from './types';

import {
  setEvents,
  whichClass,
  getParentElement,
  addListener,
  last,
} from './common';

import {
  $,
  $byTag,
  $byClass,
  $$byClass,
  hasClass,
  toggleClass,
  addStyle,
  openBookmark,
  addBookmark,
  onClickAngle,
  setResizeHandler,
  setSplitterHandler,
  resizeSplitHandler,
  resizeWidthHandler,
  resizeHeightHandler,
  addFolder,
  findInTabsBookmark,
  editTitle,
  removeFolder,
  showMenu,
  getEndPaneMinWidth,
  openFolder,
  saveStateAllPaths,
  selectFolder,
} from './client';

import dragAndDropEvents from './drag-drop';
import { setZoomSetting } from './zoom';
import { Store } from './store';

export default function setEventListners(store: Store, options: Options) {
  const $main = $byTag('main')!;
  const findTabsFirstOrNot = options.findTabsFirst ? findInTabsBookmark : openBookmark;
  const $leafMenu = $byClass('leaf-menu');
  setEvents([$main], {
    click(e) {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'main-menu-button')) {
        return;
      }
      if (hasClass($target, 'leaf-menu-button')) {
        showMenu('leaf-menu')(e);
        return;
      }
      if ($target.hasAttribute('contenteditable')) {
        return;
      }
      $byClass('query')!.focus();
    },
    mousedown(e) {
      if (hasClass(e.target as HTMLElement, 'leaf-menu-button')) {
        addStyle({ top: '-1000px' })($leafMenu);
      }
    },
    ...dragAndDropEvents,
  });

  const $foldersMenu = $byClass('folder-menu');
  setEvents([$byClass('folders')], {
    mousedown(e) {
      if (hasClass(e.target as HTMLElement, 'folder-menu-button')) {
        addStyle({ top: '-1000px' })($foldersMenu);
      }
    },
    click(e) {
      const $target = e.target as HTMLDivElement;
      const targetClasses = [
        'anchor',
        'marker',
        'title',
        'folder-menu-button',
        'icon-fa-angle-right',
      ] as const;
      const targetClass = whichClass(targetClasses, $target);
      switch (targetClass) {
        case 'anchor':
          if ($target.hasAttribute('contenteditable')) {
            return;
          }
          findTabsFirstOrNot(options, $target!);
          break;
        case 'marker':
          $byClass('title', $target)!.click();
          break;
        case 'icon-fa-angle-right':
          onClickAngle($target);
          if (!options.exclusiveOpenBmFolderTree) {
            saveStateAllPaths();
          }
          break;
        case 'title': {
          store.dispatch('clearQuery');
          selectFolder($target, $byClass('leafs'), options.exclusiveOpenBmFolderTree);
          break;
        }
        case 'folder-menu-button': {
          showMenu('folder-menu')(e);
          break;
        }
        default:
      }
    },
  });

  const $paneBodies = $$byClass('pane-body');
  const $endHeaderPane = last($$byClass('pane-header'))!;
  const $endBodyPane = last($paneBodies)!;

  $$byClass('split-h').forEach(($splitter, i) => {
    const $targetPane = $paneBodies[i];
    addListener('mousedown', (e: MouseEvent) => {
      if (hasClass($main, 'auto-zoom')) {
        return;
      }
      const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
      const subWidth = $paneBodies
        .filter((el) => el !== $targetPane && !hasClass(el, 'end'))
        .reduce((acc, el) => acc + el.offsetWidth, endPaneMinWidth);
      const adjustMouseX = e.clientX - $splitter.offsetLeft;
      const handler = resizeSplitHandler($targetPane, $splitter, subWidth + 16, adjustMouseX);
      setSplitterHandler(handler);
    })($splitter);
  });

  $byClass('resize-x')?.addEventListener('mousedown', (e) => {
    const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
    setResizeHandler(resizeWidthHandler(
      $endBodyPane,
      document.body.offsetWidth + e.screenX,
      endPaneMinWidth,
    ));
  });

  $byClass('resize-y')?.addEventListener('mousedown', () => setResizeHandler(resizeHeightHandler));

  setEvents($$byClass('folder-menu'), {
    async click(e) {
      const $folder = getParentElement(e.target as HTMLElement, 4)!;
      const { value } = (e.target as HTMLElement).dataset;
      switch (value) {
        case 'add-bookmark': {
          addBookmark($folder.id);
          break;
        }
        case 'add-folder': {
          addFolder($folder.id);
          break;
        }
        case 'edit': {
          const $title = $('.title > div', $folder)!;
          editTitle($title, $folder.id);
          break;
        }
        case 'open-all':
        case 'open-all-incognito':
          openFolder($folder.id, value === 'open-all-incognito');
          break;
        case 'remove': {
          removeFolder($folder);
          break;
        }
        default:
      }
    },
    mousedown(e) {
      e.preventDefault();
    },
  });

  const panes = [
    ...(options.zoomHistory ? [$byClass('histories')] : []),
    ...(options.zoomTabs ? [$byClass('tabs')] : []),
  ];
  setEvents([...panes], { mouseenter: setZoomSetting($main, options) });
  toggleClass('disable-zoom-history', !options.zoomHistory)($main);
  toggleClass('disable-zoom-tabs', !options.zoomTabs)($main);
}
