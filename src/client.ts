/* eslint-disable no-redeclare */

import {
  splitterClasses,
  Options,
  State,
  Settings,
  SplitterClasses,
  Model,
  InsertPosition,
  dropAreaClasses,
  positions,
  defaultWidth,
  ColorPalette,
  CliMessageTypes,
} from './types';

import {
  whichClass,
  cssid,
  curry,
  cbToResolve,
  getCurrentTab,
  getLocal,
  setLocal,
  htmlEscape,
  pipe,
  decode,
  pick,
  prop,
  addListener,
  when,
  getColorWhiteness,
  lightColorWhiteness,
  camelToSnake,
  makeThemeCss,
  setPopupStyle,
  postMessage,
} from './common';

import { makeLeaf, makeNode } from './html';
import { Leaf } from './bookmarks';
import { dialog } from './dialogs';
import { AppMain } from './app-main';

// DOM operation

export function $<T extends HTMLElement>(
  selector: string,
  parent: HTMLElement | DocumentFragment | Document | undefined | Element = document,
) {
  return parent?.querySelector<T>(selector) ?? undefined;
}

export function $$<T extends HTMLElement>(
  selector: string,
  parent: HTMLElement | DocumentFragment | Document = document,
) {
  return [...parent.querySelectorAll(selector)] as Array<T>;
}

export function $byClass<T extends HTMLElement>(
  className: string | null,
  parent: HTMLElement | Document = document,
) {
  return parent.getElementsByClassName(className!)[0] as T | undefined;
}

export function $byId<T extends HTMLElement>(
  id: string,
) {
  return document.getElementById(id) as T;
}

export function $$byClass<T extends HTMLElement>(
  className: string,
  parent: HTMLElement | Document = document,
) {
  return [...parent.getElementsByClassName(className)] as Array<T>;
}

export function $byTag<T extends HTMLElement>(
  tagName: string,
  parent: HTMLElement | Document = document,
) {
  return parent.getElementsByTagName(tagName)[0] as T;
}

export function $$byTag<T extends HTMLElement>(
  tagName: string,
  parent: HTMLElement | Document = document,
) {
  return [...parent.getElementsByTagName(tagName)] as Array<T>;
}

export function addChild<T extends Element | null>($child: T) {
  return <U extends Element | null>($parent: U) => {
    if ($parent && $child) {
      $parent.appendChild($child);
    }
    return $child;
  };
}

export function addStyle(styleNames: Model): <T extends Element | undefined | null>($el: T) => T;
export function addStyle(styleName: string, value: string):
  <T extends Element | undefined>($el: T) => T;
export function addStyle(styleName: string | Model, value?: string) {
  return <T extends Element | undefined>($el: T) => {
    if (typeof styleName === 'string') {
      ($el as unknown as HTMLElement)?.style?.setProperty(styleName, value!);
    } else {
      Object.entries(styleName).forEach(([k, v]) => {
        ($el as unknown as HTMLElement)?.style?.setProperty(k, v);
      });
    }
    return $el;
  };
}

export function rmStyle(...styleNames: string[]) {
  return <T extends Element | undefined | null>($el: T) => {
    styleNames.forEach(
      (styleName) => ($el as unknown as HTMLElement)?.style?.removeProperty(styleName),
    );
    return $el ?? undefined;
  };
}

export function addAttr(attrName: string, value: string) {
  return <T extends Element | undefined | null>($el: T) => {
    $el?.setAttribute(attrName, value);
    return $el ?? undefined;
  };
}

export function rmAttr(attrName: string) {
  return <T extends Element | undefined | null>($el: T) => {
    $el?.removeAttribute(attrName);
    return $el ?? undefined;
  };
}

export function addClass(...classNames: string[]) {
  return <T extends Element | undefined | null>($el: T) => {
    $el?.classList.add(...classNames);
    return $el ?? undefined;
  };
}

