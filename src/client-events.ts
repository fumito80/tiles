import {
  OpenBookmarkType,
  Options,
} from './types';

import {
  $,
  setEvents,
  whichClass,
  cssid,
  getParentElement,
  postMessage,
  curry,
  curry3,
  cbToResolve,
  getHistoryById,
  removeUrlHistory,
  getLocal,
  setLocal,
  addChild,
  pipe,
  addListener,
  rmClass,
  addClass,
  $byTag,
  $byClass,
  $$byClass,
  last,
  hasClass,
  toggleClass,
  $$,
} from './common';

import {
  setAnimationClass,
  createNewTab,
  getBookmark,
  openBookmark,
  addBookmark,
  onClickAngle,
  saveStateOpenedPath,
  setResizeHandler,
  setSplitterHandler,
  resizeSplitHandler,
  resizeWidthHandler,
  resizeHeightHandler,
  addFolder,
  findInTabsBookmark,
  collapseHistoryDate,
  jumpHistoryDate,
  editTitle,
  removeFolder,
  editBookmarkTitle,
  showMenu,
  switchTabWindow,
} from './client';

import { updateAnker } from './html';
import { resetVScrollData } from './vscroll';
import dragAndDropEvents from './drag-drop';
import { clearQuery, resetQuery } from './search';
import { setZoomSetting } from './zoom';

export default function setEventListners(options: Options) {
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
  $('.form-query .icon-x')?.addEventListener('click', clearQuery);
  $byClass('collapse-history-date')!.addEventListener('click', collapseHistoryDate);
  setEvents($$('.win-next, .win-prev'), { click: switchTabWindow });

  setEvents([$main], {
    click(e) {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'main-menu-button')) {
        return;
      }
      if (hasClass($target, 'leaf-menu-button')) {
        showMenu($target, 'leaf-menu');
        return;
      }
      if ($target.hasAttribute('contenteditable')) {
        return;
      }
      $byClass('query')!.focus();
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
          addChild($byClass('leaf-menu'))(document.body);
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

  $byClass('folders')!.addEventListener('click', (e) => {
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
        onClickAngle(e);
        break;
      case 'title': {
        clearQuery();
        const $foldersFolder = $target.parentElement?.parentElement!;
        const folders = [$foldersFolder, $(`.leafs ${cssid($foldersFolder.id)}`)];
        const isOpen = hasClass($foldersFolder, 'open');
        if (isOpen) {
          folders.forEach(addClass('path'));
          return;
        }
        $leafs.scrollTop = 0;
        $$byClass('open').forEach(rmClass('open'));
        folders.forEach(addClass('open'));
        saveStateOpenedPath($foldersFolder);
        $$byClass('hilite').forEach(rmClass('hilite'));
        break;
      }
      case 'folder-menu-button': {
        showMenu($target, 'folder-menu');
        e.stopImmediatePropagation();
        break;
      }
      default:
    }
  });

  addListener('click', () => addBookmark())($byClass('pin-bookmark'));

  $byClass('main-menu-button')?.addEventListener('click', (e) => {
    e.preventDefault();
    return false;
  });

  const $paneBodies = $$byClass('pane-body');
  const $paneEnd = last($paneBodies);

  $$byClass('split-h').forEach(($splitter, i) => {
    const $targetPane = $paneBodies[i];
    addListener('mousedown', () => {
      if (hasClass($main, 'auto-zoom')) {
        return;
      }
      const subWidth = document.body.offsetWidth - $paneEnd.offsetWidth - $targetPane.offsetWidth;
      setSplitterHandler(resizeSplitHandler($targetPane, $splitter, subWidth));
    })($splitter);
  });

  $byClass('resize-x')?.addEventListener('mousedown', (e) => {
    setResizeHandler(resizeWidthHandler($('.pane-body.end')!, document.body.offsetWidth + e.screenX));
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
              resetQuery(settings.includeUrl);
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
      switch ((e.target as HTMLElement).dataset.value) {
        case 'add-bookmark': {
          addBookmark($folder.id);
          break;
        }
        case 'edit': {
          const $title = $('.title > div', $folder)!;
          editTitle($title, $folder.id);
          break;
        }
        case 'add-folder': {
          addFolder($folder.id);
          break;
        }
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
  const $paneTabs = $byClass('tabs')!;
  $paneTabs.addEventListener('click', (e) => {
    const $target = e.target as HTMLElement;
    const $parent = $target.parentElement!;
    const $window = ($target.id ? $target : $parent).parentElement!;
    const [, tabId] = ($target.id || $parent.id).split('-');
    if (hasClass($target, 'icon-x')) {
      pipe(
        addListener('animationend', () => {
          chrome.tabs.remove(Number(tabId), () => {
            $parent.remove();
            if ($window.childElementCount === 0) {
              $window.remove();
            }
          });
        }, { once: true }),
        setAnimationClass('remove-hilite'),
      )($parent);
      return;
    }
    const [, windowId] = $window.id.split('-') || [];
    if (windowId == null) {
      return;
    }
    chrome.windows.update(Number(windowId), { focused: true });
    chrome.tabs.update(Number(tabId), { active: true });
  });
  const $paneHistory = addListener('click', async (e) => {
    const $target = e.target as HTMLElement;
    if (hasClass($target, 'header-date') && hasClass($main, 'date-collapsed')) {
      jumpHistoryDate($target.textContent!);
      return;
    }
    const $parent = $target.parentElement!;
    const $url = $target.title ? $target : $parent;
    const { url } = await getHistoryById($url.id);
    if (!url) {
      return;
    }
    if (hasClass($target, 'icon-x')) {
      setAnimationClass('hilite')($parent);
      const result = await postMessage({ type: 'cl-remove-history', payload: url });
      if (result) {
        resetVScrollData(removeUrlHistory(url));
      }
      return;
    }
    createNewTab(options, url);
  })($byClass('histories')!);
  const panes = [
    ...(options.zoomHistory ? [$paneHistory] : []),
    ...(options.zoomTabs ? [$paneTabs] : []),
  ];
  setEvents([...panes], { mouseenter: setZoomSetting($main, options) });
  toggleClass('disable-zoom-history', !options.zoomHistory)($main);
  toggleClass('disable-zoom-tabs', !options.zoomTabs)($main);
}
