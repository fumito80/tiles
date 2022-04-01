/* eslint-disable no-alert */
/* eslint-disable import/prefer-default-export */

import {
  dropClasses,
  splitterClasses,
  positions,
  // CliMessageTypes,
  OpenBookmarkType,
  EditBookmarkType,
  Options,
  Nil,
} from './types';

import {
  $,
  $$,
  setEvents,
  pipe,
  whichClass,
  cssid,
  getParentElement,
  // postMessage,
  curry,
  curry3,
  cbToResolve,
  getCurrentTab,
  showMenu,
  propEq,
  getLocal,
  setLocal,
  when,
  // cases,
  setSplitWidth,
  getGridTemplateColumns,
  extractUrl,
} from './utils';

import { makeLeaf, makeNode, updateAnker } from './html';
import { resetHistory } from './vscroll';

function checkDroppable(e: DragEvent) {
  const $target = e.target as HTMLElement;
  const dropClass = whichClass(dropClasses, $target);
  // false when not drop target
  if (dropClass == null) {
    return false;
  }
  const $dragSource = $('.drag-source')!;
  const targetParent = $target.parentElement!;
  // falses when same element
  if (targetParent === $dragSource) {
    return false;
  }
  switch (dropClass) {
    case 'drop-bottom':
      if (targetParent === $dragSource.previousElementSibling
        || targetParent.parentElement === $dragSource.parentElement!.previousElementSibling) {
        return false;
      }
      break;
    case 'drop-top':
      if (targetParent === $dragSource.nextElementSibling
        || targetParent.parentElement === $dragSource.parentElement!.nextElementSibling) {
        return false;
      }
      break;
    default:
  }
  return true;
}

function getBookmark(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.get(id, ([treeNode]) => resolve(treeNode));
  });
}

function getSubTree(id: string) {
  return new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
    chrome.bookmarks.getSubTree(id, ([treeNode]) => resolve(treeNode));
  });
}

