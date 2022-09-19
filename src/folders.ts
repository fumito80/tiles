/* eslint-disable import/prefer-default-export */

import { openOrFindBookmarks } from './bookmarks';
import {
  $, $$byClass, $byClass, addBookmark, addFolder, addStyle, editTitle, hasClass,
  openFolder, removeFolder, saveStateAllPaths, selectFolder, showMenu, toggleClass,
} from './client';
import { getParentElement, setEvents, whichClass } from './common';
import { ISubscribeElement, Store } from './store';
import { Options } from './types';

function onClickAngle($target: HTMLElement) {
  const $folder = $target.parentElement?.parentElement!;
  if ($byClass('open', $folder)) {
    ($target.nextElementSibling as HTMLDivElement)?.click();
  }
  toggleClass('path')($folder);
}

setEvents($$byClass('folder-menu'), {
  async click(e) {
    const $folder = getParentElement(e.target as HTMLElement, 4)!;
    const { value } = (e.target as HTMLElement).dataset;
    switch (value) {
      case 'add-bookmark': {
        addBookmark($folder.id);
        break;
      }
      case 'add-folder': {
        addFolder($folder.id);
        break;
      }
      case 'edit': {
        const $title = $('.title > div', $folder)!;
        editTitle($title, $folder.id);
        break;
      }
      case 'open-all':
      case 'open-all-incognito':
        openFolder($folder.id, value === 'open-all-incognito');
        break;
      case 'remove': {
        removeFolder($folder);
        break;
      }
      default:
    }
  },
  mousedown(e) {
    e.preventDefault();
  },
});

export class Folders extends HTMLDivElement implements ISubscribeElement {
  #options!: Options;
  readonly $foldersMenu = $byClass('folder-menu');
  init(options: Options) {
    this.#options = options;
  }
  setEvents(store: Store) {
    this.addEventListener('mousedown', (e) => {
      if (hasClass(e.target as HTMLElement, 'folder-menu-button')) {
        addStyle({ top: '-1000px' })(this.$foldersMenu);
      }
    });
    this.addEventListener('click', (e) => {
      const $target = e.target as HTMLDivElement;
      const targetClasses = [
        'anchor',
        'marker',
        'title',
        'folder-menu-button',
        'icon-fa-angle-right',
      ] as const;
      const targetClass = whichClass(targetClasses, $target);
      switch (targetClass) {
        case 'anchor':
          if ($target.hasAttribute('contenteditable')) {
            return;
          }
          openOrFindBookmarks(this.#options, $target!);
          break;
        case 'marker':
          $byClass('title', $target)!.click();
          break;
        case 'icon-fa-angle-right':
          onClickAngle($target);
          if (!this.#options.exclusiveOpenBmFolderTree) {
            saveStateAllPaths();
          }
          break;
        case 'title': {
          store.dispatch('clearQuery');
          selectFolder($target, $byClass('leafs'), this.#options.exclusiveOpenBmFolderTree);
          break;
        }
        case 'folder-menu-button': {
          showMenu('folder-menu')(e);
          break;
        }
        default:
      }
    });
  }
  connect(store: Store) {
    this.setEvents(store);
  }
}