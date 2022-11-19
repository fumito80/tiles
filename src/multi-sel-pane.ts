/* eslint-disable import/prefer-default-export */
import { Leaf } from './bookmarks';
import {
  $$,
  $$byTag, hasClass, remeveBookmark, showMenu,
} from './client';
import { setEvents, whichClass } from './common';
import { ISubscribeElement, Store } from './store';

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  #header!: HTMLElement;
  #className!: string;
  init(className: string, header: HTMLElement) {
    this.#header = header;
    this.#className = className;
    header.appendChild(this);
    const { width } = header.firstElementChild!.getBoundingClientRect();
    this.style.setProperty('left', `${width + 9}px`);
    setEvents($$byTag('button'), {
      click(e) {
        const buttonClass = whichClass(['del-multi-sel', 'multi-sel-menu-button'] as const, this);
        switch (buttonClass) {
          case 'multi-sel-menu-button': {
            showMenu('leaf-menu')(e);
            e.stopImmediatePropagation();
            break;
          }
          case 'del-multi-sel':
            if (className === 'leafs') {
              $$<Leaf>('.leafs .selected').forEach(remeveBookmark);
            }
            e.stopImmediatePropagation();
            break;
          default:
        }
      },
    }, true);
  }
  show(value: { leafs?: boolean, tabs?: boolean, history?: boolean, all?: boolean }) {
    const [, show] = value.all
      ? [null, true]
      : Object.entries(value).find(([key]) => key === this.#className) || [];
    this.classList.toggle('show', !!show);
    if (value.all) {
      const { width } = this.getBoundingClientRect();
      this.dataset.maxWidth = String(width); // .setProperty('max-width', `${width}px`);
    } else if (hasClass(this, 'pre')) {
      this.style.setProperty('max-width', `${this.dataset.maxWidth}px`);
    }
    this.classList.toggle('pre', !!value.all);
    if (value.all) {
      const { width } = this.getBoundingClientRect();
      this.style.setProperty('max-width', `${width}px`);
    }
    this.#header.classList.toggle('multi-select', !!show);
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
