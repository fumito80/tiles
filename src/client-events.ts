import {
  OpenBookmarkType,
  EditBookmarkType,
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
} from './common';

import {
  setAnimationClass,
  createNewTab,
  getBookmark,
  openBookmark,
  addBookmark,
  setHasChildren,
  onClickAngle,
  clearQuery,
  saveStateOpenedPath,
  setMouseEventListener,
  resizeSplitHandler,
  resizeWidthHandler,
  resizeHeightHandler,
  setAnimationFolder,
  addFolder,
  findInTabsBookmark,
  setZoomSetting,
  showCalendar,
  junpHistoryDate,
} from './client';

import { updateAnker } from './html';
import { resetVScrollData } from './vscroll';
import dragAndDropEvents from './drag-drop';
import search from './client-search';

export default function setEventListners(options: Options) {
  const $main = $('main')!;
  const findTabsFirstOrNot = options.findTabsFirst ? findInTabsBookmark : openBookmark;
  $('.query')!.addEventListener('input', search(options));
  $('.form-query')!.addEventListener('submit', (e: Event) => {
    search(options)(e);
    e.preventDefault();
  });
  $('.form-query .icon-x')?.addEventListener('click', clearQuery);
  $('.show-calendar')?.addEventListener('click', showCalendar(options));

  setEvents([document.body], {
    click(e) {
      const $target = e.target as HTMLElement;
      if ($target.classList.contains('main-menu-button')) {
        return;
      }
      if ($target.classList.contains('leaf-menu-button')) {
        showMenu($target, '.leaf-menu');
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
          const title = $anchor.textContent;
          // eslint-disable-next-line no-alert
          const value = prompt('Edit title', title!);
          if (value == null) {
            break;
          }
          const { url = '' } = await getBookmark($leaf.id);
          const changes = { [EditBookmarkType.title]: value };
          await cbToResolve(curry3(chrome.bookmarks.update)($leaf.id)(changes));
          updateAnker($leaf.id, { url, title: value });
          setAnimationClass($leaf, 'hilite');
          break;
        }
        case 'edit-url': {
          const { url = '', title } = await getBookmark($leaf.id);
          // eslint-disable-next-line no-alert
          const value = prompt('Edit url', url);
          if (value == null) {
            break;
          }
          await cbToResolve(curry3(chrome.bookmarks.update)($leaf.id)({ url: value }));
          updateAnker($leaf.id, { title, url: value });
          setAnimationClass($leaf, 'hilite');
          break;
        }
        case 'remove': {
          await cbToResolve(curry(chrome.bookmarks.remove)($leaf.id));
          document.body.appendChild($('.leaf-menu')!);
          $leaf.addEventListener('animationend', () => $leaf.remove(), { once: true });
          $leaf.classList.remove('hilite');
          setAnimationClass($leaf, 'remove-hilite');
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
          setAnimationClass($leaf, 'hilite');
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
          folders.forEach((el) => el?.classList.add('path'));
          return false;
        }
        $$('.open').forEach((el) => el.classList.remove('open'));
        folders.forEach((el) => el?.classList.add('open'));
        saveStateOpenedPath(foldersFolder);
        $$('.hilite').map((el) => el.classList.remove('hilite'));
        break;
      }
      case 'folder-menu-button': {
        showMenu($target, '.folder-menu');
        e.stopImmediatePropagation();
        break;
      }
      default:
    }
    return false;
  });

  const $leafs = $('.leafs')!;
  $leafs.addEventListener('click', (e) => {
    const $target = e.target as HTMLDivElement;
    if ($target.classList.contains('anchor')) {
      findTabsFirstOrNot(options, $target!);
    } else if ([...$target.classList].find((className) => ['title', 'icon-fa-angle-right'].includes(className))) {
      const folder = $target.parentElement?.parentElement!;
      folder.classList.toggle('path');
    }
  });

  $('.pin-bookmark')?.addEventListener('click', () => {
    addBookmark();
  });

  $('.main-menu-button')?.addEventListener('click', (e) => {
    e.preventDefault();
    return false;
  });

  $$('.split-h').forEach((el) => el.addEventListener('mousedown', (e) => {
    if (document.body.classList.contains('.auto-zoom')) {
      return;
    }
    const $splitter = e.target as HTMLElement;
    let subWidth = 0;
    let nextElement = $splitter.nextElementSibling as HTMLElement;
    while (nextElement) {
      if (nextElement?.classList.contains('form-query')) {
        break;
      }
      subWidth += nextElement.offsetWidth;
      nextElement = nextElement.nextElementSibling as HTMLElement;
    }
    setMouseEventListener(resizeSplitHandler($splitter, subWidth));
  }));

  $('.resize-x')?.addEventListener('mousedown', (e) => {
    setMouseEventListener(resizeWidthHandler($('.form-query')!, document.body.offsetWidth + e.screenX));
  });

  $('.resize-y')?.addEventListener('mousedown', () => setMouseEventListener(resizeHeightHandler));

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
          const $title = $('.title > span', $folder)!;
          // eslint-disable-next-line no-alert
          const title = prompt('Edit folder name', $title.textContent as string);
          if (title == null) {
            break;
          }
          await cbToResolve(curry3(chrome.bookmarks.update)($folder.id)({ title }));
          $title.textContent = title;
          setAnimationFolder($title.parentElement?.parentElement, 'hilite');
          break;
        }
        case 'add-folder': {
          addFolder($folder.id);
          break;
        }
        case 'remove': {
          await cbToResolve(curry(chrome.bookmarks.removeTree)($folder.id));
          document.body.appendChild($('.folder-menu')!);
          const $marker = $('.marker', $folder)!;
          $marker.addEventListener('animationend', () => {
            const $parent = $folder.parentElement!;
            $folder.remove();
            setHasChildren($parent);
            $('.title', $parent)!.click();
          }, { once: true });
          $marker.classList.remove('hilite');
          setAnimationFolder($marker, 'remove-hilite');
          break;
        }
        default:
      }
    },
    mousedown(e) {
      e.preventDefault();
    },
  });
  const $paneTabs = $('.pane-tabs')!;
  $paneTabs.addEventListener('click', (e) => {
    const $target = e.target as HTMLElement;
    const $parent = $target.parentElement!;
    const $window = ($target.id ? $target : $parent).parentElement!;
    const [, tabId] = ($target.id || $parent.id).split('-');
    if ($target.classList.contains('icon-x')) {
      $parent.addEventListener('animationend', () => {
        chrome.tabs.remove(Number(tabId), () => {
          $parent.remove();
          if ($window.childElementCount === 0) {
            $window.remove();
          }
        });
      }, { once: true });
      setAnimationClass($parent, 'remove-hilite');
      return;
    }
    const [, windowId] = $window.id.split('-') || [];
    if (windowId == null) {
      return;
    }
    chrome.windows.update(Number(windowId), { focused: true });
    chrome.tabs.update(Number(tabId), { active: true });
  });
  const $paneHistory = $('.pane-history')!;
  $paneHistory.addEventListener('click', async (e) => {
    const $target = e.target as HTMLElement;
    if ($target.classList.contains('header-date') && document.body.classList.contains('date-collapsed')) {
      junpHistoryDate($target.textContent!, options);
      return;
    }
    const $parent = $target.parentElement!;
    const $url = $target.title ? $target : $parent;
    const { url } = await getHistoryById($url.id);
    if (!url) {
      return;
    }
    if ($target.classList.contains('icon-x')) {
      setAnimationClass($parent, 'hilite');
      const result = await postMessage({ type: 'cl-remove-history', payload: url });
      if (result) {
        resetVScrollData(removeUrlHistory(url));
      }
      return;
    }
    createNewTab(options, url);
  });
  const panes = [
    ...(options.zoomHistory ? [$paneHistory] : []),
    ...(options.zoomTabs ? [$paneTabs] : []),
  ];
  setEvents([...panes], { mouseenter: setZoomSetting($main, options) });
  if (!options.zoomHistory) {
    document.body.classList.add('disable-zoom-history');
  }
}
