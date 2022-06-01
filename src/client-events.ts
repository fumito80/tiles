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
  when,
  addStyle,
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
  getEndPaneMinWidth,
  openFolder,
  collapseTabsAll,
  smoothSroll,
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
  $byClass('collapse-tabs')!.addEventListener('click', () => collapseTabsAll());
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
  const $endHeaderPane = last($$byClass('pane-header'));
  const $endBodyPane = last($paneBodies);

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
  const $paneTabs = $byClass('tabs')!;
  $paneTabs.addEventListener('click', async (e) => {
    const $target = e.target as HTMLElement;
    const $parent = $target.parentElement!;
    const [type, tabId] = ($target.id || $parent.id).split('-');
    const $window = when(type === 'win').then(() => ($target.id ? $target : $parent))
      .when(!!$target.id).then($parent)
      .else($parent.parentElement!);
    const targetClasses = [
      'tab',
      'tabs-header',
      'win',
      'icon-x',
      'collapse-tab',
      'icon-list',
      'icon-grid',
      'tabs-menu-button',
    ] as const;
    const targetClass = whichClass(targetClasses, $target) || type;
    switch (targetClass) {
      case 'tabs-header':
        break;
      case 'tabs-menu-button': {
        showMenu($target, 'tabs-menu');
        e.stopImmediatePropagation();
        break;
      }
      case 'icon-list':
      case 'icon-grid': {
        const $win = $parent.parentElement!.parentElement!;
        const promiseCollapse = new Promise<TransitionEvent>((resolve) => {
          $win.addEventListener('transitionend', resolve, { once: true });
        });
        toggleClass('tabs-collapsed')($win);
        await promiseCollapse;
        const { length } = $$byClass('tabs-collapsed');
        if (length === $win.parentElement!.children.length) {
          collapseTabsAll(true);
        } else if (length === 0) {
          collapseTabsAll(false);
        }
        const $tabs = $win.parentElement!.parentElement!;
        const winBottom = $win.offsetTop + $win.offsetHeight - $tabs.offsetTop;
        const tabsBottom = $tabs.scrollTop + $tabs.offsetHeight;
        const isTopOver = $tabs.scrollTop <= ($win.offsetTop - $tabs.offsetTop);
        const isBottomUnder = tabsBottom > winBottom;
        if (isTopOver && isBottomUnder) {
          return;
        }
        const scrollTop = ($tabs.offsetHeight < $win.offsetHeight)
          ? $win.offsetTop - $tabs.offsetTop
          : $tabs.scrollTop + (winBottom - tabsBottom);
        smoothSroll($win, scrollTop);
        break;
      }
      case 'icon-x': {
        pipe(
          addListener('animationend', () => {
            chrome.tabs.remove(Number(tabId), () => {
              $parent.remove();
              if ($window.childElementCount <= 1) {
                $window.remove();
              }
            });
          }, { once: true }),
          setAnimationClass('remove-hilite'),
        )($parent);
        break;
      }
      case 'tab':
      case 'win': {
        const [, windowId] = $window.id.split('-') || [];
        if (windowId == null) {
          return;
        }
        chrome.windows.update(Number(windowId), { focused: true });
        chrome.tabs.update(Number(tabId), { active: true });
        break;
      }
      default:
    }
  });
  $paneTabs.addEventListener('mouseover', (e) => {
    const $target = e.target as HTMLElement;
    if (!hasClass($target, 'tab-wrap') || hasClass($target, 'tabs-header')) {
      return;
    }
    const $tooltip = $byClass('tooltip', $target);
    const rect = $target.getBoundingClientRect();
    const rectTT = $tooltip.getBoundingClientRect();
    const left = Math.min(rect.right, document.body.offsetWidth - rectTT.width - 5);
    addStyle('left', `${Math.max(left, 5)}px`)($tooltip);
    if (rect.bottom + rectTT.height > document.body.offsetHeight) {
      addStyle('top', `${rect.top - rectTT.height}px`)($tooltip);
      return;
    }
    addStyle('top', `${rect.bottom}px`)($tooltip);
  });
  setEvents($$byClass('tabs-menu'), {
    click(e) {
      const $target = e.target as HTMLElement;
      const $window = $target.closest('div[id]')!;
      const [, windowId] = $window.id.split('-').map(Number);
      switch ($target.dataset.value) {
        case 'add-new-tab': {
          chrome.tabs.create({ windowId });
          chrome.windows.update(windowId, { focused: true });
          break;
        }
        case 'close-window':
          chrome.windows.remove(windowId, () => {
            $byClass('components')?.append($target.parentElement!);
            $window.remove();
          });
          break;
        default:
      }
    },
    mousedown(e) {
      e.preventDefault();
    },
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
