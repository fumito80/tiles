import {
  $, $byClass, addClass, rmClass,
} from './common';
import { State, InsertPosition } from './types';

type Panes = State['options']['panes'][number];

function dragstart(e: DragEvent) {
  const $target = e.target as HTMLElement;
  addClass('dragging')($target.parentElement);
  addClass('drag-source')($target);
  e.dataTransfer!.effectAllowed = 'move';
}

function dragover(e: DragEvent) {
  const $target = e.target as HTMLElement;
  if (!$target.classList.contains('droppable')) {
    return;
  }
  e.preventDefault();
}

function dragenter(e: DragEvent) {
  const $dragSource = $byClass('drag-source')!;
  const $enterTarget = e.target as HTMLElement;
  if ($dragSource === $enterTarget || !$enterTarget.classList.contains('droppable')) {
    return;
  }
  let position: InsertPosition = 'afterend';
  let [$src, $dest] = [$dragSource, $enterTarget.parentElement!];
  if ($enterTarget.classList.contains('pane-before')) {
    if ($dest.previousElementSibling?.previousElementSibling === $dragSource) {
      [$dest, $src] = [$src, $dest.previousElementSibling as HTMLElement];
    }
  } else if ($enterTarget.classList.contains('pane-after')) {
    if ($dest.nextElementSibling?.nextElementSibling === $dragSource) {
      [$dest, $src] = [$src, $dest.nextElementSibling as HTMLElement];
    }
    position = 'beforebegin';
  }
  $src.insertAdjacentElement(position, $dest);
}

export default class LayoutPanes extends HTMLDivElement {
  #value: Panes[] = [];
  constructor() {
    super();
    this.addEventListener('dragstart', dragstart);
    this.addEventListener('dragover', dragover);
    this.addEventListener('dragenter', dragenter);
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
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // eslint-disable-next-line class-methods-use-this
  get validity() {
    return { valid: true };
  }
}

customElements.define('layout-panes', LayoutPanes, { extends: 'div' });