export function rmClass(...classNames: string[]) {
  return <T extends Element | undefined | null>($el: T) => {
    $el?.classList.remove(...classNames);
    return $el ?? undefined;
  };
}

export function hasClass($el: Element | undefined, ...classNames: string[]) {
  if (!$el) {
    return false;
  }
  return classNames.some((className) => $el.classList.contains(className));
}

export function toggleElement(isShow = true, shownDisplayType = 'block') {
  return (selectorOrElement: string | HTMLElement, parent = document) => {
    const display = isShow ? shownDisplayType : 'none';
    const $target = typeof selectorOrElement === 'string' ? $(selectorOrElement, parent) : selectorOrElement;
    addStyle({ display })($target);
  };
}

export function toggleClass(className: string, force?: boolean) {
  return <T extends Element | undefined>($el?: T) => {
    $el?.classList.toggle(className, force);
    return $el;
  };
}

export function setHTML(html: string) {
  return <T extends Element | undefined>($el: T) => {
    if ($el) {
      // eslint-disable-next-line no-param-reassign
      $el.innerHTML = html;
    }
    return $el;
  };
}

export function setText(text: string | null) {
  return <T extends Element | undefined>($el: T) => {
    if ($el) {
      // eslint-disable-next-line no-param-reassign
      $el.textContent = text;
    }
    return $el;
  };
}

// eslint-disable-next-line no-undef
export function insertHTML(position: InsertPosition, html: string) {
  return <T extends Element | undefined | null>($el: T) => {
    $el?.insertAdjacentHTML(position, html);
    return $el ?? undefined;
  };
}

export function addRules(selector: string, ruleProps: [string, string][]) {
  const rules = ruleProps.map(([prop1, value]) => `${prop1}:${value};`).join('');
  const [sheet] = document.styleSheets;
  sheet.insertRule(`${selector} {${rules}}`, sheet.cssRules.length);
}

export function getGridTemplateColumns() {
  const [pane3, pane2, pane1] = $$byClass('pane-body')
    .map((el) => el.style.getPropertyValue('width'))
    .map((n) => Number.parseInt(n, 10));
  return {
    pane1,
    pane2,
    pane3,
  };
}

export function setSplitWidth(newPaneWidth: Partial<SplitterClasses>) {
  const { pane1, pane2, pane3 } = { ...getGridTemplateColumns(), ...newPaneWidth };
  const $bodies = $$byClass('pane-body');
  [pane3, pane2, pane1].forEach((width, i) => addStyle('width', `${width}px`)($bodies[i]));
}

export function getNewPaneWidth({ settings }: Pick<State, 'settings'>) {
  const { pane3, pane2, pane1 } = getGridTemplateColumns();
  return {
    ...settings,
    paneWidth: {
      pane3,
      pane2,
      pane1,
    },
  };
}

export function getEndPaneMinWidth($endPane: HTMLElement) {
  const queryWrapMinWidth = 70;
  const minWidth = [...$endPane.children]
    .filter((el) => !hasClass(el, 'query-wrap'))
    .map((el) => getComputedStyle(el))
    .map(pick('width', 'marginLeft', 'marginRight'))
    .reduce(
      (acc, props) => Object.values(props).reduce(
        (sum, prop1) => sum + (Number.parseFloat(prop1) || 0),
        acc,
      ),
      queryWrapMinWidth,
    );
  return Math.max(minWidth, 120);
}

function addRootTransition() {
  addRules(':root', [['--xen-mode-transition', 'all 0.05s ease-in-out']]);
}

async function savePaneWidth() {
  const saved = await getLocal('settings');
  const settings = getNewPaneWidth(saved);
  setLocal({ settings });
  addRootTransition();
}

