/* eslint-disable max-classes-per-file */

import {
  $$, $$byClass, $byClass, $byTag, addBookmark, addClass, addFolder, hasClass, rmClass, toggleClass,
} from './client';
import {
  addListener,
  extractUrl, getLocal, pipe, setLocal, switches,
} from './common';
import { SearchParams } from './search';
import { ISubscribeElement, Store } from './store';
import { resetVScrollData } from './vscroll';

export class Leafs extends HTMLDivElement implements ISubscribeElement {
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
    addListener('click', () => addBookmark())(this.$pinBookmark);
  }
}
