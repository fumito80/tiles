/* eslint-disable import/prefer-default-export */
import { Leaf } from './bookmarks';
import {
  $$, $$byTag, addStyle, hasClass, remeveBookmark, rmStyle, showMenu,
} from './client';
import { prop, setEvents, whichClass } from './common';
import { dropBmInNewWindow } from './drag-drop';
import { ISubscribeElement, Store } from './store';
import { OpenBookmarkType, Options } from './types';

function getSelecteds() {
  return $$<Leaf>('.leafs .selected, .folders .selected');
}

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  #className!: string;
  #header!: HTMLElement;
  #options!: Options;
  #maxWidth!: string;
  $buttons!: HTMLButtonElement[];
  init(className: string, header: HTMLElement, options: Options) {
    this.#className = className;
    this.#header = header;
    this.#options = options;
    this.$buttons = $$byTag('button', this);
    header.appendChild(this);
    const { width } = header.firstElementChild!.getBoundingClientRect();
    this.style.setProperty('left', `${Math.ceil(width) + 10}px`);
    setEvents($$byTag('button'), {
      click(e) {
        const buttonClass = whichClass(['del-multi-sel', 'multi-sel-menu-button'] as const, this);
        switch (buttonClass) {
          case 'multi-sel-menu-button':
            showMenu('leaf-menu')(e);
            break;
          case 'del-multi-sel':
            if (className === 'leafs') {
              getSelecteds().forEach(remeveBookmark);
            }
            break;
          default:
        }
        e.stopImmediatePropagation();
      },
    }, true);
    this.addEventListener('click', (e) => {
      const $target = e.target as HTMLElement;
      switch ($target.dataset.value) {
        case 'open-new-tab': {
          getSelecteds().reverse()
            .forEach(($leaf) => $leaf.openBookmark(this.#options, OpenBookmarkType.tab));
          break;
        }
        case 'open-incognito':
        case 'open-new-window': {
          const selecteds = getSelecteds().map(prop('id'));
          dropBmInNewWindow(selecteds, 'leaf', $target.dataset.value === 'open-incognito');
          break;
        }
        default:
      }
    });
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
    // if (this.#className === 'leafs' && show) {
    //   const $leafs = $byClass('leafs');
    //   if (hasClass($leafs.nextElementSibling, 'folders')) {
    //     const { width } = $leafs.getBoundingClientRect();
    //     this.style.setProperty('left', `${width - this.offsetWidth}px`);
    //     this.style.setProperty('right', 'unset');
    //   }
    // }
  }
  connect(store: Store) {
    store.subscribe('multiSelPanes', ({ newValue }) => this.show(newValue));
  }
}