export async function recoverMinPaneWidth() {
  const $headerPanes = $$byClass('pane-header');
  let headersWidth = $headerPanes.reduce((acc, $el) => acc + $el.offsetWidth, 0);
  let overWidth = headersWidth + 4 - document.body.offsetWidth;
  const $tabs = $byClass('tabs')!;
  if (overWidth <= 0 && $tabs.offsetWidth >= 220) {
    addRootTransition();
    return;
  }
  const [$body1, $body2, $body3] = $$byClass('pane-body');
  const [pane3, pane2, pane1] = [$body1, $body2, $body3].map(($body) => {
    const paneName = whichClass(['leafs', 'tabs', 'histories', 'folders'] as const, $body)!;
    return defaultWidth[paneName];
  });
  setSplitWidth({ pane1, pane2, pane3 });
  headersWidth = $headerPanes.reduce((acc, $el) => acc + $el.offsetWidth, 0);
  overWidth = headersWidth + 4 - document.body.offsetWidth;
  if (overWidth <= 0) {
    savePaneWidth();
    return;
  }
  const [maxWidthPane] = Object.entries({ pane1, pane2, pane3 })
    .map(([className, width]) => ({ className, width }))
    .sort((a, b) => b.width - a.width);
  const { className } = maxWidthPane;
  setSplitWidth({
    pane1,
    pane2,
    pane3,
    [className]: maxWidthPane.width - overWidth,
  });
  savePaneWidth();
}

export function setAnimationClass(className: 'hilite' | 'remove-hilite' | 'hilite-fast' | 'fade-in') {
  return (el: Element | undefined) => {
    if (!el) {
      return el;
    }
    rmClass(className)(el);
    const { animationDuration } = getComputedStyle(el);
    const hasAnime = animationDuration !== '0s';
    // eslint-disable-next-line no-void
    void (el as HTMLElement).offsetWidth;
    el?.addEventListener('animationend', () => {
      if (hasAnime) {
        addStyle({ 'animation-duration': '0s' })(el);
        el.addEventListener('animationend', () => {
          setTimeout(() => rmStyle('animation-duration')(el), 100);
        }, { once: true });
      }
      rmClass(className)(el);
    }, { once: true });
    addClass(className)(el);
    return el;
  };
}

export async function createNewTab(options: Options, url: string) {
  const { windowId, ...rest } = await getCurrentTab();
  const index = decode(
    options.newTabPosition,
    ['le', 0],
    ['rs', rest.index + 1],
    ['ls', rest.index],
  );
  chrome.tabs.create({ index, url, windowId }, window.close);
}

export async function getBookmark(id: string) {
  return chrome.bookmarks.get(id).then(([tab]) => tab);
}

export function setHasChildren($target: HTMLElement) {
  $target.setAttribute('data-children', String($target.children.length - 1));
}

