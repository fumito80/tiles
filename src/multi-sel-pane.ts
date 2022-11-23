/* eslint-disable import/prefer-default-export */
// import { Leaf } from './bookmarks';
import { PopupMenu } from './bookmarks';
import {
  $$byClass, $$byTag, addStyle, hasClass, rmStyle, showMenu,
} from './client';
import { setEvents, whichClass } from './common';
// import { dropBmInNewWindow } from './drag-drop';
import { ISubscribeElement, Store } from './store';
// import { OpenBookmarkType, Options } from './types';

export function getSelecteds() {
  return $$byClass('selected');
}

export type MultiSelectPaneType = Exclude<keyof NonNullable<Store['actions']['multiSelPanes']['initValue']>, 'all'>;

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  #className!: string;
  #header!: HTMLElement;
  #maxWidth!: string;
  $buttons!: HTMLButtonElement[];
  init(
    className: MultiSelectPaneType,
    header: HTMLElement,
    $menu: PopupMenu,
    deleteHandler: ($selecteds: HTMLElement[]) => void,
  ) {
    this.#className = className;
    this.#header = header;
    this.$buttons = $$byTag('button', this);
    header.appendChild(this);
    const { width } = header.firstElementChild!.getBoundingClientRect();
    this.style.setProperty('left', `${Math.ceil(width) + 10}px`);
    setEvents($$byTag('button', this), {
      click(e) {
        const buttonClass = whichClass(['del-multi-sel', 'multi-sel-menu-button'] as const, this);
        switch (buttonClass) {
          case 'multi-sel-menu-button':
            showMenu($menu)(e);
            e.stopImmediatePropagation();
            break;
          case 'del-multi-sel':
            // if (className === 'leafs') {
            //   getSelecteds().forEach(remeveBookmark);
            // }
            deleteHandler(getSelecteds());
            e.stopImmediatePropagation();
            break;
          default:
        }
      },
    }, true);
    // setEvents([$byClass('multi-sel-menu')!], {
    //   click(e) {
    //     const $target = e.target as HTMLElement;
    //     if ($target.closest('multi-sel-pane') !== this) {
    //       return;
    //     }
    //     switch ($target.dataset.value) {
    //       case 'open-new-tab': {
    //         getSelecteds().reverse()
    //           .forEach(($leaf) => $leaf.openBookmark(options, OpenBookmarkType.tab));
    //         break;
    //       }
    //       case 'open-incognito':
    //       case 'open-new-window': {
    //         const selecteds = getSelecteds().map(prop('id'));
    //         dropBmInNewWindow(selecteds, 'leaf', $target.dataset.value === 'open-incognito');
    //         break;
    //       }
    //       default:
    //     }
    //   },
    //   mousedown(e) {
    //     e.preventDefault();
    //   },
    // }, false, this);
  }
  show(value: { leafs?: boolean, tabs?: boolean, history?: boolean, all?: boolean }) {
    const [, show] = value.all
      ? [null, true]
      : Object.entries(value).find(([key]) => key === this.#className) || [];
    const isPre = !!value.all;
    const isShow = !!show;
    if (isPre && this.$buttons[0]?.style.display !== 'none') {
      const { width } = this.getBoundingClientRect();
      this.#maxWidth = `${String(Math.ceil(width))}px`;
    }
    if (isPre) {
      this.$buttons.forEach(addStyle({ display: 'none' }));
    } else if (isShow) {
      this.$buttons.forEach(rmStyle('display'));
    }
    this.classList.toggle('show', isShow);
    if (!isPre && hasClass(this, 'pre')) {
      this.style.setProperty('max-width', this.#maxWidth);
    }
    this.classList.toggle('pre', isPre);
    if (isPre) {
      const rect = this.getBoundingClientRect();
      this.style.setProperty('max-width', `${Math.ceil(rect.width)}px`);
    }
    this.#header.classList.toggle('multi-select', isShow);
  }
  connect(store: Store) {
    store.subscribe('multiSelPanes', ({ newValue }) => this.show(newValue));
  }
}
