import {
  splitterClasses,
  OpenBookmarkType,
  Options,
} from './types';

import {
  $,
  $$,
  whichClass,
  cssid,
  curry,
  cbToResolve,
  getCurrentTab,
  getLocal,
  setLocal,
  setSplitWidth,
  getGridTemplateColumns,
  extractDomain,
  getLocaleDate,
  htmlEscape,
  curry3,
  pipe,
  rmClass,
  addClass,
  addStyle,
  addListener,
  addChild,
  addAttr,
  insertHTML,
  setText,
  rmAttr,
  rmStyle,
} from './common';

import {
  rowSetterHistory,
  setVScroll,
  resetHistory,
  getVScrollData,
  setScrollTop,
} from './vscroll';

import { getReFilter } from './search';
import { makeLeaf, makeNode, updateAnker } from './html';

export function setAnimationClass(className: 'hilite' | 'remove-hilite') {
  return pipe(
    rmClass(className),
    (el) => {
      // eslint-disable-next-line no-void
      void (el as HTMLElement).offsetWidth;
      return el;
    },
    addClass(className),
  );
}

export async function createNewTab(options: Options, url: string) {
  const { windowId, ...rest } = await getCurrentTab();
  const index = (() => {
    switch (options.newTabPosition) {
      case 'le': return 0;
      case 'rs': return rest.index + 1;
      case 'ls': return rest.index;
      default: return undefined;
    }
  })();
  chrome.tabs.create({ index, url, windowId });
}

export function getBookmark(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.get(id, ([treeNode]) => resolve(treeNode));
  });
}

export async function openBookmark(
  options: Options,
  target: EventTarget | HTMLElement,
  openType: keyof typeof OpenBookmarkType = OpenBookmarkType.tab,
) {
  const { id } = (target as HTMLAnchorElement).parentElement!;
  const { url } = await getBookmark(id);
  switch (openType) {
    case OpenBookmarkType.tab: {
      createNewTab(options, url!);
      break;
    }
    case OpenBookmarkType.window: {
      chrome.windows.create({ url });
      break;
    }
    case OpenBookmarkType.incognito: {
      chrome.windows.create({ url, incognito: true });
      break;
    }
    default:
  }
}

export function setHasChildren($target: HTMLElement) {
  $target.setAttribute('data-children', String($target.children.length - 1));
}

export function onClickAngle(e: MouseEvent) {
  const target = e.target as HTMLAnchorElement;
  const folder = target.parentElement?.parentElement!;
  if ($('.open', folder)) {
    (target.nextElementSibling as HTMLDivElement)?.click();
  }
  folder.classList.toggle('path');
}

export function saveStateOpenedPath(foldersFolder: HTMLElement) {
  $$('.path').forEach((el) => el.classList.remove('path'));
  let paths: Array<string> = [];
  for (let folder = foldersFolder as HTMLElement | null; folder && folder.classList.contains('folder'); folder = folder.parentElement) {
    folder.classList.add('path');
    paths = [...paths, folder.id];
  }
  const clientState = {
    paths,
    open: foldersFolder.id,
  };
  setLocal({ clientState });
}

export function setMouseEventListener(mouseMoveHandler: (e: MouseEvent) => void) {
  const mouseMoveHandlerWrapper = (e: MouseEvent) => {
    e.preventDefault();
    mouseMoveHandler(e);
  };
  document.addEventListener('mousemove', mouseMoveHandlerWrapper, false);
  document.addEventListener('mouseup', async () => {
    document.removeEventListener('mousemove', mouseMoveHandlerWrapper);
    const { pane3, pane2, pane1 } = getGridTemplateColumns();
    const saved = await getLocal('settings');
    const settings = {
      ...saved.settings,
      paneWidth: {
        pane3,
        pane2,
        pane1,
      },
      width: document.body.offsetWidth,
      height: document.body.offsetHeight,
    };
    setLocal({ settings });
  }, { once: true });
}

export function resizeSplitHandler($splitter: HTMLElement, subWidth: number) {
  return (e: MouseEvent) => {
    const className = whichClass(splitterClasses, $splitter)!;
    const $targetPane = $splitter.previousElementSibling as HTMLElement;
    const width = Math.max(e.clientX - $targetPane.offsetLeft, 100);
    if (document.body.offsetWidth - ($targetPane.offsetLeft + width + subWidth) < 120) {
      return;
    }
    setSplitWidth({ [className]: width });
  };
}