function saveStateOpenedPath(foldersFolder: HTMLElement, exclusiveOpenBmFolderTree: Options['exclusiveOpenBmFolderTree']) {
  let paths: Array<string> = [];
  if (exclusiveOpenBmFolderTree) {
    $$byClass('path').forEach(rmClass('path'));
  } else {
    paths = $$('.folders .path').map(prop('id'));
  }
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

export function saveStateAllPaths(id?: string) {
  const open = id ?? $byClass('open')?.id;
  const paths = $$('.folders .path').map(prop('id'));
  setLocal({ clientState: { open, paths } });
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
    $byClass('mousedown')?.classList.remove('mousedown');
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
  endPaneMinWidth: number,
) {
  return (e: MouseEvent) => {
    const className = whichClass(splitterClasses, $splitter)!;
    const isTabs = hasClass($targetPane, 'tabs');
    const minWidth = isTabs ? 220 : 100;
    const width = Math.max(e.clientX - adjustMouseX - $targetPane.offsetLeft, minWidth);
    if (document.body.offsetWidth < (width + subWidth + endPaneMinWidth)) {
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

export function resizeHeightHandler(e: MouseEvent) {
  const height = Math.min(e.clientY - 6, 570);
  if (height < 200) {
    return;
  }
  addStyle('height', `${height}px`)(document.body);
}

export function setAnimationFolder(className: string) {
  return (el: Element | null | undefined = undefined) => {
    if (!el) {
      return el;
    }
    return pipe(
      addListener('animationend', () => rmClass(className)(el), { once: true }),
      addClass(className),
    )(el);
  };
}

export async function removeFolder($folder: HTMLElement) {
  const ret = await chrome.bookmarks.removeTree($folder.id)
    .then(() => 'ok')
    .catch((reason) => dialog.alert(reason.message));
  if (ret !== 'ok') {
    return;
  }
  addChild($byClass('folder-menu')!)(document.body);
  pipe(
    addListener('animationend', () => {
      const $parent = $folder.parentElement!;
      $folder.remove();
      setHasChildren($parent);
      $byClass('title', $parent)!.click();
    }, { once: true }),
    rmClass('hilite'),
    setAnimationFolder('remove-hilite'),
  )($byClass('marker', $folder)!);
  $byId($folder.id).remove();
}

export async function editTitle(
  $title: HTMLElement,
  folderId: string,
  newFolder = false,
  isBookmark = false,
) {
  addStyle('text-overflow', 'unset')($title);
  const currentTitle = $title.textContent!;
  pipe(
    addAttr('contenteditable', 'true'),
    addAttr('data-current-title', htmlEscape(currentTitle!)),
  )($title);
  if (!isBookmark) {
    addStyle({ width: '100%' })($title.parentElement);
  }
  return new Promise<string | void>((resolve) => {
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
        if (!isBookmark) {
          rmStyle('width')($title.parentElement);
        }
        $byClass('query')!.focus();
        // eslint-disable-next-line no-param-reassign
        $title.scrollLeft = 0;
        const title = $title.textContent?.trim();
        rmStyle('text-overflow')($title);
        if (!title || title.trim() === '') {
          setText(currentTitle)($title);
          return resolve();
        }
        if (title === currentTitle) {
          return resolve();
        }
        const ret = await chrome.bookmarks.update(folderId, { title })
          .catch((reason) => reason.message as string);
        if (typeof ret === 'string') {
          await dialog.alert(ret);
          setText(currentTitle)($title);
          return resolve();
        }
        setAnimationFolder('hilite')($title.parentElement?.parentElement);
        return resolve(title);
      }, { once: true });
    }, 100);
  });
}

export async function addBookmark(
  parentId = '1',
  bookmarkCreateArg: chrome.bookmarks.BookmarkCreateArg | null = null,
  silent = false,
) {
  const isSearching = hasClass($byTag('app-main'), 'searching');
  const { title, url } = bookmarkCreateArg ?? await getCurrentTab();
  const index = bookmarkCreateArg?.index ?? (parentId === '1' ? 0 : undefined);
  const params = {
    title: title!, url: url!, parentId, index,
  };
  const { id } = await chrome.bookmarks.create(params);
  const htmlLeaf = makeLeaf({ id, ...params });
  if (parentId === '1') {
    insertHTML('beforebegin', htmlLeaf)($byId('1')!.children[index! + 1]);
    insertHTML('beforebegin', htmlLeaf)($byClass('folders')!.children[index!]);
  } else {
    if (parentId !== $byClass('open')?.id && !isSearching) {
      $$byClass('open').forEach(rmClass('open'));
      $$(cssid(parentId)).forEach(addClass('open'));
    }
    const $targetFolder = $(`.leafs ${cssid(parentId)}`) || $(`.folders ${cssid(parentId)}`)!;
    if (index == null) {
      insertHTML('beforeend', htmlLeaf)($targetFolder);
    } else {
      insertHTML('afterend', htmlLeaf)($targetFolder.children[index]);
    }
  }
  const $Leaf = $(`.folders ${cssid(id)}`) as Leaf || $(`.leafs ${cssid(id)}`) as Leaf;
  if ($Leaf && !silent && (!isSearching || parentId === '1')) {
    ($Leaf as any).scrollIntoViewIfNeeded();
    setAnimationClass('hilite')($Leaf);
    $Leaf.editBookmarkTitle();
  }
}

