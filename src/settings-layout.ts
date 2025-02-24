import type {
  State, InsertPosition, Panes2, PaneNames,
} from './types';
import {
  $, $$, $$byClass, $byClass, $byTag, addClass, getChildren, hasClass, rmClass,
} from './client';
import { isDefined, objectEqaul, updateSettings } from './common';

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

export class LayoutPanes extends CustomInputElement {
  #value: Panes2 = [];
  #dragging = 'dragging';
  #dragEnter = 'drag-enter';
  constructor() {
    super();
    document.body.addEventListener('dragstart', this.dragstart.bind(this));
    document.body.addEventListener('dragover', this.dragover.bind(this));
    document.body.addEventListener('dragenter', this.dragenter.bind(this));
    document.body.addEventListener('dragend', this.dragend.bind(this));
  }
  get value() {
    return this.#value;
  }
  set value(columns: Panes2) {
    columns.forEach((column) => {
      const $column = this.appendChild(document.importNode($('.column', $byTag<HTMLTemplateElement>('template').content)!, true));
      column.slice().reverse().forEach((paneName) => {
        $column.insertAdjacentElement('afterbegin', $(`[data-value="${paneName}"]`)!);
      });
    });
    this.resetAutoWiderElement();
    this.#value = columns;
  }
  resetAutoWiderElement() {
    const $hidden = $byClass('hidden')!;
    const $$columns = $$byClass('column', this);
    $$byClass('auto-wider').forEach(($autoWider) => {
      const $column = $$columns[Number($autoWider.dataset.no) - 1];
      $column?.append($autoWider);
      if (!$column) {
        $hidden.append($autoWider);
      }
    });
  }
  dragstart(e: DragEvent) {
    const $target = e.target as HTMLElement;
    setTimeout(() => {
      addClass('drag-source')($target);
      addClass(this.#dragging)(this);
    }, 1);
    e.dataTransfer!.effectAllowed = 'move';
  }
  // eslint-disable-next-line class-methods-use-this
  dragover(e: DragEvent) {
    e.preventDefault();
  }
  dragenter(e: DragEvent) {
    rmClass(this.#dragEnter)($byClass(this.#dragEnter));
    const $dragSource = $byClass('drag-source')!;
    const $enterTarget = e.target as HTMLElement;
    if ($dragSource === $enterTarget || !hasClass($enterTarget, 'droppable')) {
      return;
    }
    const [$src, $dest] = [$dragSource, $enterTarget.parentElement!];
    if ($src === $dest) {
      return;
    }
    e.preventDefault();
    addClass(this.#dragEnter)($enterTarget);
    if (hasClass($enterTarget, 'pane-top', 'pane-bottom')) {
      const position: InsertPosition = hasClass($enterTarget, 'pane-top') ? 'beforebegin' : 'afterend';
      const $column = $src.parentElement!;
      $dest.insertAdjacentElement(position, $src);
      if (!$('[draggable]', $column)) {
        $byClass('hidden')!.append(...$$byClass('auto-wider', $column)!);
        $column.remove();
      }
      this.resetAutoWiderElement();
      return;
    }
    const position: InsertPosition = hasClass($enterTarget, 'pane-before') ? 'beforebegin' : 'afterend';
    let $column = $src.parentElement!;
    if ($$('[draggable]', $column).length > 1) {
      $column = document.importNode($('.column', $byTag<HTMLTemplateElement>('template').content)!, true);
      $column.prepend($src);
    }
    $dest.insertAdjacentElement(position, $column);
    this.resetAutoWiderElement();
  }
  dragend(e: DragEvent) {
    rmClass(this.#dragEnter)($byClass(this.#dragEnter));
    rmClass(this.#dragging)(this);
    const $target = e.target as HTMLElement;
    rmClass('drag-source')($target);
    const newValue = $$('.column:has([data-value])', this)
      .map(($col) => getChildren($col)
        .map(($el) => ($el as HTMLElement).dataset.value as PaneNames[number])
        .filter(isDefined));
    if (!objectEqaul(newValue, this.value, true)) {
      updateSettings((settings) => ({
        ...settings,
        paneSizes: { ...settings.paneSizes, widths: [], heights: [] },
      }));
      this.#value = newValue;
      $$<HTMLInputElement>('.hidden input[type="checkbox"], .column:last-child input[type="checkbox"], [data-value="bookmarks"]~.auto-wider input[type="checkbox"]').forEach(($el) => {
        // eslint-disable-next-line no-param-reassign
        $el.checked = false;
      });
      this.fireEvent();
    }
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
    return getChildren(this)
      .map((el) => el.dataset.value as BookmarksPanes)
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
