import {
  OpenBookmarkType,
  Options,
} from './types';

import {
  $,
  $$,
  setEvents,
  whichClass,
  cssid,
  getParentElement,
  postMessage,
  curry,
  curry3,
  cbToResolve,
  showMenu,
  getHistoryById,
  removeUrlHistory,
  getLocal,
  setLocal,
  addChild,
  pipe,
  addListener,
  rmClass,
  addClass,
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
} from './client';

import { updateAnker } from './html';
import { resetVScrollData } from './vscroll';
import dragAndDropEvents from './drag-drop';
import { clearQuery, resetQuery } from './search';
import { setZoomSetting } from './zoom';

export default function setEventListners(options: Options) {
  const $main = $('main')!;
  const findTabsFirstOrNot = options.findTabsFirst ? findInTabsBookmark : openBookmark;
  $('.form-query')!.addEventListener('submit', (e: Event) => {
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
  $('.collapse-history-date')?.addEventListener('click', collapseHistoryDate);

  setEvents([$main], {
    click(e) {
      const $target = e.target as HTMLElement;
      if ($target.classList.contains('main-menu-button')) {
        return;
      }
      if ($target.classList.contains('leaf-menu-button')) {
        showMenu($target, '.leaf-menu');
        return;
      }
      if ($target.hasAttribute('contenteditable')) {
        return;
      }
      $('.query')!.focus();
    },
    ...dragAndDropEvents,
  });

  setEvents($$('.leaf-menu'), {
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
          addChild($('.leaf-menu'))(document.body);
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
    if ($target.classList.contains('anchor')) {
      findTabsFirstOrNot(options, $target!);
    } else if ([...$target.classList].find((className) => ['title', 'icon-fa-angle-right'].includes(className))) {
      const folder = $target.parentElement!.parentElement!;
      folder.classList.toggle('path');
    }
  })($('.leafs')!);

  $('.folders')!.addEventListener('click', (e) => {
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
        $('.title', $target)!.click();
        break;
      case 'icon-fa-angle-right':
        onClickAngle(e);
        break;
      case 'title': {
        clearQuery();
        const foldersFolder = $target.parentElement?.parentElement!;
        const folders = [foldersFolder, $(`.leafs ${cssid(foldersFolder.id)}`)];
        const isOpen = foldersFolder.classList.contains('open');
        if (isOpen) {
          folders.forEach(addClass('path'));
          return;
        }
        $leafs.scrollTop = 0;
        $$('.open').forEach(rmClass('open'));
        folders.forEach(addClass('open'));
        saveStateOpenedPath(foldersFolder);
        $$('.hilite').forEach(rmClass('hilite'));
        break;
      }
      case 'folder-menu-button': {
        showMenu($target, '.folder-menu');
        e.stopImmediatePropagation();
        break;
      }
      default:
    }
  });

  addListener('click', () => addBookmark())($('.pin-bookmark'));

  $('.main-menu-button')?.addEventListener('click', (e) => {
    e.preventDefault();
    return false;
  });

  $$('.split-h').forEach(addListener('mousedown', (e) => {
    if (document.body.classList.contains('auto-zoom')) {
      return;
    }
    const $splitter = e.target as HTMLElement;
    let subWidth = 0;
    for (
      let nextElement = $splitter.nextElementSibling as HTMLElement | null;
      nextElement != null;
      nextElement = nextElement.nextElementSibling as HTMLElement
    ) {
      if (nextElement?.previousElementSibling!.classList.contains('pane1')) {
        break;
      }
      subWidth += nextElement.offsetWidth;
    }
    setSplitterHandler(resizeSplitHandler($splitter, subWidth));
  }));

  $('.resize-x')?.addEventListener('mousedown', (e) => {
    setResizeHandler(resizeWidthHandler($('.form-query')!, document.body.offsetWidth + e.screenX));
  });

  $('.resize-y')?.addEventListener('mousedown', () => setResizeHandler(resizeHeightHandler));

  setEvents($$('.main-menu'), {
    async click(e) {
      const $menu = e.target as HTMLElement;
      switch ($menu.dataset.value) {
        case 'add-bookmark': {
          const id = $('.open')?.id;
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
          const isChecked = document.body.classList.contains('auto-zoom');
          document.body.classList.toggle('auto-zoom', !isChecked);
          getLocal('settings')
            .then(({ settings }) => setLocal({ settings: { ...settings, autoZoom: !isChecked } }));
          break;
        }
        case 'include-url':
          getLocal('settings')
            .then(({ settings }) => {
              $menu.parentElement!.classList.toggle('checked-include-url', !settings.includeUrl);
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

  setEvents($$('.folder-menu'), {
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
  const $paneTabs = $('.tabs')!;
  $paneTabs.addEventListener('click', (e) => {
    const $target = e.target as HTMLElement;
    const $parent = $target.parentElement!;
    const $window = ($target.id ? $target : $parent).parentElement!;
    const [, tabId] = ($target.id || $parent.id).split('-');
    if ($target.classList.contains('icon-x')) {
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
    if ($target.classList.contains('header-date') && document.body.classList.contains('date-collapsed')) {
      jumpHistoryDate($target.textContent!);
      return;
    }
    const $parent = $target.parentElement!;
    const $url = $target.title ? $target : $parent;
    const { url } = await getHistoryById($url.id);
    if (!url) {
      return;
    }
    if ($target.classList.contains('icon-x')) {
      setAnimationClass('hilite')($parent);
      const result = await postMessage({ type: 'cl-remove-history', payload: url });
      if (result) {
        resetVScrollData(removeUrlHistory(url));
      }
      return;
    }
    createNewTab(options, url);
  })($('.histories')!);
  const panes = [
    ...(options.zoomHistory ? [$paneHistory] : []),
    ...(options.zoomTabs ? [$paneTabs] : []),
  ];
  setEvents([...panes], { mouseenter: setZoomSetting($main, options) });
  if (!options.zoomHistory) {
    addClass('disable-zoom-history')(document.body);
  }
}
