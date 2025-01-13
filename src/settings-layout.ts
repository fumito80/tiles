import { State, InsertPosition } from './types';
import {
  $, $byClass, addClass, hasClass, rmClass,
} from './client';
import { isDefined } from './common';

export abstract class CustomInputElement extends HTMLElement {
  fireEvent() {
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // eslint-disable-next-line class-methods-use-this
  get validity() {
    return { valid: true };
  }
  abstract value: any;
}

type Panes = State['options']['panes'][number];

function dragstart(e: DragEvent) {
  const $target = e.target as HTMLElement;
  addClass('drag-source')($target);
  addClass('dragging')($target.parentElement);
  e.dataTransfer!.effectAllowed = 'move';
}

export class LayoutPanes extends CustomInputElement {
  #value: Panes[] = [];
  #leaveTimer = null as unknown as ReturnType<typeof setTimeout>;
  constructor() {
    super();
    this.addEventListener('dragstart', dragstart);
    this.addEventListener('dragover', this.dragover);
    this.addEventListener('dragenter', this.dragenter);
    this.addEventListener('dragleave', this.dragleave);
    this.addEventListener('dragend', this.dragend);
    this.addEventListener('drop', this.drop);
  }
  get value() {
    return this.#value;
  }
  set value(value: Panes[]) {
    [...this.children].forEach((el, i) => {
      const index = value.findIndex((name) => name === (el as HTMLElement).dataset.value);
      const $checkZenMode = $<HTMLInputElement>('input[type="checkbox"]', el);
      if ($checkZenMode) {
        $checkZenMode.disabled = index === this.childElementCount - 1;
      }
      if (i === index) {
        return;
      }
      this.insertBefore(el, this.children[index]);
    });
    this.#value = value;
  }
  dragover(e: DragEvent) {
    if (!hasClass(e.target as HTMLElement, 'droppable')) {
      return;
    }
    clearTimeout(this.#leaveTimer);
    e.preventDefault();
  }
  dragenter(e: DragEvent) {
    const $dragSource = $byClass('drag-source')!;
    const $enterTarget = e.target as HTMLElement;
    if ($dragSource === $enterTarget || !hasClass($enterTarget, 'droppable')) {
      return;
    }
    const [$src, $dest] = [$dragSource, $enterTarget.parentElement!];
    if ($src === $dest) {
      return;
    }
    clearTimeout(this.#leaveTimer);
    const position: InsertPosition = hasClass($enterTarget, 'pane-before') ? 'beforebegin' : 'afterend';
    $dest.insertAdjacentElement(position, $src);
  }
  dragleave() {
    clearTimeout(this.#leaveTimer);
    this.#leaveTimer = setTimeout(() => {
      this.value = this.#value;
    }, 200);
  }
  dragend(e: DragEvent) {
    const $target = e.target as HTMLElement;
    rmClass('drag-source')($target);
    rmClass('dragging')($target.parentElement);
    if (e.dataTransfer?.dropEffect === 'none') {
      this.value = this.#value;
    }
  }
  drop() {
    const newValue = [...this.children].map((el) => (el as HTMLElement).dataset.value!) as Panes[];
    if (this.value === newValue) {
      return;
    }
    this.value = newValue;
    this.fireEvent();
  }
}

type BookmarksPanes = State['options']['bookmarksPanes'][number];
export class LayoutBookmarksPanes extends CustomInputElement {
  #btnFlip!: HTMLButtonElement;
  constructor() {
    super();
    this.#btnFlip = this.querySelector('.btn-flip-bm')!;
    this.#btnFlip.addEventListener('click', this.flipBmPanes.bind(this));
  }
  get value() {
    return [...this.children]
      .map((el) => (el as HTMLElement).dataset.value as BookmarksPanes)
      .filter(isDefined);
  }
  set value(value: BookmarksPanes[]) {
    const leftEl = this.firstElementChild as HTMLElement;
    const [leftValue] = value;
    if (leftEl.dataset.value !== leftValue) {
      this.flipBmPanes();
    }
  }
  flipBmPanes() {
    this.#btnFlip.previousElementSibling!.insertAdjacentElement('beforebegin', this.#btnFlip.nextElementSibling!);
    this.#btnFlip.insertAdjacentElement('afterend', this.#btnFlip.previousElementSibling!);
    this.fireEvent();
  }
}

customElements.define('layout-panes', LayoutPanes);
customElements.define('layout-bm-panes', LayoutBookmarksPanes);
