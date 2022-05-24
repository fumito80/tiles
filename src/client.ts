import {
  splitterClasses,
  OpenBookmarkType,
  Options,
  State,
  Settings,
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
  $byClass,
  $$byClass,
  $byTag,
  hasClass,
  toggleClass,
  decode,
  pick,
  getNewPaneWidth,
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
      // el?.addEventListener('animationend', () => rmClass('hilite')(el), { once: true });
      return el;
    },
    addClass(className),
  );
}

export async function createNewTab(options: Options, url: string) {
  const { windowId, ...rest } = await getCurrentTab();
  const index = decode(
    options.newTabPosition,
    ['le', 0],
    ['rs', rest.index + 1],
    ['ls', rest.index],
  );
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
  const $target = e.target as HTMLAnchorElement;
  const $folder = $target.parentElement?.parentElement!;
  if ($byClass('open', $folder)) {
    ($target.nextElementSibling as HTMLDivElement)?.click();
  }
  toggleClass('path')($folder);
}

export function saveStateOpenedPath(foldersFolder: HTMLElement) {
  $$byClass('path').forEach(rmClass('path'));
  let paths: Array<string> = [];
  for (let $folder = foldersFolder as HTMLElement | null; $folder && hasClass($folder, 'folder'); $folder = $folder.parentElement) {
    addClass('path')($folder);
    paths = [...paths, $folder.id];
  }
  const clientState = {
    paths,
    open: foldersFolder.id,
  };
  setLocal({ clientState });
}

function setMouseEventListener(
  mouseMoveHandler: (e: MouseEvent) => void,
  getSettings: (state: Pick<State, 'settings'>) => Settings,
) {
  const mouseMoveHandlerWrapper = (e: MouseEvent) => {
    e.preventDefault();
    mouseMoveHandler(e);
  };
  document.addEventListener('mousemove', mouseMoveHandlerWrapper, false);
  document.addEventListener('mouseup', async () => {
    document.removeEventListener('mousemove', mouseMoveHandlerWrapper);
    const saved = await getLocal('settings');
    const settings = getSettings(saved);
    setLocal({ settings });
  }, { once: true });
}

function getNewSize({ settings }: Pick<State, 'settings'>) {
  return {
    ...settings,
    width: document.body.offsetWidth,
    height: document.body.offsetHeight,
  };
}

export function setResizeHandler(mouseMoveHandler: (e: MouseEvent) => void) {
  setMouseEventListener(mouseMoveHandler, getNewSize);
}

export function setSplitterHandler(mouseMoveHandler: (e: MouseEvent) => void) {
  setMouseEventListener(mouseMoveHandler, getNewPaneWidth);
}

export function resizeSplitHandler(
  $targetPane: HTMLElement,
  $splitter: HTMLElement,
  subWidth: number,
  adjustMouseX: number,
) {
  return (e: MouseEvent) => {
    const className = whichClass(splitterClasses, $splitter)!;
    const width = Math.max(e.clientX - adjustMouseX - $targetPane.offsetLeft, 100);
    if (document.body.offsetWidth < (width + subWidth)) {
      return;
    }
    setSplitWidth({ [className]: width });
  };
}

export function resizeWidthHandler($ref: HTMLElement, startWidth: number, endPaneMinWidth: number) {
  return (e: MouseEvent) => {
    const width = Math.min(startWidth - e.screenX, 800);
    if (width - $ref.offsetLeft < endPaneMinWidth) {
      return;
    }
    addStyle('width', `${width}px`)(document.body);
  };
}

export function getEndPaneMinWidth($endPane: HTMLElement) {
  const queryWrapMinWidth = 65;
  const minWidth = [...$endPane.children]
    .filter((el) => !hasClass(el, 'query-wrap'))
    .map((el) => getComputedStyle(el))
    .map(pick('width', 'marginLeft', 'marginRight'))
    .reduce(
      (acc, props) => Object.values(props).reduce(
        (sum, prop) => sum + Number.parseFloat(prop),
        acc,
      ),
      queryWrapMinWidth,
    );
  return Math.max(minWidth, 120);
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
        const $paneHistory = $byClass('histories') as HTMLDivElement;
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
  const value = ($byClass('query') as HTMLInputElement).value.trim();
  const reFilter = getReFilter(value);
  return resetHistory({ reFilter, includeUrl });
}

