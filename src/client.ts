/* eslint-disable no-redeclare */

import {
  splitterClasses,
  OpenBookmarkType,
  Options,
  State,
  Settings,
  SplitterClasses,
  Model,
} from './types';

import {
  whichClass,
  cssid,
  curry,
  cbToResolve,
  getCurrentTab,
  getLocal,
  setLocal,
  extractDomain,
  htmlEscape,
  curry3,
  pipe,
  decode,
  pick,
  prop,
  last,
  addListener,
  makeStyleIcon,
  getChromeId,
} from './common';

import {
  rowSetterHistory,
  setVScroll,
  getVScrollData,
} from './vscroll';

import { makeLeaf, makeNode } from './html';

// DOM operation

export function $<T extends HTMLElement>(
  selector: string | null = null,
  parent: HTMLElement | DocumentFragment | Document | null | Element = document,
) {
  return parent?.querySelector<T>(selector!) ?? null;
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
  return parent.getElementsByClassName(className!)[0] as T;
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

export function addStyle(styleNames: Model): <T extends Element | null>($el: T) => T;
export function addStyle(styleName: string, value: string): <T extends Element | null>($el: T) => T;
export function addStyle(styleName: string | Model, value?: string) {
  return <T extends Element | null>($el: T) => {
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
  return <T extends Element | null>($el: T) => {
    styleNames.forEach(
      (styleName) => ($el as unknown as HTMLElement)?.style?.removeProperty(styleName),
    );
    return $el;
  };
}

export function addAttr(attrName: string, value: string) {
  return <T extends Element | null>($el: T) => {
    $el?.setAttribute(attrName, value);
    return $el;
  };
}

export function rmAttr(attrName: string) {
  return <T extends Element | null>($el: T) => {
    $el?.removeAttribute(attrName);
    return $el;
  };
}

export function addClass(...classNames: string[]) {
  return <T extends Element | null>($el: T) => {
    $el?.classList.add(...classNames);
    return $el;
  };
}

export function rmClass(...classNames: string[]) {
  return <T extends Element | null>($el: T) => {
    $el?.classList.remove(...classNames);
    return $el;
  };
}

export function hasClass($el: Element | null, ...classNames: string[]) {
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
  return <T extends Element | null>($el?: T) => {
    $el?.classList.toggle(className, force);
    return $el;
  };
}

export function setHTML(html: string) {
  return <T extends Element | null>($el: T) => {
    if ($el) {
      // eslint-disable-next-line no-param-reassign
      $el.innerHTML = html;
    }
    return $el;
  };
}

export function setText(text: string | null) {
  return <T extends Element | null>($el: T) => {
    if ($el) {
      // eslint-disable-next-line no-param-reassign
      $el.textContent = text;
    }
    return $el;
  };
}

// eslint-disable-next-line no-undef
export function insertHTML(position: InsertPosition, html: string) {
  return <T extends Element | null>($el: T) => {
    $el?.insertAdjacentHTML(position, html);
    return $el;
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

async function checkSplitWidth(pane1: number, pane2: number, pane3: number) {
  if (document.body.offsetWidth >= (pane1 + pane2 + pane3 + 120)) {
    return true;
  }
  const width = 800;
  const paneWidth = { pane1: 200, pane2: 200, pane3: 200 };
  addStyle('width', `${width}px`)(document.body);
  // eslint-disable-next-line no-use-before-define
  setSplitWidth(paneWidth);
  const saved = await getLocal('settings');
  const settings = {
    ...saved.settings,
    width,
    paneWidth,
  };
  setLocal({ settings });
  return false;
}

export async function setSplitWidth(newPaneWidth: Partial<SplitterClasses>) {
  const { pane1, pane2, pane3 } = { ...getGridTemplateColumns(), ...newPaneWidth };
  if (!await checkSplitWidth(pane1, pane2, pane3)) {
    return;
  }
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
  const queryWrapMinWidth = 65;
  const minWidth = [...$endPane.children]
    .filter((el) => !hasClass(el, 'query-wrap'))
    .map((el) => getComputedStyle(el))
    .map(pick('width', 'marginLeft', 'marginRight'))
    .reduce(
      (acc, props) => Object.values(props).reduce(
        (sum, prop1) => sum + Number.parseFloat(prop1),
        acc,
      ),
      queryWrapMinWidth,
    );
  return Math.max(minWidth, 120);
}

export async function recoverMinPaneWidth() {
  const $endHeaderPane = last($$byClass('pane-header'))!;
  const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
  const saved = await getLocal('settings');
  const { pane1, pane2, pane3 } = saved.settings.paneWidth;
  if ((pane1 + pane2 + pane3 + 16 + endPaneMinWidth) <= document.body.offsetWidth) {
    return;
  }
  const [maxWidthPane] = Object.entries(saved.settings.paneWidth)
    .map(([className, width]) => ({ className, width }))
    .sort((a, b) => b.width - a.width);
  const { className } = maxWidthPane;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [className]: _, ...rest } = saved.settings.paneWidth as Model;
  const restWidth = Object.values(rest).reduce((acc, value) => acc + value, 0);
  const altWidth = document.body.offsetWidth - (endPaneMinWidth + restWidth + 16);
  await setSplitWidth({ [className]: Math.floor(altWidth) });
  const settings = getNewPaneWidth(saved);
  setLocal({ settings });
}

export function setAnimationClass(className: 'hilite' | 'remove-hilite') {
  return pipe(
    rmClass(className),
    (el) => {
      // eslint-disable-next-line no-void
      void (el as HTMLElement).offsetWidth;
      el?.addEventListener('animationend', () => rmClass('hilite')(el), { once: true });
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
  chrome.tabs.create({ index, url, windowId }, window.close);
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
    case OpenBookmarkType.window:
    case OpenBookmarkType.incognito: {
      const incognito = openType === OpenBookmarkType.incognito;
      chrome.windows.create({ url, incognito }, window.close);
      break;
    }
    default:
  }
}

export function setHasChildren($target: HTMLElement) {
  $target.setAttribute('data-children', String($target.children.length - 1));
}

export function saveStateOpenedPath(foldersFolder: HTMLElement, exclusiveOpenBmFolderTree: Options['exclusiveOpenBmFolderTree']) {
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

export function onClickAngle($target: HTMLElement) {
  const $folder = $target.parentElement?.parentElement!;
  if ($byClass('open', $folder)) {
    ($target.nextElementSibling as HTMLDivElement)?.click();
  }
  toggleClass('path')($folder);
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
        setVScroll($paneHistory, rowSetterHistory, vScrollData, vscrollProps.rowHeight);
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

export function updateAnker(id: string, { title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
  const style = makeStyleIcon(url);
  $$(cssid(id)).forEach((el) => {
    el.setAttribute('style', style);
    const $anchor = el.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', title);
    $anchor.textContent = title;
  });
}

export async function findInTabsBookmark(options: Options, $anchor: HTMLElement) {
  const { id } = $anchor.parentElement!;
  const { url = '' } = await getBookmark(id);
  const [schemeSrc, domainSrc] = extractDomain(url);
  const finder = options.findTabsMatches === 'prefix'
    ? (tab: chrome.tabs.Tab) => !!tab.url?.startsWith(url)
    : (tab: chrome.tabs.Tab) => {
      const [scheme, domain] = extractDomain(tab.url);
      return domain === domainSrc && scheme === schemeSrc;
    };
  const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      chrome.windows.getCurrent((win) => {
        const findIndex = tabs.findIndex((t) => t.active && t.windowId === win.id);
        const sorted = [
          ...tabs.slice(findIndex + 1),
          ...tabs.slice(0, findIndex + 1),
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
  chrome.tabs.update(tab.id, { active: true }, window.close);
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

export async function addBookmark(
  parentId = '1',
  paramsIn: chrome.bookmarks.BookmarkCreateArg | null = null,
  silent = false,
) {
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
  if ($target && !silent) {
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

export async function addFolder(parentId = '1', title = '', indexIn: number | undefined = undefined) {
  const index = indexIn ?? (parentId === '1' ? 0 : undefined);
  const params = { title: title || 'Enter title', parentId, index };
  const { id } = await cbToResolve(curry(chrome.bookmarks.create)(params));
  const htmlNode = makeNode({
    id, children: '', length: 0, ...params,
  });
  if (parentId === '1') {
    insertHTML('beforebegin', htmlNode)($byClass('folders')!.children[index!]);
    insertHTML('beforebegin', htmlNode)($(`.leafs ${cssid(1)}`)!.children[index!]);
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

export async function addFolderFromTabs(
  parentFolderId: string,
  index: number,
  elementId: string,
) {
  const windowId = getChromeId(elementId);
  chrome.windows.get(windowId, { populate: true }, async ({ tabs }) => {
    if (!tabs) {
      return;
    }
    const parentId = await addFolder(parentFolderId, tabs[0].title, index);
    if (!parentId) {
      return;
    }
    tabs.forEach(({ title, url }) => addBookmark(parentId, { parentId, title, url }, true));
  });
}

export function openFolder(folderId: string, incognito = false) {
  chrome.bookmarks.getChildren(folderId, (bookmarks) => {
    const url = bookmarks.map((bm) => bm.url).filter((surl) => !!surl) as string[];
    chrome.windows.create({ url, incognito }, window.close);
  });
}

type MenuClass = 'leaf-menu' | 'folder-menu' | 'tabs-menu';

export function showMenu(menuClassOrElement: MenuClass | HTMLElement) {
  return (e: MouseEvent) => {
    e.stopImmediatePropagation();
    const $target = e.target as HTMLElement;
    const $menu = typeof menuClassOrElement === 'string' ? $byClass(menuClassOrElement)! : menuClassOrElement;
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
  };
}

export function setOpenPaths($folder: HTMLElement) {
  for (let $current = $folder.parentElement; $current && hasClass($current, 'folder'); $current = $current.parentElement) {
    addClass('path')($current);
  }
  saveStateAllPaths();
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
