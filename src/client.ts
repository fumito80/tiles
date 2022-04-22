import {
  splitterClasses,
  OpenBookmarkType,
  Options,
  Nil,
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
} from './common';

import { makeLeaf, makeNode } from './html';

export function setAnimationClass(el: HTMLElement, className: 'hilite' | 'remove-hilite') {
  el.classList.remove(className);
  // eslint-disable-next-line no-void
  void el.offsetWidth;
  el.classList.add(className);
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

export async function addBookmark(parentId = '1', paramsIn: chrome.bookmarks.BookmarkCreateArg | null = null) {
  const { title, url } = paramsIn ?? await getCurrentTab();
  const index = paramsIn?.index ?? (parentId === '1' ? 0 : undefined);
  const params = {
    title: title!, url: url!, parentId, index,
  };
  const { id } = await cbToResolve(curry(chrome.bookmarks.create)(params));
  const htmlAnchor = makeLeaf({ id, ...params });
  if (parentId === '1') {
    $('.folders')!.children[index!].insertAdjacentHTML('beforebegin', htmlAnchor);
  } else {
    if (parentId !== $('.open')?.id) {
      $$('.open').map((el) => el.classList.remove('open'));
      $$(cssid(parentId)).map((el) => el.classList.add('open'));
    }
    const $targetFolder = $(`.leafs ${cssid(parentId)}`) || $(`.folders ${cssid(parentId)}`)!;
    if (index == null) {
      $targetFolder.insertAdjacentHTML('beforeend', htmlAnchor);
    } else {
      $targetFolder.children[index].insertAdjacentHTML('afterend', htmlAnchor);
    }
  }
  const $target = $(`.folders ${cssid(id)}, .leafs ${cssid(id)}`)!;
  if ($target) {
    ($target as any).scrollIntoViewIfNeeded();
    setAnimationClass($target, 'hilite');
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

export function clearQuery() {
  const $query = $<HTMLInputElement>('.query')!;
  if ($query.value === '') {
    return;
  }
  $query.value = '';
  $query.setAttribute('value', '');
  $query.focus();
  $('.form-query [type="submit"]')!.click();
}

export function saveStateOpenedPath(foldersFolder: HTMLElement) {
  $$('.path').forEach((el) => el.classList.remove('path'));
  let paths: Array<string> = [];
  let folder = foldersFolder;
  while (folder.classList.contains('folder')) {
    folder.classList.add('path');
    paths = [...paths, folder.id];
    folder = folder.parentElement!;
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
    document.body.style.width = `${width}px`;
  };
}

export function resizeHeightHandler(e: MouseEvent) {
  const height = Math.min(e.clientY - 6, 570);
  if (height < 200) {
    return;
  }
  document.body.style.height = `${height}px`;
}

export function setAnimationFolder(el: HTMLElement | Nil, className: string) {
  if (!el) {
    return;
  }
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
  el.classList.add(className);
}

export async function addFolder(parentId = '1') {
  // eslint-disable-next-line no-alert
  const title = prompt('Folder name');
  if (title == null) {
    return;
  }
  const index = (parentId === '1') ? 0 : undefined;
  const params = {
    title: title!, parentId, index,
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
      $targetFolder.insertAdjacentHTML('beforeend', htmlNode);
      $targetFolder.setAttribute('data-children', String($targetFolder.children.length - 1));
      const $title = $(':scope > .marker > .title', $targetFolder);
      if ($title) {
        $title.click();
        ($targetFolder as any).scrollIntoViewIfNeeded();
      }
    });
  }
  const $target = $(`.folders ${cssid(id)} > .marker > .title`)!;
  setAnimationFolder($target.parentElement, 'hilite');
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

function relocateGrid($target: HTMLElement, $main: HTMLElement) {
  const gridColStart = getComputedStyle($target).gridColumnStart;
  const $title = $main.children[Number(gridColStart) - 1] as HTMLElement;
  $title.insertAdjacentElement('beforeend', $('.form-query')!);
  $('.query')!.focus();
}

function restoreGrid($main: HTMLElement) {
  $main.insertBefore($('.form-query')!, $('.pane-history'));
  $('.query')!.focus();
}

export function zoomOut(
  $main: HTMLElement,
  mouseenter?: (_: MouseEvent) => void,
) {
  return () => {
    const $shadeLeft = $('.shade-left')!;
    const $shadeRight = $('.shade-right')!;
    $('.pane-title > i')!.style.removeProperty('transform');
    $main.style.removeProperty('transform');
    $main.classList.add('zoom-fade-out');
    const promise1 = new Promise<void>((resolve) => {
      $shadeLeft.addEventListener('transitionend', () => {
        $main.classList.remove('zoom-pane', 'zoom-fade-out');
        restoreGrid($main);
        resolve();
      }, { once: true });
    });
    const promise2 = getLocal('settings').then(({ settings: { paneWidth } }) => setSplitWidth(paneWidth));
    if (mouseenter) {
      $shadeLeft.removeEventListener('mouseenter', mouseenter);
      $shadeRight.removeEventListener('mouseenter', mouseenter);
    }
    return [promise1, promise2];
  };
}

let timerZoom: ReturnType<typeof setTimeout>;

async function enterZoom(
  $target: HTMLElement,
  $main: HTMLElement,
  $shadeLeft: HTMLElement,
  $shadeRight: HTMLElement,
) {
  const isCenter = [...$target.classList].some((className) => ['leafs', 'pane-tabs'].includes(className));
  const width = $main.offsetWidth * 0.7; // (2 / 3);
  const promise = new Promise<void>((resolve) => {
    $target.addEventListener('transitionend', () => {
      $main.classList.add('zoom-pane');
      relocateGrid($target, $main);
      resolve();
    }, { once: true });
  });
  $target.style.setProperty('width', `${width}px`);
  $shadeRight.style.setProperty('left', `${$target.offsetLeft + width + 4}px`);
  $shadeLeft.style.setProperty('left', `calc(-100% + ${$target.offsetLeft - 4}px)`);
  if (isCenter) {
    const offset = ($main.offsetWidth - width) / 2 - $target.offsetLeft;
    $main.style.setProperty('transform', `translateX(${offset}px)`);
    $('.pane-title > i')!.style.setProperty('transform', `translateX(${-offset}px)`);
  }
  async function mouseenter(ev: MouseEvent) {
    clearTimeout(timerZoom);
    const $shade = ev.target as HTMLElement;
    if ($shade.classList.contains('shade-left')) {
      await Promise.all(zoomOut($main, mouseenter)());
      enterZoom($('.pane-history')!, $main, $shadeLeft, $shadeRight);
      return;
    }
    timerZoom = setTimeout(zoomOut($main, mouseenter), 500);
  }
  $shadeLeft.addEventListener('mouseenter', mouseenter);
  $shadeRight.addEventListener('mouseenter', mouseenter);
  return promise;
}

export function setZoomSetting($main: HTMLElement) {
  const $shadeLeft = $('.shade-left')!;
  const $shadeRight = $('.shade-right')!;
  return (e: Event) => {
    clearTimeout(timerZoom);
    const isBreak = [...$main.classList].some((className) => ['zoom-pane', 'drag-start-leaf', 'drag-start-folder'].includes(className));
    if (isBreak) {
      return;
    }
    const $target = e.target as HTMLElement;
    $target.addEventListener('mouseleave', () => clearTimeout(timerZoom), { once: true });
    timerZoom = setTimeout(() => enterZoom($target, $main, $shadeLeft, $shadeRight), 500);
  };
}
