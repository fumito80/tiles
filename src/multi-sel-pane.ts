import { Panes, State } from './types';
import {
  $$byClass, $$byTag, $byClass, $byTag,
  addBookmark, addFolder, addStyle, hasClass, rmStyle, showMenu,
} from './client';
import {
  Dispatch, IPubSubElement, ISubscribeElement, makeAction, Store,
} from './store';

export function getSelecteds() {
  return $$byClass('selected');
}

function clickMainMenu(e: MouseEvent, dispatch: Dispatch) {
  const $menu = e.target as HTMLElement;
  switch ($menu.dataset.value) {
    case 'add-bookmark': {
      const id = $byClass('open')?.id;
      addBookmark(id || '1');
      break;
    }
    case 'start-multi-select':
      dispatch('multiSelPanes', { all: true });
      break;
    case 'add-folder':
      addFolder();
      break;
    case 'settings':
      chrome.runtime.openOptionsPage();
      break;
    default:
  }
}

export class PopupMenu extends HTMLElement {
  init(menuClickHandler: (e: MouseEvent) => void) {
    this.addEventListener('click', menuClickHandler);
    this.addEventListener('mousedown', (e) => e.preventDefault());
  }
}

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  // eslint-disable-next-line no-use-before-define
  #header!: PaneHeader;
  #maxWidth!: string;
  $buttons!: HTMLButtonElement[];
  // eslint-disable-next-line no-use-before-define
  init(header: PaneHeader, $menu: HTMLElement) {
    this.#header = header;
    this.$buttons = $$byTag('button', this);
    header.appendChild(this);
    $byClass('multi-sel-menu-button', this)?.addEventListener('click', (e) => {
      showMenu($menu, false)(e);
      e.stopImmediatePropagation();
    }, true);
  }
  show(value: { leafs?: boolean, tabs?: boolean, history?: boolean, all?: boolean }) {
    const [, show] = value.all
      ? [null, true]
      : Object.entries(value).find(([key]) => key === this.#header.paneName) || [];
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
    $byClass('del-multi-sel', this)?.addEventListener('click', (e) => {
      store.dispatch('deleteSelecteds', this.#header.paneName);
      e.stopImmediatePropagation();
    }, true);
  }
}

export class MutiSelectableItem extends HTMLElement {
  private isSelected = false;
  protected preMultiSel = false;
  checkMultiSelect() {
    if (this.preMultiSel) {
      this.preMultiSel = false;
      return true;
    }
    return false;
  }
  get selected() {
    return this.isSelected;
  }
  preMultiSelect(isBegin: boolean) {
    this.preMultiSel = true;
    this.isSelected = isBegin;
    this.classList.toggle('selected', isBegin);
  }
  select(selected?: boolean) {
    if (this.checkMultiSelect()) {
      return this.isSelected;
    }
    const isSelected = selected ?? !this.classList.contains('selected');
    this.classList.toggle('selected', isSelected);
    this.isSelected = isSelected;
    return isSelected;
  }
}

export abstract class PaneHeader extends HTMLDivElement implements IPubSubElement {
  private includeUrl!: boolean;
  private $mainMenu!: HTMLElement;
  protected $multiSelPane!: MultiSelPane;
  abstract menuClickHandler(e: MouseEvent): void;
  abstract paneName: Panes;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(settings: State['settings'], $tmplMultiSelPane: MultiSelPane, _?: any) {
    this.$mainMenu = $byClass('main-menu', this)!;
    this.includeUrl = settings.includeUrl;
    this.$mainMenu.addEventListener('mousedown', (e) => e.preventDefault());
    const $menu = $byClass('main-menu', this)!;
    $byClass('main-menu-button', this)?.addEventListener('click', showMenu($menu, false));
    this.$multiSelPane = document.importNode($tmplMultiSelPane, true);
    const $popupMenu = $byTag('popup-menu', this);
    if (!($popupMenu instanceof PopupMenu)) {
      throw new Error('No popup found');
    }
    $popupMenu.init(this.menuClickHandler.bind(this));
    this.$multiSelPane.init(this, $popupMenu);
  }
  actions() {
    if (hasClass(this, 'end')) {
      return {
        setIncludeUrl: makeAction({
          initValue: this.includeUrl,
          persistent: true,
          target: $byClass('include-url', this.$mainMenu),
          eventType: 'click',
          eventProcesser: (_, currentValue) => !currentValue,
        }),
        clickMainMenu: makeAction({
          target: this.$mainMenu,
          eventType: 'click',
          eventOnly: true,
        }),
        deleteSelecteds: makeAction({
          initValue: '' as Panes,
        }),
      };
    }
    return {};
  }
  connect(store: Store) {
    this.$multiSelPane.connect(store);
    if (!hasClass(this, 'end')) {
      return;
    }
    store.subscribe('clickMainMenu', (_, e) => clickMainMenu(e, store.dispatch));
  }
}

export abstract class MulitiSelectablePaneBody extends HTMLDivElement {
  abstract paneName: Panes;
  abstract deletesHandler(selectds: HTMLElement[], store: Store): void;
  connect(store: Store) {
    store.subscribe('deleteSelecteds', (changes) => {
      if (changes.newValue === this.paneName) {
        this.deletesHandler(getSelecteds(), store);
      }
    });
  }
}