export function selectFolder(
  $target: HTMLElement,
  $leafs: HTMLElement,
  exclusiveOpenBmFolderTree: boolean,
) {
  const $foldersFolder = $target.parentElement?.parentElement!;
  const folders = [$foldersFolder, $(`.leafs ${cssid($foldersFolder.id)}`)];
  const isOpen = hasClass($foldersFolder, 'open');
  if (isOpen) {
    folders.forEach(addClass('path'));
    if (!exclusiveOpenBmFolderTree) {
      saveStateAllPaths($foldersFolder.id);
    }
    return;
  }
  // eslint-disable-next-line no-param-reassign
  $leafs.scrollTop = 0;
  $$byClass('open').forEach(rmClass('open'));
  folders.forEach(addClass('open'));
  saveStateOpenedPath($foldersFolder, exclusiveOpenBmFolderTree);
  $$byClass('hilite').forEach(rmClass('hilite'));
}

export async function addFolder(
  parentId = '1',
  title = '',
  indexIn: number | undefined = undefined,
  destId: string = '',
  position: InsertPosition = 'afterbegin',
) {
  const index = indexIn ?? (parentId === '1' ? 0 : undefined);
  const params = { title: title || 'Enter title', parentId, index };
  const { id } = await cbToResolve(curry(chrome.bookmarks.create)(params));
  const htmlNode = makeNode({
    id, children: '', length: 0, ...params,
  });
  if (parentId === '1') {
    insertHTML('beforebegin', htmlNode)($byClass('folders')!.children[index!]);
    insertHTML('beforebegin', htmlNode)($(`.leafs ${cssid(1)}`)!.children[index!]);
    if (destId) {
      return id;
    }
  } else if (destId) {
    const [, $dest] = $$(cssid(destId)).map(($destFolder) => {
      insertHTML(position, htmlNode)($destFolder);
      addAttr('data-children', String($destFolder.children.length))($destFolder);
      return $destFolder;
    });
    if (!index) {
      $(':scope > .marker > .title', $dest)?.click();
    }
    return id;
  } else {
    $$(cssid(parentId)).forEach(($targetFolder) => {
      const $title = pipe(
        insertHTML('beforeend', htmlNode),
        addAttr('data-children', String($targetFolder.children.length)),
        curry($)(':scope > .marker > .title'),
      )($targetFolder);
      $title?.click();
      ($targetFolder as any).scrollIntoViewIfNeeded();
    });
  }
  const $target = $(`.folders ${cssid(id)} > .marker > .title`)!;
  setAnimationFolder('hilite')($target.parentElement);
  return new Promise<string | void>((resolve) => {
    editTitle($target.firstElementChild as HTMLElement, id, !title).then((retitled) => {
      if (!retitled && !title) {
        removeFolder($target.parentElement!.parentElement!);
        resolve();
        return;
      }
      resolve(id);
    });
  });
}

export const panes = ['folders', 'leafs', 'tabs'] as const;

export function addBookmarksFromTabs(
  tabs: Pick<chrome.tabs.Tab, 'title' | 'url'>[],
  bookmarkDestArg: chrome.bookmarks.BookmarkDestinationArg,
) {
  const { parentId, index } = bookmarkDestArg;
  const silent = tabs.length > 1;
  const sourceList = index == null ? tabs : tabs.reverse();
  sourceList.forEach(({ title, url }) => addBookmark(parentId, {
    title, url, index, parentId,
  }, silent));
}

export async function addFolderFromTabs(
  tabs: Pick<chrome.tabs.Tab, 'title' | 'url'>[],
  bookmarkDestArg: chrome.bookmarks.BookmarkDestinationArg,
  destId: string,
  position: InsertPosition,
) {
  const { parentId, index } = bookmarkDestArg;
  const parentFolderId = await addFolder(parentId, tabs[0].title, index, destId, position);
  if (!parentFolderId) {
    return;
  }
  tabs.forEach(({ title, url }) => addBookmark(parentFolderId, { title, url }, true));
  const $target = $(`.folders ${cssid(parentFolderId)} > .marker > .title`)!;
  setAnimationFolder('hilite')($target.parentElement);
  editTitle($target.firstElementChild as HTMLElement, parentFolderId, false);
}