export function resizeWidthHandler($ref: HTMLElement, startWidth: number) {
  return (e: MouseEvent) => {
    const width = Math.min(startWidth - e.screenX, 800);
    if (width - $ref.offsetLeft < 100) {
      return;
    }
    addStyle('width', `${width}px`)(document.body);
  };
}

let timerResizeY: ReturnType<typeof setTimeout>;

export function resizeHeightHandler(e: MouseEvent) {
  const height = Math.min(e.clientY - 6, 570);
  if (height < 200) {
    return;
  }
  clearTimeout(timerResizeY);
  timerResizeY = setTimeout(() => {
    getLocal('vscrollProps')
      .then(({ vscrollProps }) => {
        const $paneHistory = $('.pane-history') as HTMLDivElement;
        const vScrollData = getVScrollData();
        setVScroll($paneHistory, rowSetterHistory, vScrollData, vscrollProps);
      });
  }, 500);
  addStyle('height', `${height}px`)(document.body);
}

export function setAnimationFolder(className: string) {
  return (el: Element | null = null) => {
    if (!el) {
      return el;
    }
    return pipe(
      addListener('animationend', () => rmClass(className)(el), { once: true }),
      addClass(className),
    )(el);
  };
}

export async function findInTabsBookmark(options: Options, $anchor: HTMLElement) {
  const { id } = $anchor.parentElement!;
  const { url = '' } = await getBookmark(id);
  const finder = options.findTabsMatches === 'prefix'
    ? (tab: chrome.tabs.Tab) => !!tab.url?.startsWith(url)
    : (tab: chrome.tabs.Tab) => extractDomain(tab.url) === extractDomain(url);
  const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      chrome.windows.getCurrent((win) => {
        const findIndex = tabs.findIndex((t) => t.active && t.windowId === win.id);
        const sorted = [
          ...tabs.slice(0, findIndex),
          ...tabs.slice(findIndex + 1),
          tabs[findIndex],
        ];
        const firstTab = sorted.find(finder);
        resolve(firstTab);
      });
    });
  });
  if (tab?.id == null) {
    openBookmark(options, $anchor);
    return;
  }
  chrome.windows.update(tab.windowId, { focused: true });
  chrome.tabs.update(tab.id, { active: true });
}

async function restoreHistory(includeUrl: boolean) {
  const value = ($('.query') as HTMLInputElement).value.trim();
  const reFilter = getReFilter(value);
  return resetHistory({ reFilter, includeUrl });
}

export async function collapseHistoryDate() {
  const { vscrollProps, settings: { includeUrl } } = await getLocal('vscrollProps', 'settings');
  if (document.body.classList.contains('date-collapsed')) {
    restoreHistory(includeUrl);
    return;
  }
  addClass('date-collapsed')(document.body);
  const histories = getVScrollData();
  const data = histories.filter((item) => item.headerDate);
  const $paneHistory = $('.pane-history') as HTMLDivElement;
  setVScroll($paneHistory, rowSetterHistory, data, vscrollProps);
  setScrollTop(0);
}

export async function jumpHistoryDate(localeDate: string) {
  const { vscrollProps, settings: { includeUrl } } = await getLocal('vscrollProps', 'settings');
  await restoreHistory(includeUrl);
  const histories = getVScrollData();
  const index = histories.findIndex(
    (item) => item.headerDate && getLocaleDate(item.lastVisitTime) === localeDate,
  );
  setScrollTop(vscrollProps.rowHeight * index);
}

export async function removeFolder($folder: HTMLElement) {
  await cbToResolve(curry(chrome.bookmarks.removeTree)($folder.id));
  addChild($('.folder-menu'))(document.body);
  pipe(
    addListener('animationend', () => {
      const $parent = $folder.parentElement!;
      $folder.remove();
      setHasChildren($parent);
      $('.title', $parent)!.click();
    }, { once: true }),
    rmClass('hilite'),
    setAnimationFolder('remove-hilite'),
  )($('.marker', $folder));
}

