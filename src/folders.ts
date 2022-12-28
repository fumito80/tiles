/* eslint-disable import/prefer-default-export */

import { getBookmarksBase } from './bookmarks';
import {
  $, $$byClass, $byClass, addAttr, addBookmark, addFolder, addStyle, editTitle, hasClass,
  openFolder, removeFolder, saveStateAllPaths, selectFolder, showMenu, toggleClass,
} from './client';
import { getParentElement, setEvents, whichClass } from './common';
import {
  IPubSubElement, makeAction, Store,
} from './popup';
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
        const title = await editTitle($title, $folder.id);
        if (!title) {
          return;
        }
        addAttr('title', title)($title.parentElement);
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

const Bookmarks = getBookmarksBase(HTMLDivElement);

export class Folders extends Bookmarks implements IPubSubElement {
  #options!: Options;
  private $foldersMenu!: HTMLElement;
  init(options: Options) {
    this.#options = options;
    this.$foldersMenu = $byClass('folder-menu')!;
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
        'leaf',
        'marker',
        'title',
        'folder-menu-button',
        'icon-fa-angle-right',
      ] as const;
      const targetClass = whichClass(targetClasses, $target);
      switch (targetClass) {
        case 'anchor':
        case 'leaf':
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
          selectFolder($target, $byClass('leafs')!, this.#options.exclusiveOpenBmFolderTree);
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
  actions() {
    return {
      clickFolders: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mousedownFolders: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
      }),
      mouseupFolders: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
      }),
      mouseoverFolders: makeAction({
        target: this,
        eventType: 'mouseover',
        eventOnly: true,
      }),
      mouseoutFolders: makeAction({
        target: this,
        eventType: 'mouseout',
        eventOnly: true,
      }),
      wheelFolders: makeAction({
        target: this,
        eventType: 'wheel',
        eventOnly: true,
        listenerOptions: false,
        noStates: true,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    this.setEvents(store);
  }
}