export function openFolder(folderId: string, incognito = false) {
  chrome.bookmarks.getChildren(folderId, (bookmarks) => {
    const url = bookmarks.map((bm) => bm.url).filter((surl) => !!surl) as string[];
    chrome.windows.create({ url, incognito }, window.close);
  });
}

type MenuClass = 'leaf-menu' | 'folder-menu' | 'tabs-menu' | 'multi-sel-menu';

export function showMenu(menuClassOrElement: MenuClass | HTMLElement, relativePos = false) {
  return (e: MouseEvent) => {
    e.stopImmediatePropagation();
    const $target = e.target as HTMLElement;
    const $menu = typeof menuClassOrElement === 'string' ? $byClass(menuClassOrElement)! : menuClassOrElement;
    if ($target.parentElement !== $menu.parentElement) {
      $target.insertAdjacentElement('afterend', $menu);
    }
    rmClass('menu-right')($menu);
    const rect = $target.getBoundingClientRect();
    const { width, height } = $menu.getBoundingClientRect();
    if (relativePos) {
      if (rect.x - width < 5) {
        addStyle({ left: `${$target.offsetLeft}px` })($menu);
      }
      return;
    }
    const left = when((rect.left + rect.width - 5) <= width)
      .then(() => {
        addClass('menu-right')($menu);
        return `${rect.left}px`;
      })
      .else(`${rect.left - width + rect.width}px`);
    const top = (rect.top + rect.height + height) >= (document.body.offsetHeight + 4)
      ? `${rect.top - height}px`
      : `${rect.top + rect.height}px`;
    addStyle({ left, top })($menu);
  };
}

export function setOpenPaths($folder: HTMLElement) {
  for (let $current = $folder.parentElement; $current && hasClass($current, 'folder'); $current = $current.parentElement) {
    addClass('path')($current);
  }
  saveStateAllPaths();
}

export async function remeveBookmark($leaf: Leaf) {
  await chrome.bookmarks.remove($leaf.id);
  return new Promise<void>((resolve) => {
    addChild($byClass('leaf-menu')!)($byClass('components')!);
    pipe(
      addListener('animationend', () => {
        $$(cssid($leaf.id)).forEach(($el) => $el.remove());
        resolve();
      }, { once: true }),
      rmClass('hilite'),
      setAnimationClass('remove-hilite'),
    )($leaf);
  });
}

export function getPrevTarget(...className: string[]) {
  return ($nextTarget: HTMLElement): HTMLElement | undefined => {
    const $target = $nextTarget?.previousElementSibling as HTMLElement | undefined;
    if (!$target) {
      return undefined;
    }
    if (hasClass($target, ...className)) {
      return $target;
    }
    return getPrevTarget(...className)($target);
  };
}

async function sequentialMoveBookmarks(sourceIds: string[], parentId: string, destId?: string) {
  const [sourceId, ...rest] = sourceIds;
  const [bm] = destId ? await chrome.bookmarks.get(destId) : [{ index: undefined }];
  chrome.bookmarks.move(sourceId, { parentId, index: bm.index }, () => (
    rest.length === 0 ? null : sequentialMoveBookmarks(rest, parentId, destId)
  ));
}