export async function editTitle($title: HTMLElement, folderId: string, newFolder = false) {
  addStyle('text-overflow', 'unset')($title);
  const currentTitle = $title.textContent!;
  pipe(
    addAttr('contenteditable', 'true'),
    addAttr('data-current-title', htmlEscape(currentTitle!)),
  )($title);
  return new Promise<string | null>((resolve) => {
    setTimeout(() => {
      $title.focus();
      if (newFolder) {
        setText('')($title);
      } else {
        document.execCommand('selectAll', false);
      }
      $title.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          $title.blur();
          ev.preventDefault();
        } else if (ev.key === 'Escape') {
          setText(currentTitle)($title);
        }
      });
      $title.addEventListener('blur', async () => {
        rmAttr('contenteditable')($title);
        $('.query')!.focus();
        // eslint-disable-next-line no-param-reassign
        $title.scrollLeft = 0;
        const title = $title.textContent?.trim();
        rmStyle('text-overflow')($title);
        if (!title || title.trim() === '') {
          setText(currentTitle)($title);
          return resolve(null);
        }
        if (title === currentTitle) {
          return resolve(null);
        }
        await cbToResolve(curry3(chrome.bookmarks.update)(folderId)({ title }));
        setAnimationFolder('hilite')($title.parentElement?.parentElement);
        return resolve(title);
      }, { once: true });
    }, 0);
  });
}

export async function editBookmarkTitle($leaf: HTMLElement) {
  const $title = $leaf.firstElementChild as HTMLElement;
  const title = await editTitle($title, $leaf.id).catch(() => null);
  if (!title) {
    return;
  }
  const { url = '' } = await getBookmark($leaf.id);
  updateAnker($leaf.id, { url, title });
  setAnimationClass('hilite')($leaf);
}

export async function addBookmark(parentId = '1', paramsIn: chrome.bookmarks.BookmarkCreateArg | null = null) {
  const { title, url } = paramsIn ?? await getCurrentTab();
  const index = paramsIn?.index ?? (parentId === '1' ? 0 : undefined);
  const params = {
    title: title!, url: url!, parentId, index,
  };
  const { id } = await cbToResolve(curry(chrome.bookmarks.create)(params));
  const htmlAnchor = makeLeaf({ id, ...params });
  if (parentId === '1') {
    insertHTML('beforebegin', htmlAnchor)($('.folders')!.children[index!]);
  } else {
    if (parentId !== $('.open')?.id) {
      $$('.open').forEach(rmClass('open'));
      $$(cssid(parentId)).forEach(addClass('open'));
    }
    const $targetFolder = $(`.leafs ${cssid(parentId)}`) || $(`.folders ${cssid(parentId)}`)!;
    if (index == null) {
      insertHTML('beforeend', htmlAnchor)($targetFolder);
    } else {
      insertHTML('afterend', htmlAnchor)($targetFolder.children[index]);
    }
  }
  const $target = $(`.folders ${cssid(id)}, .leafs ${cssid(id)}`)!;
  if ($target) {
    ($target as any).scrollIntoViewIfNeeded();
    setAnimationClass('hilite')($target);
    editBookmarkTitle($target);
  }
}

export function showModalInput(desc: string) {
  const $modal = $('.modal')!;
  addClass('show-modal')(document.body);
  setText(desc)($('.popup-desc', $modal));
  return $<HTMLInputElement>('input', $modal)!.value;
}

export async function addFolder(parentId = '1') {
  const index = (parentId === '1') ? 0 : undefined;
  const params = {
    title: 'Enter title', parentId, index,
  };
  const { id } = await cbToResolve(curry(chrome.bookmarks.create)(params));
  const htmlNode = makeNode({
    id, children: '', length: 0, ...params,
  });
  if (parentId === '1') {
    $('.folders')!.insertAdjacentHTML('afterbegin', htmlNode);
    $(`.leafs ${cssid(1)}`)!.insertAdjacentHTML('afterbegin', htmlNode);
  } else {
    $$(cssid(parentId)).forEach(($targetFolder) => {
      const $title = pipe(
        insertHTML('beforeend', htmlNode),
        addAttr('data-children', String($targetFolder.children.length)),
        curry($)(':scope > .marker > .title'),
      )($targetFolder);
      if ($title) {
        $title.click();
        ($targetFolder as any).scrollIntoViewIfNeeded();
      }
    });
  }
  const $target = $(`.folders ${cssid(id)} > .marker > .title`)!;
  setAnimationFolder('hilite')($target.parentElement);
  const title = await editTitle($target.firstElementChild as HTMLElement, id, true);
  if (!title) {
    removeFolder($target.parentElement!.parentElement!);
  }
}
