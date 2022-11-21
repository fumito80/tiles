/* eslint-disable import/prefer-default-export */
import { Leaf } from './bookmarks';
import {
  $$, $$byTag, addStyle, hasClass, remeveBookmark, rmStyle, showMenu,
} from './client';
import { setEvents, whichClass } from './common';
import { ISubscribeElement, Store } from './store';

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  #header!: HTMLElement;
  #className!: string;
  #maxWidth!: string;
  $buttons!: HTMLButtonElement[];
  init(className: string, header: HTMLElement) {
    this.#header = header;
    this.#className = className;
    this.$buttons = $$byTag('button', this);
    header.appendChild(this);
    const { width } = header.firstElementChild!.getBoundingClientRect();
    this.style.setProperty('left', `${Math.ceil(width) + 10}px`);
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
              $$<Leaf>('.leafs .selected, .folders .selected').forEach(remeveBookmark);
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