export function moveBookmarks(
  dropAreaClass: (typeof dropAreaClasses)[number],
  bookmarkDest: chrome.bookmarks.BookmarkDestinationArg,
  sourceIds: string[],
  destId: string,
) {
  const [$destLeafs, $destFolders] = dropAreaClass === 'leafs' ? $$byClass('open') : $$(cssid(destId));
  if (!$destLeafs) {
    return;
  }
  const { parentId, index } = bookmarkDest;
  chrome.bookmarks.getSubTree(parentId!)
    .then(([node]) => node.children?.find((bm) => bm.index === index))
    .then((destBm) => sequentialMoveBookmarks(sourceIds, parentId!, destBm?.id))
    .then(() => sourceIds.forEach((sourceId) => {
      const [$sourceLeafs, $sourceFolders] = $$(cssid(sourceId));
      const position = positions[dropAreaClass];
      const isRootTo = $destLeafs.parentElement?.id === '1' && !['drop-folder', 'leafs'].includes(dropAreaClass);
      const isRootFrom = $sourceLeafs.parentElement?.id === '1';
      const isLeafFrom = hasClass($sourceLeafs, 'leaf');
      if (isLeafFrom && isRootFrom && !isRootTo) {
        $sourceFolders.remove();
      } else if (isLeafFrom && isRootTo) {
        const $source = isRootFrom ? $sourceFolders : $sourceLeafs.cloneNode(true) as HTMLElement;
        $destFolders.insertAdjacentElement(position, $source);
        pipe(
          rmClass('search-path'),
          setAnimationClass('hilite'),
        )($source);
      } else if (!isLeafFrom) {
        const $lastParantElement = $sourceFolders.parentElement!;
        $destFolders.insertAdjacentElement(position, $sourceFolders);
        setHasChildren($lastParantElement);
        setHasChildren($sourceFolders.parentElement!);
        setOpenPaths($sourceFolders);
        setAnimationClass('hilite')($(':scope > .marker', $sourceFolders));
      }
      $destLeafs.insertAdjacentElement(position, $sourceLeafs);
      setAnimationClass('hilite')($sourceLeafs);
    }));
}

export function getMessageDeleteSelecteds(count: number) {
  return `Are you sure you want to delete ${count} selected items?`;
}

export function getChildren($target: Element) {
  return [...$target.children] as HTMLElement[];
}

export function getPalettesHtml(palettes: ColorPalette[]) {
  return palettes
    .map((palette) => {
      const divs = palette.map((color) => `<div data-color=${color} style="background-color: #${color}"></div>`).join('');
      return `<div class="fav-palette">${divs}</div>`;
    })
    .join('');
}

export function setThemeClass($appMain: AppMain, colorPalette: ColorPalette) {
  const [
    themeDarkPane, themeDarkFrame, themeDarkHover, themeDarkSearch, themeDarkKey,
  ] = colorPalette
    .map((code) => getColorWhiteness(code))
    .map((whiteness) => whiteness <= lightColorWhiteness);
  Object.entries({
    themeDarkPane,
    themeDarkFrame,
    themeDarkHover,
    themeDarkSearch,
    themeDarkKey,
  }).forEach(([key, enabled]) => toggleClass(camelToSnake(key), enabled)($appMain));
}

export async function changeColorTheme(colorPalette: ColorPalette) {
  const ruleText = makeThemeCss(colorPalette);
  const sheet = document.styleSheets[1];
  const root = [...sheet.cssRules].findIndex((rule) => (rule as any).selectorText === ':root');
  sheet.deleteRule(root);
  sheet.insertRule(`:root {\n${ruleText}}\n`);
  setThemeClass($byTag('app-main'), colorPalette);
  postMessage({ type: CliMessageTypes.setBrowserIcon, payload: colorPalette });
  return getLocal('options').then(({ options }) => {
    setLocal({ options: { ...options, colorPalette } });
    setPopupStyle({ css: options.css, colorPalette });
  });
}

export function setFavColorMenu(colorPalette: ColorPalette) {
  $('.fav-palette.selected')?.classList.remove('selected');
  const $selected = $$byClass('fav-palette')
    .find(($el) => getChildren($el)
      .every(($color, i) => $color.dataset.color === colorPalette[i]));
  $selected?.classList.add('selected');
  ($selected as any).scrollIntoViewIfNeeded();
}
