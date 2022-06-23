import {
  $, $$, $$byClass, $byClass, $byTag,
  addClass, rmClass, toggleClass, hasClass, addChild, addStyle,
  addBookmark, findInTabsBookmark, openBookmark, getBookmark,
  addFolder, setAnimationClass, editTitle,
} from './client';
import {
  addListener,
  cbToResolve,
  cssid,
  curry,
  curry3,
  extractUrl, getLocal, pipe, setEvents, setFavicon, setLocal, switches,
} from './common';
import { ISearchable, SearchParams } from './search';
import { ISubscribeElement, Store } from './store';
import { OpenBookmarkType, Options } from './types';
import { resetVScrollData } from './vscroll';

export function openOrFindBookmarks(options: Options, $target: HTMLElement) {
  return (options.findTabsFirst ? findInTabsBookmark : openBookmark)(options, $target);
}

export class PaneHeader extends HTMLDivElement implements ISubscribeElement {
  private $mainMenu = $byClass('main-menu', this);
  private $main = $byTag('main');
  setEvents(store: Store) {
    pipe(
      addListener('click', (e) => {
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
            const isChecked = hasClass(this.$main, 'auto-zoom');
            toggleClass('auto-zoom', !isChecked)(this.$main);
            getLocal('settings')
              .then(({ settings }) => {
                setLocal({ settings: { ...settings, autoZoom: !isChecked } });
              });
            break;
          }
          case 'include-url':
            getLocal('settings')
              .then(({ settings }) => {
                toggleClass('checked-include-url', !settings.includeUrl)(this.$main);
                return setLocal({ settings: { ...settings, includeUrl: !settings.includeUrl } });
              })
              .then(({ settings }) => {
                store.dispatch('changeIncludeUrl', settings.includeUrl, true);
                resetVScrollData((data) => data);
              });
            break;
          default:
        }
      }),
      addListener('mousedown', (e) => e.preventDefault()),
    )(this.$mainMenu);
  }
  connect(store: Store) {
    this.setEvents(store);
  }
}

export class HeaderLeafs extends PaneHeader {
  private $pinBookmark = $byClass('pin-bookmark', this);
  init() {
    this.$pinBookmark.addEventListener('click', () => addBookmark());
  }
}

export class Leaf extends HTMLDivElement {
  updateTitle(title: string) {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', title);
    $anchor.textContent = title;
  }
  updateAnker({ title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
    setFavicon(url!)(this);
    this.updateTitle(title);
  }
  async editBookmarkTitle() {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    const title = await editTitle($anchor, this.id).catch(() => null);
    if (!title) {
      return;
    }
    this.updateTitle(title);
    setAnimationClass('hilite')(this);
  }
}

function setLeafMenu($leafMenu: HTMLElement, options: Options) {
  setEvents([$leafMenu], {
    async click(e) {
      const $leaf = (e.target as HTMLElement)
        .parentElement!.previousElementSibling!.parentElement! as Leaf;
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
          $leaf.editBookmarkTitle();
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
          $leaf.updateAnker({ title, url: value });
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
}

export class Leafs extends HTMLDivElement implements ISubscribeElement, ISearchable {
  init(options: Options) {
    this.addEventListener('click', (e) => {
      const $target = e.target as HTMLDivElement;
      if ($target.hasAttribute('contenteditable')) {
        return;
      }
      if (hasClass($target, 'anchor')) {
        openOrFindBookmarks(options, $target!);
      } else if (hasClass($target, 'title', 'icon-fa-angle-right')) {
        toggleClass('path')($target.parentElement?.parentElement);
      }
    });
    const $leafMenu = $byClass('leaf-menu');
    this.addEventListener('mousedown', (e) => {
      if (hasClass(e.target as HTMLElement, 'leaf-menu-button')) {
        addStyle({ top: '-1000px' })($leafMenu);
      }
    });
    setLeafMenu($leafMenu, options);
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams) {
    const targetBookmarks = switches(searchSelector)
      .case('match')
      .then(() => {
        const target = $$byClass('search-path', this);
        target.forEach(rmClass('search-path'));
        $$byClass('path', this).forEach(rmClass('path'));
        return target;
      })
      .case('unmatch')
      .then(() => $$('.leaf:not(.search-path)', this))
      .else(() => {
        $$byClass('search-path', this).forEach(rmClass('search-path'));
        $$byClass('path', this).forEach(rmClass('path'));
        return $$byClass('leaf', this);
      });
    targetBookmarks.reduce((acc, $leaf) => {
      const $anchor = $leaf.firstElementChild as HTMLAnchorElement;
      if (reFilter.test($anchor.textContent!)
        || (includeUrl && reFilter.test(extractUrl($leaf.style.backgroundImage)))) {
        addClass('search-path')($leaf);
        if (acc === $leaf.parentElement) {
          return acc;
        }
        for (let $folder = $leaf.parentElement as HTMLElement | null; $folder && $folder.classList.contains('folder'); $folder = $folder.parentElement) {
          addClass('search-path', 'path')($folder);
        }
        return $leaf.parentElement;
      }
      return acc;
    }, null as HTMLElement | null);
  }
  clearSearch() {
    $$byClass('search-path', this).forEach(rmClass('search-path'));
    $$byClass('path', this).forEach(rmClass('path'));
  }
  connect(store: Store) {
    store.subscribe('clearSearch', this.clearSearch.bind(this));
  }
}
