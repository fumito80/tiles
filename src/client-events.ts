import {
  OpenBookmarkType,
  Options,
} from './types';

import {
  setEvents,
  whichClass,
  cssid,
  getParentElement,
  curry,
  curry3,
  cbToResolve,
  getLocal,
  setLocal,
  pipe,
  addListener,
  last,
} from './common';

import {
  setAnimationClass,
  $,
  addChild,
  rmClass,
  $byTag,
  $byClass,
  $$byClass,
  hasClass,
  toggleClass,
  addStyle,
  createNewTab,
  getBookmark,
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
  editBookmarkTitle,
  showMenu,
  getEndPaneMinWidth,
  openFolder,
  saveStateAllPaths,
  updateAnker,
  selectFolder,
} from './client';

import { resetVScrollData } from './vscroll';
import dragAndDropEvents from './drag-drop';
import { setZoomSetting } from './zoom';
import { Store } from './store';

export default function setEventListners(store: Store, options: Options) {
  const $main = $byTag('main')!;
  const findTabsFirstOrNot = options.findTabsFirst ? findInTabsBookmark : openBookmark;
  $byClass('form-query')!.addEventListener('submit', (e: Event) => {
    e.preventDefault();
    if (options.enableExternalUrl && options.externalUrl) {
      const $inputQuery = (e.target as HTMLFormElement).query;
      const value = $inputQuery.value.trim();
      if (value.length <= 1) {
        return false;
      }
      const url = options.externalUrl + encodeURIComponent(value);
      createNewTab(options, url);
    }
    return false;
  });
  $('.form-query .icon-x')?.addEventListener('click', () => {
    store.dispatch('clearQuery', true, true);
  });

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

  setEvents($$byClass('leaf-menu'), {
    async click(e) {
      const $leaf = (e.target as HTMLElement).parentElement!.previousElementSibling!.parentElement!;
      const $anchor = $leaf!.firstElementChild as HTMLAnchorElement;
      switch ((e.target as HTMLElement).dataset.value) {
        case 'find-in-tabs': {
          findInTabsBookmark(options, $anchor);
          break;
        }
        case 'open-new-tab':
          openBookmark(options, $anchor);
          break;
        case 'open-new-window':
          openBookmark(options, $anchor, OpenBookmarkType.window);
          break;
        case 'open-incognito':
          openBookmark(options, $anchor, OpenBookmarkType.incognito);
          break;
        case 'edit-title': {
          editBookmarkTitle($leaf);
          break;
        }
        case 'edit-url': {
          const { url = '', title } = await getBookmark($leaf.id);
          // eslint-disable-next-line no-alert
          const value = prompt(`[Edit URL]\n${title}`, url);
          if (value == null) {
            break;
          }
          await cbToResolve(curry3(chrome.bookmarks.update)($leaf.id)({ url: value }));
          updateAnker($leaf.id, { title, url: value });
          setAnimationClass('hilite')($leaf);
          break;
        }
        case 'remove': {
          await cbToResolve(curry(chrome.bookmarks.remove)($leaf.id));
          addChild($byClass('leaf-menu'))($byClass('components'));
          pipe(
            addListener('animationend', () => $leaf.remove(), { once: true }),
            rmClass('hilite'),
            setAnimationClass('remove-hilite'),
          )($leaf);
          break;
        }
        case 'show-in-folder': {
          const id = $leaf.parentElement?.id;
          const $target = $(`.folders ${cssid(id!)} > .marker > .title`);
          if (!$target) {
            break;
          }
          $target.click();
          $target.focus();
          ($leaf.firstElementChild as HTMLAnchorElement).focus();
          ($leaf as any).scrollIntoViewIfNeeded();
          setAnimationClass('hilite')($leaf);
          break;
        }
        default:
      }
      ($anchor.nextElementSibling as HTMLElement).blur();
    },
    mousedown(e) {
      e.preventDefault();
    },
  });

  const $leafs = addListener('click', (e) => {
    const $target = e.target as HTMLDivElement;
    if ($target.hasAttribute('contenteditable')) {
      return;
    }
    if (hasClass($target, 'anchor')) {
      findTabsFirstOrNot(options, $target!);
    } else if (hasClass($target, 'title', 'icon-fa-angle-right')) {
      toggleClass('path')($target.parentElement?.parentElement);
    }
  })($byClass('leafs')!);

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
          store.dispatch('clearQuery', null, true);
          selectFolder($target, $leafs, options.exclusiveOpenBmFolderTree);
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

  addListener('click', () => addBookmark())($byClass('pin-bookmark'));

  $byClass('main-menu-button')?.addEventListener('click', (e) => {
    e.preventDefault();
    return false;
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

  setEvents($$byClass('main-menu'), {
    async click(e) {
      const $menu = e.target as HTMLElement;
      switch ($menu.dataset.value) {
        case 'add-bookmark': {
          const id = $byClass('open')?.id;
          addBookmark(id || '1');
          break;
        }
        case 'add-folder':
          addFolder();
          break;
        case 'settings':
          chrome.runtime.openOptionsPage();
          break;
        case 'auto-zoom': {
          const isChecked = hasClass($main, 'auto-zoom');
          toggleClass('auto-zoom', !isChecked)($main);
          getLocal('settings')
            .then(({ settings }) => setLocal({ settings: { ...settings, autoZoom: !isChecked } }));
          break;
        }
        case 'include-url':
          getLocal('settings')
            .then(({ settings }) => {
              toggleClass('checked-include-url', !settings.includeUrl)($main);
              return setLocal({ settings: { ...settings, includeUrl: !settings.includeUrl } });
            })
            .then(({ settings }) => {
              store.dispatch('changeIncludeUrl', settings.includeUrl, true);
              resetVScrollData((data) => data);
            });
          break;
        default:
      }
    },
    mousedown(e) {
      e.preventDefault();
    },
  });

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