export async function collapseHistoryDate() {
  const { vscrollProps, settings: { includeUrl } } = await getLocal('vscrollProps', 'settings');
  const $main = $byTag('main');
  if (hasClass($main, 'date-collapsed')) {
    restoreHistory(includeUrl);
    return;
  }
  addClass('date-collapsed')($main);
  const histories = getVScrollData();
  const data = histories.filter((item) => item.headerDate);
  const $paneHistory = $byClass('histories') as HTMLDivElement;
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
  addChild($byClass('folder-menu'))(document.body);
  pipe(
    addListener('animationend', () => {
      const $parent = $folder.parentElement!;
      $folder.remove();
      setHasChildren($parent);
      $byClass('title', $parent)!.click();
    }, { once: true }),
    rmClass('hilite'),
    setAnimationFolder('remove-hilite'),
  )($byClass('marker', $folder));
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
        $byClass('query')!.focus();
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
    insertHTML('beforebegin', htmlAnchor)($byClass('folders')!.children[index!]);
  } else {
    if (parentId !== $byClass('open')?.id) {
      $$byClass('open').forEach(rmClass('open'));
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
  const $modal = $byClass('modal')!;
  addClass('show-modal')(document.body);
  setText(desc)($byClass('popup-desc', $modal));
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
    $byClass('folders')!.insertAdjacentHTML('afterbegin', htmlNode);
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

export function openFolder(folderId: string, incognito = false) {
  chrome.bookmarks.getChildren(folderId, (bookmarks) => {
    const url = bookmarks.map((bm) => bm.url).filter((surl) => !!surl) as string[];
    chrome.windows.create({ url, incognito });
  });
}

type MenuClass = 'leaf-menu' | 'folder-menu';

export function showMenu($target: HTMLElement, menuClass: MenuClass) {
  const $menu = $byClass(menuClass)!;
  if ($target.parentElement !== $menu.parentElement) {
    $target.insertAdjacentElement('afterend', $menu);
  }
  const rect = $target.getBoundingClientRect();
  const { width, height } = $menu.getBoundingClientRect();
  const left = (rect.left + rect.width - 5) <= width
    ? `${rect.left}px`
    : `${rect.left - width + rect.width}px`;
  const top = (rect.top + rect.height + height) >= (document.body.offsetHeight + 4)
    ? `${rect.top - height}px`
    : `${rect.top + rect.height}px`;
  addStyle({ left, top })($menu);
}

type ScrollTarget = {
  prev: HTMLElement | null;
  current: HTMLElement | null;
  next: HTMLElement | null;
}

export function switchTabWindow(e: Event) {
  const $tabs = $byClass('tabs')!;
  if ($tabs.scrollHeight === $tabs.offsetHeight) {
    return;
  }
  const $tabsWrap = $tabs.firstElementChild! as HTMLElement;
  const $btn = e.currentTarget as HTMLElement;
  const isNext = hasClass($btn, 'win-next');
  const st = isNext ? Math.ceil($tabs.scrollTop) : Math.floor($tabs.scrollTop) - 1;
  const ot = $tabs.offsetTop;
  const targets = ([...$tabsWrap.children] as HTMLElement[]).reduce<ScrollTarget>((acc, $win) => {
    if (acc.current || acc.next) {
      return acc;
    }
    const isTopOver = ($win.offsetTop - ot) <= st;
    const isBottomUnder = ($win.offsetTop + $win.offsetHeight - ot) >= st;
    if (isTopOver && isBottomUnder) {
      return { ...acc, current: $win };
    }
    if (isBottomUnder) {
      return { ...acc, next: $win };
    }
    return { ...acc, prev: $win };
  }, { prev: null, current: null, next: null });
  let $target;
  if (isNext) {
    $target = targets.current?.nextElementSibling || targets.next?.nextElementSibling;
  } else {
    $target = targets.current || targets.prev;
  }
  if ($target) {
    const scrollTop = ($target as HTMLElement).offsetTop - ot;
    const translateY = -(Math.min(
      scrollTop - $tabs.scrollTop,
      $tabs.scrollHeight - $tabs.offsetHeight - $tabs.scrollTop,
    ));
    if (Math.abs(translateY) <= 1) {
      return;
    }
    addClass('scroll-ease-in-out')($tabsWrap);
    addStyle('transform', `translateY(${translateY}px)`)($tabsWrap);
    $tabsWrap.addEventListener('transitionend', () => {
      rmClass('scroll-ease-in-out')($tabsWrap);
      rmStyle('transform')($tabsWrap);
      $tabs.scrollTop = scrollTop;
    }, { once: true });
  }
}
