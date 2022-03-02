/* eslint-disable no-alert */
/* eslint-disable import/prefer-default-export */

import {
  dropClasses,
  CliMessageTypes,
  OpenBookmarkType,
  EditBookmarkType,
} from './types';

import {
  $,
  $$,
  setEvents,
  pipe,
  whichClass,
  cssid,
  getParentElement,
  postMessage,
  curry,
  curry3,
  cbToResolve,
  getCurrentTab,
  showMenu,
  propEq,
} from './utils';

import { makeLeaf, makeNode, updateAnker } from './html';

function checkDroppable(e: DragEvent) {
  // console.log(e);
  const $target = e.target as HTMLElement;
  const dropClass = whichClass(dropClasses, $target);
  // false when not drop target
  // console.log(dropClass);
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

async function openBookmark(
  target: EventTarget | HTMLElement,
  openType: keyof typeof OpenBookmarkType = OpenBookmarkType.tab,
) {
  const { id } = (target as HTMLAnchorElement).parentElement!;
  // postMessage({
  //   type: CliMessageTypes.openBookmark,
  //   payload: { id, openType },
  // });
  const { url } = await getBookmark(id);
  // const url = state.bookmarks.entities[payload.id]?.url;
  switch (openType) {
    case OpenBookmarkType.tab: {
      const tab = await getCurrentTab();
      chrome.tabs.create({
        index: tab.index + 1,
        windowId: tab.windowId,
        url,
      });
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
  $query.value = '';
  $query.setAttribute('value', '');
  $query.focus();
  $('.form-query [type="submit"]')!.click();
}

function sendStateOpenedPath(foldersFolder: HTMLElement) {
  $$('.path').forEach((el) => el.classList.remove('path'));
  let paths: Array<string> = [];
  let folder = foldersFolder;
  while (folder.classList.contains('folder')) {
    folder.classList.add('path');
    paths = [...paths, folder.id];
    folder = folder.parentElement!;
  }
  // Send client state
  // postMessage({
  //   type: CliMessageTypes.saveState,
  //   payload: {
  //     paths,
  //     open: foldersFolder.id,
  //   },
  // });
}

function setMouseEventListener(mouseMoveHandler: (e: MouseEvent) => any) {
  const mouseMoveHandlerWrapper = (e: MouseEvent) => {
    e.preventDefault();
    mouseMoveHandler(e);
  };
  document.addEventListener('mousemove', mouseMoveHandlerWrapper, false);
  document.addEventListener('mouseup', () => {
    document.removeEventListener('mousemove', mouseMoveHandlerWrapper);
    postMessage({
      type: CliMessageTypes.saveOptions,
      payload: {
        width: document.body.offsetWidth,
        height: document.body.offsetHeight,
        rightWidth: $('main > :last-child')!.offsetWidth,
      },
    });
  }, { once: true });
}

function resizeSplitHandler() {
  const target = $('main')!;
  return (e: MouseEvent) => {
    const width = Number(document.body.dataset.rightPane) - e.x;
    target.style.gridTemplateColumns = `min-content 1fr min-content ${width}px`;
  };
}

function resizeWidthHandler(e: MouseEvent) {
  const width = Number(document.body.dataset.startX) - e.screenX;
  document.body.style.width = `${width}px`;
}

function resizeHeightHandler(e: MouseEvent) {
  const height = Number(document.body.dataset.startY) + e.screenY;
  document.body.style.height = `${height}px`;
}

function setAnimationClass(el: HTMLElement, className: 'hilite' | 'remove-hilite') {
  el.classList.remove(className);
  // eslint-disable-next-line no-void
  void el.offsetWidth;
  el.classList.add(className);
}

function setAnimationFolder(el: HTMLElement, className: string) {
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
  // const { id, html, exists } = await postMessage({
  //   type: CliMessageTypes.addBookmark,
  //   payload: folderId,
  // });
  // if (exists) {
  //   alert('This bookmark already exists in this folder.');
  //   return;
  // }
  // if (html == null) {
  //   alert('This bookmark could not be added with unkown error.');
  //   return;
  // }
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
  const $target = $(`.leafs ${cssid(id)}`) || $(`.folders ${cssid(id)}`)!;
  ($target.firstElementChild as HTMLAnchorElement).focus();
  setAnimationClass($target, 'hilite');
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
  // const { id, html, exists } = await postMessage({
  //   type: CliMessageTypes.addFolder,
  //   payload: {
  //     title,
  //     parentId,
  //   },
  // });
  // if (exists) {
  //   alert('The same name folder already exists.');
  //   return;
  // }
  // if (html == null) {
  //   alert('The folder could not be added with unkown error.');
  //   return;
  // }
  if (parentId === '1') {
    $('.folders')!.insertAdjacentHTML('afterbegin', htmlNode);
    $(`.leafs ${cssid(1)}`)!.insertAdjacentHTML('afterbegin', htmlNode);
  } else {
    $$(cssid(parentId)).forEach(($targetFolder) => {
      $targetFolder.insertAdjacentHTML('beforeend', htmlNode);
      // eslint-disable-next-line no-param-reassign
      $targetFolder.dataset.children = String($targetFolder.children.length - 1);
      const $title = $(':scope > .marker > .title', $targetFolder);
      if ($title) {
        $title.click();
        ($targetFolder as any).scrollIntoViewIfNeeded();
      }
    });
  }
  const $target = $(`.folders ${cssid(id)} > .marker > .title`)!;
  setAnimationFolder($target.parentElement!, 'hilite');
}

const $inputQuery = $('.query')! as HTMLInputElement;
let lastQueryValue = '';

function submit() {
  const value = $inputQuery.value.trim();
  if (lastQueryValue === '' && value.length === 1) {
    return false;
  }
  $inputQuery.setAttribute('value', value);
  $('.leafs .open')?.classList.remove('open');
  $$('.leafs .search-path').forEach((el) => el.classList.remove('search-path'));
  $$('.leafs .path').forEach((el) => el.classList.remove('path'));
  if (value.length <= 1) {
    $$('.pane-history > div, .pane-tabs > div > div').forEach((el) => el.classList.remove('match', 'unmatch'));
    const openFolder = $('.folders .open');
    if (openFolder) {
      openFolder.classList.remove('open');
      $(':scope > .marker > .title', openFolder)?.click();
    }
    lastQueryValue = '';
    $inputQuery.setAttribute('value', '');
    return false;
  }
  const re = new RegExp(value, 'i');
  $$('.leafs .leaf')
    .filter((leaf) => re.test(leaf.firstElementChild?.textContent!))
    .map((el) => {
      el.classList.add('search-path');
      return el;
    })
    .forEach((el) => {
      let folder = el.parentElement;
      while (folder?.classList.contains('folder')) {
        folder.classList.add('search-path', 'path');
        folder = folder.parentElement;
      }
    });
  let selector = 'div';
  if (lastQueryValue !== '' && value.startsWith(lastQueryValue)) {
    selector = '.match';
  } else if (lastQueryValue.startsWith(value)) {
    selector = '.unmatch';
  }
  lastQueryValue = value;
  const targets = $$(`.pane-history > ${selector}, .pane-tabs > div > ${selector}`);
  targets.forEach((el) => {
    const [addClass, removeClass] = re.test(el.textContent!) ? ['match', 'unmatch'] : ['unmatch', 'match'];
    el.classList.add(addClass);
    el.classList.remove(removeClass);
  });
  return false;
}

export function setEventListners() {
  // eslint-disable-next-line no-undef
  let inputTimer: NodeJS.Timeout;
  $('.query')!.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(submit, 200);
  });
  $('.form-query')!.addEventListener('submit', (e) => {
    submit();
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
        // const $menu = $('.leaf-menu')!;
        // $menu.style.top = '';
        // $menu.style.left = '';
        // // $menu.style.right = '';
        // if ($target.parentElement !== $menu.parentElement) {
        //   $target.insertAdjacentElement('afterend', $menu);
        // }
        // // if ($target.parentElement!.parentElement!.classList.contains('folders')) {
        // const rect = $target.getBoundingClientRect();
        // const { width, height } = $menu.getBoundingClientRect();
        // $menu.style.left = `${rect.left - width + rect.width}px`;
        // // if ((rect.top + rect.height + height) >= ($('.folders')!.offsetHeight - 4)) {
        // if ((rect.top + rect.height + height) >= (document.body.offsetHeight + 4)) {
        //   $menu.style.top = `${rect.top - height}px`;
        // } else {
        //   $menu.style.top = `${rect.top + rect.height}px`;
        // }
        return;
        // }
        // const [, marginRight] = /(\d+)px/.exec(getComputedStyle($target).marginRight) || [];
        // $menu.style.right = `${Number(marginRight) + 1}px`;
        // $target.classList.remove('menu-pos-top');
        // const { top, height } = $menu.getBoundingClientRect();
        // get.classList.toggle('menu-pos-top', (top + height) >= ($('.leafs')!.offsetHeight - 4));
        // return;
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
      const $dropTarget = e.target as HTMLElement;
      const id = e.dataTransfer?.getData('application/bx-move')!;
      const dropClass = whichClass(dropClasses, $dropTarget)!;
      const $target = $dropTarget.parentElement!.id
        ? $dropTarget.parentElement!
        : $dropTarget.parentElement!.parentElement!;
      // let parentNode;
      let parentId;
      let index;
      // let nextFolderId = null;
      switch (dropClass) {
        case 'drop-folder': {
          parentId = $target.id;
          index = $target.children.length - 1;
          await cbToResolve(curry3(chrome.bookmarks.move)(id)({ parentId }));
          break;
        }
        default: {
          const parentNode = $target.parentElement;
          parentId = parentNode?.id! || '1';
          const subTree = await getSubTree(parentId);
          const findIndex = subTree.children?.findIndex(propEq('id', $target.id));
          if (findIndex == null) {
            alert('Operation failed with unknown error.');
            return;
          }
          index = findIndex + (dropClass === 'drop-bottom' ? 1 : 0);
          await cbToResolve(curry3(chrome.bookmarks.move)(id)({ parentId, index }));
        }
      }
      const $dragSource = $(cssid(id))!;
      if ($dragSource.classList.contains('leaf')) {
        if (parentId === '1') {
          const $foldersTarget = $(`.folders > div:nth-child(${index + 1})`)!;
          const $leaf = ($dragSource.parentElement!.id === '1') ? $(`.folders ${cssid(id)}`)! : $dragSource.cloneNode(true);
          setAnimationClass($('.folders')!.insertBefore($leaf, $foldersTarget) as HTMLElement, 'hilite');
        } else if ($dragSource.parentElement!.id === '1') {
          $(`.folders ${cssid(id)}`)!.remove();
        }
        $(`.leafs ${cssid(parentId)}`)!.insertBefore($dragSource, $(`.leafs ${cssid(parentId)} > div:nth-child(${index + 2})`));
        if (parentId !== '1') {
          setAnimationClass($dragSource, 'hilite');
          ($dragSource as any).scrollIntoViewIfNeeded();
        }
      } else {
        const [$targetLeaf, $targetFolder] = $$(cssid(id));
        const currentParentId = $dragSource.parentElement!.id;
        if (parentId !== currentParentId) {
          const children = Number($targetFolder.parentElement.dataset.children) - 1;
          $targetFolder.parentElement.dataset.children = String(children);
        }
        if (parentId === '1') {
          $(`.leafs ${cssid(1)}`)!.insertBefore($dragSource, $(`.leafs ${cssid(1)} > div:nth-child(${index + 2})`));
          $('.folders')!.insertBefore($targetFolder, $(`.folders > div:nth-child(${index + 1})`));
        } else if (dropClass === 'drop-folder') {
          $(`.leafs ${cssid(parentId)}`)!.append($targetLeaf);
          $(`.folders ${cssid(parentId)}`)!.append($targetFolder);
        } else {
          const position = dropClass === 'drop-top' ? 'beforebegin' : 'afterend';
          $targetLeaf.insertAdjacentElement(position, $(`.leafs ${cssid($target.id)}`));
          $targetFolder.insertAdjacentElement(position, $(`.folders ${cssid($target.id)}`));
        }
        if (parentId !== currentParentId) {
          const children = Number($targetFolder.parentElement.dataset.children) + 1;
          $targetFolder.parentElement.dataset.children = String(children);
        }
        setAnimationClass($(':scope > .marker', $targetFolder)!, 'hilite');
      }
    },
  });

  // const $scrollContainers = $$('.leafs, .folders');
  // eslint-disable-next-line no-undef
  // let timerScrollbar: NodeJS.Timeout;
  // setEvents($$('.scrollbar-area'), {
  //   mouseenter: (e) => {
  //     function endScrolling(e2: MouseEvent) {
  //       if (!(e2.relatedTarget as HTMLElement)?.classList.contains('scrollbar-area')) {
  //         clearTimeout(timerScrollbar);
  //         $scrollContainers.forEach(($target) => {
  //           $target.classList.remove('scrolling');
  //           $target.removeEventListener('mouseover', endScrolling);
  //           $target.removeEventListener('mouseleave', endScrolling);
  //         });
  //       }
  //     }
  //     setEvents($scrollContainers, {
  //       mouseover: endScrolling,
  //       mouseleave: endScrolling,
  //     });
  //     const $target = (e.currentTarget as HTMLElement)!.previousElementSibling! as HTMLElement;
  //     clearTimeout(timerScrollbar);
  //     timerScrollbar = setTimeout(() => $target.classList.add('scrolling'), 100);
  //   },
  // });

  setEvents($$('.leaf-menu'), {
    click: async (e) => {
      const $leaf = (e.target as HTMLElement).parentElement!.previousElementSibling!.parentElement!;
      const $anchor = $leaf!.firstElementChild as HTMLAnchorElement;
      switch ((e.target as HTMLElement).dataset.value) {
        case 'open-new-window':
          openBookmark($anchor, OpenBookmarkType.window);
          break;
        case 'open-incognito':
          openBookmark($anchor, OpenBookmarkType.incognito);
          break;
        case 'edit-title': {
          const title = $anchor.textContent;
          // eslint-disable-next-line no-alert
          const value = prompt('Edit title', title!);
          if (value == null) {
            break;
          }
          const { url = '' } = await getBookmark($leaf.id);
          // const ret = await postMessage({
          //   type: CliMessageTypes.editBookmark,
          //   payload: {
          //     value,
          //     editType: EditBookmarkType.title,
          //     id: $leaf!.id,
          //   },
          // });
          // $anchor.setAttribute('title', ret.title);
          // $anchor.textContent = value;
          const changes = { [EditBookmarkType.title]: value };
          await cbToResolve(curry3(chrome.bookmarks.update)($leaf.id)(changes));
          updateAnker({ url, title: value });
          setAnimationClass($leaf, 'hilite');
          break;
        }
        case 'edit-url': {
          // const url = postMessage({ type: CliMessageTypes.getUrl, payload: $leaf!.id });
          const { url = '', title } = await getBookmark($leaf.id);
          // eslint-disable-next-line no-alert
          const value = prompt('Edit url', url);
          if (value == null) {
            break;
          }
          // const { title, style } = await postMessage({

          await cbToResolve(curry3(chrome.bookmarks.update)($leaf.id)({ url }));
          // $anchor.setAttribute('title', title);
          // $anchor.setAttribute('style', style);
          updateAnker({ title, url: value });
          setAnimationClass($leaf, 'hilite');

          // postMessage({
          //   type: CliMessageTypes.editBookmark,
          //   payload: {
          //     value,
          //     editType: EditBookmarkType.url,
          //     id: $leaf!.id,
          //   },
          // });
          break;
        }
        case 'remove': {
          // const succeed = await postMessage({
          //   type: CliMessageTypes.removeBookmark,
          //   payload: $leaf!.id,
          // });
          await cbToResolve(curry(chrome.bookmarks.remove)($leaf.id));
          // if (succeed) {
          document.body.appendChild($('.leaf-menu')!);
          $leaf.addEventListener('animationend', () => $leaf.remove(), { once: true });
          $leaf.classList.remove('hilite');
          setAnimationClass($leaf, 'remove-hilite');
          // }
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
    const target = e.target as HTMLDivElement;
    const targetClasses = [
      'anchor',
      'marker',
      'title',
      'folder-menu-button',
      'fa-angle-right',
    ] as const;
    const targetClass = whichClass(targetClasses, target);
    switch (targetClass) {
      case 'anchor':
        openBookmark(e.target!);
        break;
      case 'marker':
        $('.title', target)!.click();
        break;
      case 'fa-angle-right':
        onClickAngle(e);
        break;
      case 'title': {
        clearQuery();
        const foldersFolder = target.parentElement?.parentElement!;
        const folders = [foldersFolder, $(`.leafs ${cssid(foldersFolder.id)}`)];
        const isOpen = foldersFolder.classList.contains('open');
        if (isOpen) {
          folders.forEach((el) => el?.classList.add('path'));
          return false;
        }
        $$('.open').forEach((el) => el.classList.remove('open'));
        folders.forEach((el) => el?.classList.add('open'));
        sendStateOpenedPath(foldersFolder);
        $$('.hilite').map((el) => el.classList.remove('hilite'));
        break;
      }
      case 'folder-menu-button': {
        showMenu(target, '.folder-menu');
        // const $menu = $('.folder-menu')!;
        // $menu.style.top = '';
        // $menu.style.left = '';
        // if (target.parentElement !== $menu.parentElement) {
        //   target.parentElement?.insertBefore($menu, null);
        // }
        // const rect = target.getBoundingClientRect();
        // const { width, height } = $menu.getBoundingClientRect();
        // $menu.style.left = `${rect.left - width + rect.width}px`;
        // if ((rect.top + rect.height + height) >= (document.body.offsetHeight + 4)) {
        //   $menu.style.top = `${rect.top - height}px`;
        // } else {
        //   $menu.style.top = `${rect.top + rect.height}px`;
        // }
        e.stopImmediatePropagation();
        break;
      }
      default:
    }
    return false;
  });

  $('.leafs')!.addEventListener('click', (e) => {
    const target = e.target as HTMLDivElement;
    if (target.classList.contains('anchor')) {
      openBookmark(e.target!);
    } else if ([...target.classList].find((className) => ['title', 'fa-angle-right'].includes(className))) {
      const folder = target.parentElement?.parentElement!;
      folder.classList.toggle('path');
    }
  });

  $('.bookmark-button')!.addEventListener('click', () => {
    const id = $('.open')?.id;
    addBookmark(id || '1');
  });

  $('.main-menu-button')!.addEventListener('click', (e) => {
    e.preventDefault();
    return false;
  });

  $('.split-h')!.addEventListener('mousedown', (e) => {
    document.body.dataset.rightPane = String($('main > :last-child')!.offsetWidth + e.x);
    setMouseEventListener(resizeSplitHandler());
  });

  $('.resize-x')!.addEventListener('mousedown', (e) => {
    document.body.dataset.startX = String(document.body.offsetWidth + e.screenX);
    setMouseEventListener(resizeWidthHandler);
  });

  $('.resize-y')!.addEventListener('mousedown', (e) => {
    document.body.dataset.startY = String(document.body.offsetHeight - e.screenY);
    setMouseEventListener(resizeHeightHandler);
  });

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
          // const succeed = await postMessage({
          //   type: CliMessageTypes.editFolder,
          //   payload: {
          //     title,
          //     id: $folder.id,
          //   },
          // });
          // if (succeed) {
          $title.textContent = title;
          setAnimationFolder($title.parentElement!.parentElement!, 'hilite');
          // }
          break;
        }
        case 'add-folder': {
          addFolder($folder.id);
          break;
        }
        case 'remove': {
          // const succeed = await postMessage({
          //   type: CliMessageTypes.removeFolder,
          //   payload: $folder!.id,
          // });
          await cbToResolve(curry(chrome.bookmarks.removeTree)($folder.id));
          // if (succeed) {
          document.body.appendChild($('.folder-menu')!);
          const $marker = $('.marker', $folder)!;
          $marker.addEventListener('animationend', () => {
            const $parent = $folder.parentElement!;
            $folder.remove();
            $parent.dataset.children = String($parent.children.length - 1);
            $('.title', $parent)!.click();
          }, { once: true });
          $marker.classList.remove('hilite');
          setAnimationFolder($marker, 'remove-hilite');
          // }
          break;
        }
        default:
      }
    },
    mousedown: (e) => e.preventDefault(),
  });
  $('.pane-tabs')!.addEventListener('click', (e) => {
    const [, tabId] = (e.target as HTMLDivElement).id.split('-');
    const [, windowId] = (e.target as HTMLDivElement).parentElement!.id.split('-');
    chrome.windows.update(Number(windowId), { focused: true });
    chrome.tabs.update(Number(tabId), { active: true });
  });
  $('.pane-history')!.addEventListener('click', (e) => {
    const style = (e.target as HTMLDivElement).getAttribute('style')!;
    const [, url] = /background-image:\surl\('chrome:\/\/favicon\/(.*)'\)$/.exec(style) || [];
    chrome.tabs.create({ url, active: true });
  });
}