async function createNewTab(options: Options, url: string) {
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

async function openBookmark(
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

function onClickAngle(e: MouseEvent) {
  const target = e.target as HTMLAnchorElement;
  const folder = target.parentElement?.parentElement!;
  if ($('.open', folder)) {
    (target.nextElementSibling as HTMLDivElement)?.click();
  }
  folder.classList.toggle('path');
}

function clearQuery() {
  const $query = $<HTMLInputElement>('.query')!;
  if ($query.value === '') {
    return;
  }
  $query.value = '';
  $query.setAttribute('value', '');
  $query.focus();
  $('.form-query [type="submit"]')!.click();
}

function saveStateOpenedPath(foldersFolder: HTMLElement) {
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

function setMouseEventListener(mouseMoveHandler: (e: MouseEvent) => void) {
  const mouseMoveHandlerWrapper = (e: MouseEvent) => {
    e.preventDefault();
    mouseMoveHandler(e);
  };
  document.addEventListener('mousemove', mouseMoveHandlerWrapper, false);
  document.addEventListener('mouseup', async () => {
    document.removeEventListener('mousemove', mouseMoveHandlerWrapper);
    const { pane3, pane2, pane1 } = getGridTemplateColumns({});
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

function resizeSplitHandler($splitter: HTMLElement, subWidth: number) {
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

function resizeWidthHandler($ref: HTMLElement, startWidth: number) {
  return (e: MouseEvent) => {
    const width = startWidth - e.screenX;
    if (width - $ref.offsetLeft < 100) {
      return;
    }
    document.body.style.width = `${width}px`;
  };
}

function resizeHeightHandler(e: MouseEvent) {
  const height = e.clientY - 6;
  if (height < 200) {
    return;
  }
  document.body.style.height = `${height}px`;
}

function setAnimationClass(el: HTMLElement, className: 'hilite' | 'remove-hilite') {
  el.classList.remove(className);
  // eslint-disable-next-line no-void
  void el.offsetWidth;
  el.classList.add(className);
}

function setAnimationFolder(el: HTMLElement | Nil, className: string) {
  if (!el) {
    return;
  }
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
  el.classList.add(className);
}

async function addBookmark(parentId = '1') {
  const { title, url } = await getCurrentTab();
  const index = (parentId === '1') ? 0 : undefined;
  const params = {
    title: title!, url: url!, parentId, index,
  };
  const { id } = await cbToResolve(curry(chrome.bookmarks.create)(params));
  const htmlAnchor = makeLeaf({ id, ...params });
  if (parentId === '1') {
    $('.folders')!.insertAdjacentHTML('afterbegin', htmlAnchor);
  } else {
    if (parentId !== $('.open')?.id) {
      $$('.open').map((el) => el.classList.remove('open'));
      $$(cssid(parentId)).map((el) => el.classList.add('open'));
    }
    const $targetFolder = $(`.leafs ${cssid(parentId)}`) || $(`.folders ${cssid(parentId)}`)!;
    $targetFolder.insertAdjacentHTML('beforeend', htmlAnchor);
  }
  const $target = $(`.folders ${cssid(id)}, .leafs ${cssid(id)}`)!;
  if ($target) {
    ($target as any).scrollIntoViewIfNeeded();
    setAnimationClass($target, 'hilite');
  }
}

async function addFolder(parentId = '1') {
  const title = prompt('Create folder name');
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

function setHasChildren($target: HTMLElement) {
  $target.setAttribute('data-children', String($target.children.length - 1));
}

const $inputQuery = $('.query')! as HTMLInputElement;
let lastQueryValue = '';

function submit(options: Options) {
  return (e: Event) => {
    const value = $inputQuery.value.trim();
    if (lastQueryValue === '' && value.length === 1) {
      return false;
    }
    $inputQuery.setAttribute('value', value);
    $('.leafs .open')?.classList.remove('open');
    $$('.leafs .search-path').forEach((el) => el.classList.remove('search-path'));
    $$('.leafs .path').forEach((el) => el.classList.remove('path'));
    if (value.length <= 1) {
      $$('.pane-tabs > div > div').forEach((el) => el.classList.remove('match', 'unmatch'));
      resetHistory();
      const openFolder = $('.folders .open');
      if (openFolder) {
        openFolder.classList.remove('open');
        $(':scope > .marker > .title', openFolder)?.click();
      }
      lastQueryValue = '';
      $inputQuery.setAttribute('value', '');
      return false;
    }
    if (e.type === 'submit' && options.enableExternalUrl && options.externalUrl) {
      const url = options.externalUrl + encodeURIComponent(value);
      createNewTab(options, url);
      return false;
    }
    const reFilter = new RegExp(value, 'i');
    $$('.leafs .leaf').forEach((leaf) => {
      const $anchor = leaf.firstElementChild as HTMLAnchorElement;
      if (reFilter.test($anchor.textContent!)
        || (options.includeUrl && reFilter.test(extractUrl($anchor.style.backgroundImage)))) {
        leaf.classList.add('search-path');
        let folder = leaf.parentElement;
        while (folder?.classList.contains('folder')) {
          folder.classList.add('search-path', 'path');
          folder = folder.parentElement;
        }
      }
    });
    const selector = when(lastQueryValue !== '' && value.startsWith(lastQueryValue)).then('.match')
      .when(lastQueryValue.startsWith(value)).then('.unmatch')
      .else('div');
    lastQueryValue = value;
    $$(`.pane-tabs > div > ${selector}`).forEach((el) => {
      const [addClass, removeClass] = (reFilter.test(el.textContent!) || (options.includeUrl && reFilter.test(el.title))) ? ['match', 'unmatch'] : ['unmatch', 'match'];
      el.classList.add(addClass);
      el.classList.remove(removeClass);
    });
    resetHistory({ reFilter, includeUrl: options.includeUrl });
    return false;
  };
}

async function findInTabsBookmark(options: Options, $anchor: HTMLElement) {
  const { id } = $anchor.parentElement!;
  const { url } = await getBookmark(id);
  const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      chrome.windows.getCurrent((win) => {
        const findIndex = tabs.findIndex((t) => t.active && t.windowId === win.id);
        const sorted = [
          ...tabs.slice(0, findIndex),
          ...tabs.slice(findIndex + 1),
          tabs[findIndex],
        ];
        const firstTab = sorted.find((t) => t.url?.startsWith(url!));
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

export function setEventListners(options: Options) {
  const findTabsFirstOrNot = options.findTabsFirst ? findInTabsBookmark : openBookmark;
  $('.query')!.addEventListener('input', submit(options));
  $('.form-query')!.addEventListener('submit', (e: Event) => {
    submit(options)(e);
    e.preventDefault();
  });
  $('.form-query .fa-times')?.addEventListener('click', clearQuery);
  setEvents([document.body], {
    click: (e) => {
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
    dragstart: (e) => {
      const [targetClass, $target, id] = ((target) => {
        const className = whichClass(['anchor', 'leaf', 'marker'] as const, target);
        if (className === 'leaf') {
          return ['drag-start-leaf', target, target.id] as const;
        }
        if (className === 'marker') {
          return ['drag-start-folder', target, target.parentElement!.id] as const;
        }
        if (className === 'anchor') {
          const $leaf = (target as HTMLElement).parentElement as HTMLElement;
          return ['drag-start-leaf', $leaf, $leaf.id] as const;
        }
        return ['', null, ''] as const;
      })(e.target as HTMLElement);
      if ($target != null) {
        $target.classList.remove('hilite');
        const draggable = pipe(
          (target) => target.cloneNode(true) as HTMLAnchorElement,
          (clone) => $('.draggable-clone')!.appendChild(clone),
        )($target);
        e.dataTransfer!.setDragImage(draggable, 10, 10);
        const title = $('.title, .anchor', $target)!.textContent || '';
        e.dataTransfer!.setData('text/plain', title);
        e.dataTransfer!.setData('application/bx-move', id);
        $target.classList.add('drag-source');
        $('main')!.classList.add(targetClass);
      }
    },
    dragover: (e) => {
      if (checkDroppable(e)) {
        e.preventDefault();
      }
    },
    dragenter: (e) => {
      $('.drag-enter')?.classList.remove('drag-enter');
      if (checkDroppable(e)) {
        const $target = e.target as HTMLElement;
        $target.classList.add('drag-enter');
      }
    },
    dragend: () => {
      $('.drag-source')?.classList.remove('drag-source');
      $('main')!.classList.remove('drag-start-leaf');
      $('main')!.classList.remove('drag-start-folder');
      $('.draggable-clone')!.innerHTML = '';
    },
    drop: async (e) => {
      const $dropArea = e.target as HTMLElement;
      const sourceId = e.dataTransfer?.getData('application/bx-move')!;
      const dropClass = whichClass(dropClasses, $dropArea)!;
      const $dropTarget = $dropArea.parentElement?.id
        ? $dropArea.parentElement!
        : $dropArea.parentElement!.parentElement!;
      const destId = $dropTarget.id;
      let bookmarkDest: chrome.bookmarks.BookmarkDestinationArg = { parentId: $dropTarget.id };
      if (dropClass !== 'drop-folder') {
        const parentId = $dropTarget.parentElement?.id! || '1';
        const subTree = await getSubTree(parentId);
        const findIndex = subTree.children?.findIndex(propEq('id', $dropTarget.id));
        if (findIndex == null) {
          alert('Operation failed with unknown error.');
          return;
        }
        const index = findIndex + (dropClass === 'drop-bottom' ? 1 : 0);
        bookmarkDest = { parentId, index };
      }
      await cbToResolve(curry3(chrome.bookmarks.move)(sourceId)(bookmarkDest));
      const position = positions[dropClass];
      const [$sourceLeafs, $sourceFolders] = $$(cssid(sourceId));
      const [$destLeafs, $destFolders] = $$(cssid(destId));
      const isRootTo = $destLeafs.parentElement.id === '1' && dropClass !== 'drop-folder';
      const isRootFrom = $sourceLeafs.parentElement.id === '1';
      const isLeafFrom = $sourceLeafs.classList.contains('leaf');
      if (isLeafFrom && isRootFrom && !isRootTo) {
        $sourceFolders.remove();
      } else if (isLeafFrom && isRootTo) {
        const $source = isRootFrom ? $sourceFolders : $sourceLeafs.cloneNode(true);
        $destFolders.insertAdjacentElement(position, $source);
        setAnimationClass($source, 'hilite');
      } else if (!isLeafFrom) {
        const $lastParantElement = $sourceFolders.parentElement;
        $destFolders.insertAdjacentElement(position, $sourceFolders);
        setHasChildren($lastParantElement);
        setHasChildren($sourceFolders.parentElement);
        setAnimationClass($(':scope > .marker', $sourceFolders)!, 'hilite');
      }
      $destLeafs.insertAdjacentElement(position, $sourceLeafs);
      setAnimationClass($sourceLeafs, 'hilite');
    },
  });

  setEvents($$('.leaf-menu'), {
    click: async (e) => {
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
          const $target = $(`.folders ${cssid(id!)} > .marker > .title`)!;
          $target.click();
          $target.focus();
          ($leaf.firstElementChild as HTMLAnchorElement).focus();
          setAnimationClass($leaf, 'hilite');
          break;
        }
        default:
      }
      ($anchor.nextElementSibling as HTMLElement).blur();
    },
    mousedown: (e) => e.preventDefault(),
  });

  $('.folders')!.addEventListener('click', (e) => {
    const $target = e.target as HTMLDivElement;
    const targetClasses = [
      'anchor',
      'marker',
      'title',
      'folder-menu-button',
      'fa-angle-right',
    ] as const;
    const targetClass = whichClass(targetClasses, $target);
    switch (targetClass) {
      case 'anchor':
        findTabsFirstOrNot(options, $target!);
        break;
      case 'marker':
        $('.title', $target)!.click();
        break;
      case 'fa-angle-right':
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

  $('.leafs')!.addEventListener('click', (e) => {
    const $target = e.target as HTMLDivElement;
    if ($target.classList.contains('anchor')) {
      findTabsFirstOrNot(options, $target!);
    } else if ([...$target.classList].find((className) => ['title', 'fa-angle-right'].includes(className))) {
      const folder = $target.parentElement?.parentElement!;
      folder.classList.toggle('path');
    }
  });

  $('.bookmark-button')?.addEventListener('click', () => {
    const id = $('.open')?.id;
    addBookmark(id || '1');
  });

  $('.main-menu-button')?.addEventListener('click', (e) => {
    e.preventDefault();
    return false;
  });

  $$('.split-h').forEach((el) => el.addEventListener('mousedown', (e) => {
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
    click: async (e) => {
      switch ((e.target as HTMLElement).dataset.value) {
        case 'add-bookmark': {
          addBookmark();
          break;
        }
        case 'add-folder':
          addFolder();
          break;
        case 'settings':
          chrome.runtime.openOptionsPage();
          break;
        default:
      }
    },
    mousedown: (e) => e.preventDefault(),
  });

  setEvents($$('.folder-menu'), {
    click: async (e) => {
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
    mousedown: (e) => e.preventDefault(),
  });
  $('.pane-tabs')?.addEventListener('click', (e) => {
    const [, tabId] = (e.target as HTMLDivElement).id.split('-');
    const [, windowId] = (e.target as HTMLDivElement).parentElement?.id.split('-') || [];
    chrome.windows.update(Number(windowId), { focused: true });
    chrome.tabs.update(Number(tabId), { active: true });
  });
  $('.pane-history > .rows')?.addEventListener('click', (e) => {
    const url = extractUrl((e.target as HTMLDivElement).style.backgroundImage);
    if (!url) {
      return;
    }
    createNewTab(options, url);
  });
}
