/* eslint-disable no-redeclare */

import {
  // splitterClasses,
  Options,
  State,
  Settings,
  // SplitterClasses,
  Model,
  InsertPosition,
  dropAreaClasses,
  positions,
  ColorPalette,
  CliMessageTypes,
  // PaneLayouts,
  // paneNames,
  maxHeight,
  InitailTabs,
  PaneSizes,
} from './types';

import {
  // whichClass,
  cssid,
  curry,
  getLocal,
  setLocal,
  htmlEscape,
  pipe,
  prop,
  addListener,
  when,
  getColorWhiteness,
  lightColorWhiteness,
  camelToSnake,
  makeThemeCss,
  postMessage,
  pick,
  setPopupStyle,
  // updateSettings,
  chromeEventFilter,
  base64Encode,
  init,
  always,
  updateSettings,
} from './common';

import { makeLeaf, makeNode } from './html';
import { Leaf } from './bookmarks';
import { dialog } from './dialogs';
import { AppMain } from './app-main';
import { Dispatch } from './popup';

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

export function addStyle<T extends Element | undefined | null>(styleNames: Model): ($el: T) => T;
export function addStyle<T extends Element | undefined>(styleName: string, value: string):
  ($el: T) => T;
export function addStyle<T extends Element | undefined>(styleName: string | Model, value?: string) {
  return ($el: T) => {
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

export function rmStyle<T extends Element | undefined | null>(...styleNames: string[]) {
  return ($el: T) => {
    styleNames.forEach(
      (styleName) => ($el as unknown as HTMLElement)?.style?.removeProperty(styleName),
    );
    return $el ?? undefined;
  };
}

export function addAttr<T extends Element | undefined | null>(attrName: string, value: string) {
  return ($el: T) => {
    $el?.setAttribute(attrName, value);
    return $el ?? undefined;
  };
}

export function rmAttr<T extends Element | undefined | null>(attrName: string) {
  return ($el: T) => {
    $el?.removeAttribute(attrName);
    return $el ?? undefined;
  };
}

export function addClass<T extends Element | undefined | null>(...classNames: string[]) {
  return ($el: T) => {
    $el?.classList.add(...classNames);
    return $el ?? undefined;
  };
}

export function rmClass<T extends Element | undefined | null>(...classNames: string[]) {
  return ($el: T) => {
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
  return (selectorOrElement: string | HTMLElement, parent = document as Document | HTMLElement) => {
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

export function initSplitWidth({ paneSizes }: Settings, { panes2 }: Options) {
  const $colGrids = $$byClass('col-grid');
  const headerHeight = $('.end .query-wrap')!.offsetHeight;
  const $$headers = $$byClass('pane-header');
  $$headers.forEach(($el) => $el.style.setProperty('height', `${headerHeight}px`));
  const widths = paneSizes.widths.length === 0
    ? init(panes2).map((pane) => (pane.some((v) => (v === 'bookmarks')) ? 40 : 30))
    : paneSizes.widths;
  const heights = paneSizes.heights.length === 0
    ? panes2.map((pane) => {
      const h = 100 / pane.length;
      return init(panes2).map(always(h));
    })
    : paneSizes.heights;
  $byTag('app-main')!.style.gridTemplateColumns = [...Array($colGrids.length - 1)]
    .map((_, col) => `${widths[col]}% min-content`)
    .concat('minmax(0, 100%)')
    .join(' ');
  $colGrids.forEach(($grid, col) => {
    const rows = $grid.children.length;
    // const heights = paneSizes.heights[col];
    const tmplColumns = [...Array(rows - 1)]
      .map((_, row) => `${heights[col][row]}%`)
      .concat('minmax(0, 100%)')
      .join(' ');
    $grid.style.setProperty('grid-template-rows', tmplColumns);
  });
  $byClass('bookmarks')!.style.setProperty('grid-template-columns', `${paneSizes.bookmarks[0]}% auto auto`);
  if (!paneSizes.widths.length || !paneSizes.heights.length) {
    updateSettings({ paneSizes: { ...paneSizes, widths, heights } });
  }
  // let widthes: PaneLayouts[number] | undefined;
  // if (paneLayouts.length === 0) {
  //   if (paneWidth.pane3 === defaultWidth.histories
  //     && paneWidth.pane2 === defaultWidth.tabs
  //     && paneWidth.pane1 === defaultWidth.leafs) {
  //     [widthes] = defaultWidthes;
  //   } else {
  //     widthes = [$pane1, $pane2, $pane3].map(($body, i) => {
  //       const name = whichClass(paneNames, $body)!;
  //       const width = [paneWidth.pane3, paneWidth.pane2, paneWidth.pane1][i];
  //       return { name, width };
  //     }) as PaneLayouts[number];
  //   }
  //   // updateSettings({ paneLayouts: [widthes!] });
  // } else {
  //   widthes = paneLayouts.find((ps) => [$pane1, $pane2, $pane3].every(
  //     (pane, i) => hasClass(pane, ps[i].name),
  //   ));
  //   if (!widthes) {
  //     widthes = defaultWidthes.find((panes) => [$pane1, $pane2, $pane3].every(
  //       ($pane, i) => hasClass($pane, panes[i].name),
  //     ))!;
  //   }
  // }
  // widthes.forEach(({ width }, i) => addStyle('width', `${width}px`)($bodies[i]));
}

// function setSplitWidth(newPaneWidth: Partial<SplitterClasses>) {
//   const { pane1, pane2, pane3 } = { ...getGridTemplateColumns(), ...newPaneWidth };
//   const $bodies = $$byClass('pane-body');
//   [pane3, pane2, pane1].forEach((width, i) => addStyle('width', `${width}px`)($bodies[i]));
// }

export function getNewPaneWidth($parent: HTMLElement, keyName: keyof Pick<PaneSizes, 'widths' | 'bookmarks'>) {
  return ({ settings }: Pick<State, 'settings' | 'options'>) => {
    const gridTemplateColumnsValue = $parent.style.getPropertyValue('grid-template-columns');
    const gridTemplateColumns = gridTemplateColumnsValue.split(' ');
    const pos = gridTemplateColumns.findIndex((el) => el.endsWith('px'));
    if (pos < 0) {
      return settings;
    }
    const width = parseInt(gridTemplateColumns[pos], 10);
    const appMainWidth = $parent.offsetWidth;
    const { [keyName]: widths } = settings.paneSizes;
    const percent = (width / appMainWidth) * 100;
    widths.splice(pos / 2, 1, percent);
    const newGridTemplateColumns = gridTemplateColumns
      .reduce((acc, el, i) => ((i === pos) ? [...acc, `${percent}%`] : [...acc, el]), [] as string[])
      .join(' ');
    $parent.style.setProperty('grid-template-columns', newGridTemplateColumns);
    // const [$pane1, $pane2, $pane3] = $$byClass('pane-body');
    // const newWidthes = [$pane1, $pane2, $pane3].map(($body) => {
    //   const name = whichClass(paneNames, $body)!;
    //   const width = Number.parseInt($body.style.getPropertyValue('width'), 10);
    //   return { name, width };
    // }) as PaneLayouts[number];
    // const paneLayouts = settings.paneLayouts
    //   .filter((ps) => ![$pane1, $pane2, $pane3].every(
    //     (pane, i) => hasClass(pane, ps[i].name),
    //   ))
    //   .concat([newWidthes]);
    // if (options.windowMode) {
    //   return { ...settings, paneLayoutsWindowMode: paneLayouts };
    // }
    return { ...settings, paneSizes: { ...settings.paneSizes, [keyName]: widths } };
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

export function setAnimationClass(className: 'hilite' | 'remove-hilite' | 'hilite-fast' | 'fade-in') {
  return (el: Element | undefined) => {
    if (!el) {
      return el;
    }
    el?.addEventListener('animationend', () => {
      addStyle({ 'animation-duration': '0s' })(el);
      rmClass(className)(el);
      setTimeout(() => rmStyle('animation-duration')(el), 200);
    }, { once: true });
    addClass(className)(el);
    return el;
  };
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
  getSettings: (state: Pick<State, 'settings' | 'options'>) => Settings,
  resizeHeight: boolean,
) {
  const mouseMoveHandlerWrapper = (e: MouseEvent) => {
    e.preventDefault();
    mouseMoveHandler(e);
  };
  document.addEventListener('mousemove', mouseMoveHandlerWrapper, false);
  document.addEventListener('mouseup', async () => {
    $byClass('mousedown')?.classList.remove('mousedown');
    document.removeEventListener('mousemove', mouseMoveHandlerWrapper);
    const saved = await getLocal('settings', 'options');
    const settings = getSettings(saved);
    setLocal({ settings }).then(() => {
      if (resizeHeight) {
        setPopupStyle(saved.options);
      }
    });
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
  setMouseEventListener(mouseMoveHandler, getNewSize, true);
}

export function setSplitterHandler(
  $parent: HTMLElement,
  keyName: Parameters<typeof getNewPaneWidth>[1],
  mouseMoveHandler: (e: MouseEvent) => void,
) {
  setMouseEventListener(mouseMoveHandler, getNewPaneWidth($parent, keyName), false);
}

export function resizeSplitHandler(
  startWidth: number,
  startMouseX: number,
  pos: number,
  $appMain: HTMLElement,
  minWidth: number,
  maxWidth: number,
  appZoom: number,
) {
  return (e: MouseEvent) => {
    const newWidth = startWidth - (startMouseX - e.clientX) / appZoom;
    const width = Math.min(Math.max(newWidth, minWidth), maxWidth);
    const gridTemplateColumns = $appMain.style.getPropertyValue('grid-template-columns');
    const newGridTemplateColumns = gridTemplateColumns.split(' ')
      .reduce((acc, el, i) => ((i === pos * 2) ? [...acc, `${width}px`] : [...acc, el]), [] as string[])
      .join(' ');
    $appMain.style.setProperty('grid-template-columns', newGridTemplateColumns);
  };
}

export function resizeHeightHandler(e: MouseEvent) {
  const height = Math.min(e.clientY - 6, maxHeight);
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
  $(`.leafs ${cssid($folder.id)}`)?.remove();
}

export async function editTitle(
  $title: HTMLElement,
  bookmarkId: string,
  dispatch: Dispatch,
  newFolder = false,
  isBookmark = false,
  delay = 100,
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
        dispatch('editingBookmark', true);
        const ret = await chrome.bookmarks.update(bookmarkId, { title })
          .catch((reason) => {
            dispatch('editingBookmark', false);
            return reason.message as string;
          });
        if (typeof ret === 'string') {
          await dialog.alert(ret);
          setText(currentTitle)($title);
          return resolve();
        }
        setAnimationFolder('hilite')($title.parentElement?.parentElement);
        return resolve(title);
      }, { once: true });
    }, delay);
  });
}

export async function addBookmark(
  parentId: string,
  bookmarkCreateArg: chrome.bookmarks.BookmarkCreateArg,
  dispatchEditing?: Dispatch,
) {
  if (dispatchEditing) {
    dispatchEditing('editingBookmark', true);
  }
  const isSearching = hasClass($byTag('app-main'), 'searching');
  const { title, url } = bookmarkCreateArg;
  const index = bookmarkCreateArg?.index ?? (parentId === '1' ? 0 : undefined);
  const params = {
    title: title!, url: url!, parentId, index,
  };
  const { id, message } = await chrome.bookmarks.create(params)
    .then((resp) => ({ id: resp.id, message: undefined }))
    .catch((reason) => {
      if (dispatchEditing) {
        dispatchEditing('editingBookmark', false);
      }
      return { id: '' as string, message: reason.message as string };
    });
  if (message) {
    return message;
  }
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
  if ($Leaf && dispatchEditing && (!isSearching || parentId === '1')) {
    ($Leaf as any).scrollIntoViewIfNeeded();
    setAnimationClass('hilite')($Leaf);
    await $Leaf.editBookmarkTitle(dispatchEditing);
  }
  return undefined;
}

export async function addBookmarkFromText(parentId = '1', url = '', name = '') {
  const input = await dialog.editBookmark('Add bookmark', name, url);
  if (input) {
    if (!input.url) {
      addBookmarkFromText(parentId, input.url, input.name);
      return;
    }
    const title = input.name || name || input.url;
    const success = await addBookmark(parentId, { url: input.url, title })
      .then((message) => {
        if (message) {
          return dialog.alert(message).then(() => false);
        }
        return true;
      });
    if (!success) {
      addBookmarkFromText(parentId, input.url, input.name);
    }
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
  dispatch: Dispatch,
  parentId = '1',
  title = 'New Folder',
  indexIn: number | undefined = undefined,
  destId: string = '',
  position: InsertPosition = 'afterbegin',
) {
  const index = indexIn ?? (parentId === '1' ? 0 : undefined);
  const params = { title, parentId, index };
  dispatch('editingBookmark', true);
  const { id } = await chrome.bookmarks.create(params).catch(() => {
    dispatch('editingBookmark', false);
    return { id: undefined };
  });
  if (!id) {
    return undefined;
  }
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
    const $dest = $$(cssid(destId))
      .map(($destFolder) => {
        insertHTML(position, htmlNode)($destFolder);
        addAttr('data-children', String($destFolder.children.length))($destFolder);
        return $destFolder;
      })
      .find(($destFolder) => !!$destFolder.closest('.folders'));
    if (!index) {
      const $target = $(':scope > .marker > .title', $dest)!;
      selectFolder($target, $byClass('leafs')!, false);
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
    editTitle(
      $target.firstElementChild as HTMLElement,
      id,
      dispatch,
      !title,
      false,
      200,
    ).then((retitled) => {
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
  dispatch: Dispatch,
) {
  const { parentId = '1', index } = bookmarkDestArg;
  const dispatchEditing = tabs.length > 1 ? undefined : dispatch;
  const sourceList = index == null ? tabs : tabs.reverse();
  sourceList.forEach(({ title, url }) => addBookmark(parentId, {
    title, url, index, parentId,
  }, dispatchEditing));
}

export async function addFolderFromTabs(
  tabs: Pick<chrome.tabs.Tab, 'title' | 'url'>[],
  bookmarkDestArg: chrome.bookmarks.BookmarkDestinationArg,
  destId: string,
  position: InsertPosition,
  dispatch: Dispatch,
) {
  const { parentId, index } = bookmarkDestArg;
  const parentFolderId = await addFolder(
    dispatch,
    parentId,
    tabs[0].title,
    index,
    destId,
    position,
  );
  if (!parentFolderId) {
    return;
  }
  tabs.forEach(({ title, url }) => addBookmark(parentFolderId, { title, url }));
  const $target = $(`.folders ${cssid(parentFolderId)} > .marker > .title`)!;
  setAnimationFolder('hilite')($target.parentElement);
  const $title = $target.firstElementChild as HTMLElement;
  editTitle($title, parentFolderId, dispatch, false);
}

export function openFolder(folderId: string, incognito = false) {
  chrome.bookmarks.getChildren(folderId, (bookmarks) => {
    const url = bookmarks.map((bm) => bm.url).filter((surl) => !!surl) as string[];
    chrome.windows.create({ url, incognito });
  });
}

type MenuClass = 'leaf-menu' | 'folder-menu' | 'tabs-menu' | 'multi-sel-menu';

export function showMenu(
  menuClassOrElement: MenuClass | HTMLElement,
  appZoom: number,
  relativePos = false,
) {
  return (e: MouseEvent) => {
    e.stopImmediatePropagation();
    const $target = e.target as HTMLElement;
    const $menu = typeof menuClassOrElement === 'string' ? $byClass(menuClassOrElement)! : menuClassOrElement;
    rmClass('menu-right')($menu);
    const rect = $target.getBoundingClientRect();
    const { width, height } = $menu.getBoundingClientRect();
    if (relativePos) {
      if (rect.x - width < 5) {
        addStyle({ left: `calc(${$target.offsetLeft}px / ${appZoom})` })($menu);
      }
      return;
    }
    const left = when((rect.left + rect.width - 5) <= width)
      .then(() => {
        addClass('menu-right')($menu);
        return `${rect.left}px`;
      })
      .else(() => {
        const maxMenu = Math.max(...$$byClass('menu-tree', $menu).map(($el) => $el.offsetWidth));
        if (rect.left - (width + maxMenu) < 0) {
          addClass('menu-right')($menu);
        }
        return `${rect.left - width + rect.width}px`;
      });
    const top = (rect.top + rect.height + height) >= (document.body.offsetHeight + 4)
      ? `calc(${rect.top - height}px / ${appZoom})`
      : `calc(${rect.top + rect.height}px / ${appZoom})`;
    addStyle({ left: `calc(${left} / ${appZoom})`, top })($menu);
  };
}

export function preShowMenu(menuClassOrElement: MenuClass | HTMLElement, e: MouseEvent) {
  const $target = e.target as HTMLElement;
  const $menu = typeof menuClassOrElement === 'string' ? $byClass(menuClassOrElement)! : menuClassOrElement;
  if ($target.parentElement !== $menu.parentElement) {
    $target.insertAdjacentElement('afterend', $menu);
  }
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
  const [$destLeaf, $destFolder] = dropAreaClass === 'leafs'
    ? [$('.leafs .open')!, $('.folders .open')!]
    : [$(`.leafs ${cssid(destId)}`)!, $(`.folders ${cssid(destId)}`)!];
  if (!$destLeaf) {
    return;
  }
  const { parentId, index } = bookmarkDest;
  chrome.bookmarks.getSubTree(parentId!)
    .then(([node]) => node.children?.find((bm) => bm.index === index))
    .then((destBm) => sequentialMoveBookmarks(sourceIds, parentId!, destBm?.id))
    .then(() => {
      const position = positions[dropAreaClass];
      const isRootTo = $destLeaf.parentElement?.id === '1' && !['drop-folder', 'leafs'].includes(dropAreaClass);
      const orderedIds = position === 'afterend' ? sourceIds.reverse() : sourceIds;
      orderedIds.forEach((sourceId) => {
        const [$sourceLeafs, $sourceFolders] = [$(`.leafs ${cssid(sourceId)}`)!, $(`.folders ${cssid(sourceId)}`)!];
        const isRootFrom = $sourceLeafs?.parentElement?.id === '1';
        const isLeafFrom = hasClass($sourceLeafs, 'leaf');
        if (isLeafFrom && isRootFrom && !isRootTo) {
          $sourceFolders.remove();
        } else if (isLeafFrom && isRootTo) {
          const $source = isRootFrom ? $sourceFolders : $sourceLeafs.cloneNode(true) as HTMLElement;
          $destFolder.insertAdjacentElement(position, $source);
          pipe(
            rmClass('search-path', 'selected'),
            setAnimationClass('hilite'),
          )($source);
        } else if (!isLeafFrom) {
          const $lastParantElement = $sourceFolders.parentElement!;
          $destFolder.insertAdjacentElement(position, $sourceFolders);
          setHasChildren($lastParantElement);
          setHasChildren($sourceFolders.parentElement!);
          setOpenPaths($sourceFolders);
          setAnimationClass('hilite')($(':scope > .marker', $sourceFolders));
        }
        $destLeaf.insertAdjacentElement(position, $sourceLeafs);
        setAnimationClass('hilite')($sourceLeafs);
      });
    });
}

export function getMessageDeleteSelecteds(count: number) {
  return `Are you sure you want to delete ${count} selected items?`;
}

export function getChildren($target: Element) {
  return [...$target.children] as HTMLElement[];
}

export function getOffsetHeight($target: HTMLElement) {
  return Number.parseFloat(getComputedStyle($target).height);
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

export function setBrowserFavicon(colorPalette: ColorPalette) {
  postMessage({ type: CliMessageTypes.getSvgBrowserFavicon, payload: colorPalette })
    .then((svg) => svg.trim().replaceAll(/(>[\s\n]+<)/g, '><'))
    .then((svg) => base64Encode(svg))
    .then((base64svg) => {
      let link = $('link[rel="icon"]') as HTMLLinkElement;
      if (!link) {
        link = Object.assign(document.head.appendChild(document.createElement('link')), {
          rel: 'icon',
        });
      }
      link.href = `data:image/svg+xml;base64,${base64svg}`;
    });
}

export async function changeColorTheme(colorPalette: ColorPalette) {
  const ruleText = makeThemeCss(colorPalette);
  const sheet = document.styleSheets[1];
  const root = [...sheet.cssRules].findIndex((rule) => (rule as any).selectorText === ':root');
  sheet.deleteRule(root);
  sheet.insertRule(`:root {\n${ruleText}}\n`);
  setThemeClass($byTag('app-main'), colorPalette);
  postMessage({ type: CliMessageTypes.setThemeColor, payload: colorPalette });
  getLocal('options').then(({ options }) => {
    if (options.windowMode) {
      setBrowserFavicon(colorPalette);
    }
  });
}

export function setFavColorMenu(colorPalette: ColorPalette) {
  $('.fav-palette.selected-palette')?.classList.remove('selected-palette');
  const $selected = $$byClass('fav-palette')
    .find(($el) => getChildren($el)
      .every(($color, i) => $color.dataset.color === colorPalette[i]));
  $selected?.classList.add('selected-palette');
  ($selected as any)?.scrollIntoViewIfNeeded();
}

export function scrollVerticalCenter($target: HTMLElement) {
  const $container = $target.parentElement!;
  $container.scrollTop = $target.offsetTop - $container.offsetHeight / 2 + $target.offsetHeight / 2;
}

export function getInitialTabs() {
  const promiseCurrentWindowId = chrome.windows.getCurrent(chromeEventFilter)
    .then((win) => win.id!);
  const promiseInitTabs = new Promise<InitailTabs>((resolve) => {
    chrome.windows.getAll({ ...chromeEventFilter, populate: true }, (wins) => {
      const windows = wins.map((win) => ({
        windowId: win.id!,
        tabs: win.tabs!,
      }));
      resolve(windows);
    });
  });
  return Promise.all([promiseInitTabs, promiseCurrentWindowId]);
}
