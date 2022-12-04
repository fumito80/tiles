import { Panes, State } from './types';
import {
  $$byClass, $$byTag, $byClass, $byTag,
  addBookmark, addClass, addFolder, addStyle, hasClass, rmClass, rmStyle, showMenu,
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
  #header!: MulitiSelectablePaneHeader;
  #maxWidth!: string;
  $count!: HTMLElement;
  $buttons!: HTMLButtonElement[];
  // eslint-disable-next-line no-use-before-define
  init(header: MulitiSelectablePaneHeader, $menu: HTMLElement) {
    this.#header = header;
    this.$buttons = $$byTag('button', this);
    this.$count = $byClass('count-selected', this)!;
    header.insertAdjacentElement('afterbegin', this);
    $byClass('multi-sel-menu-button', this)?.addEventListener('click', (e) => {
      showMenu($menu, true)(e);
      e.stopImmediatePropagation();
    }, true);
  }
  show(value: { leafs?: boolean, tabs?: boolean, history?: boolean, all?: boolean }) {
    const { all } = value;
    const [, show] = Object.entries(value).find(([key]) => key === this.#header.paneName) || [];
    if (!show && !all) {
      this.$count.textContent = '';
      rmClass('show', 'pre')(this);
      this.style.removeProperty('max-width');
      return;
    }
    if (all) {
      this.$buttons.forEach(rmStyle('display'));
      addClass('show')(this);
      const { width } = this.getBoundingClientRect();
      this.#maxWidth = `${String(Math.ceil(width))}px`;
      addClass('pre')(this);
      const rect = this.getBoundingClientRect();
      this.style.setProperty('max-width', `${Math.ceil(rect.width)}px`);
      this.$buttons.forEach(addStyle({ display: 'none' }));
      return;
    }
    if (show) {
      if (hasClass(this, 'pre')) {
        this.style.setProperty('max-width', this.#maxWidth);
      }
      rmClass('pre')(this);
      addClass('show')(this);
      this.$buttons.forEach(rmStyle('display'));
    }
  }
  selectItems(count: number) {
    this.$count.textContent = String(count);
    if (this.$buttons[0]?.style.display === 'none') {
      const { maxWidth } = this.style;
      this.style.removeProperty('max-width');
      this.$buttons.forEach(rmStyle('display'));
      const { width } = this.getBoundingClientRect();
      this.$buttons.forEach(addStyle({ display: 'none' }));
      this.style.setProperty('max-width', maxWidth);
      this.#maxWidth = `${String(Math.ceil(width))}px`;
    }
  }
  connect(store: Store) {
    store.subscribe('multiSelPanes', ({ newValue }) => this.show(newValue));
    $byClass('del-multi-sel', this)?.addEventListener('click', (e) => {
      store.dispatch('deleteSelecteds', this.#header.paneName, true);
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

export abstract class MulitiSelectablePaneHeader extends HTMLDivElement implements IPubSubElement {
  abstract paneName: Panes;
  private includeUrl!: boolean;
  private $mainMenu!: HTMLElement;
  protected $multiSelPane!: MultiSelPane;
  abstract menuClickHandler(e: MouseEvent): void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(settings: State['settings'], $tmplMultiSelPane: MultiSelPane, _?: any) {
    this.$mainMenu = $byClass('main-menu', this)!;
    this.includeUrl = settings.includeUrl;
    $byClass('main-menu-button', this)?.addEventListener('click', showMenu(this.$mainMenu, true));
    this.$mainMenu.addEventListener('mousedown', (e) => e.preventDefault());
    this.$multiSelPane = document.importNode($tmplMultiSelPane, true);
    const $popupMenu = $byTag('popup-menu', this);
    if (!($popupMenu instanceof PopupMenu)) {
      throw new Error('No popup found');
    }
    $popupMenu.init(this.menuClickHandler.bind(this));
    this.$multiSelPane.init(this, $popupMenu);
  }
  selectItems(newValue: Store['actions']['selectItems']['initValue']) {
    if (newValue?.paneName !== this.paneName) {
      return;
    }
    this.$multiSelPane.selectItems(newValue.count);
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
        deleteSelecteds: makeAction({
          initValue: '' as Panes,
          force: true,
        }),
      };
    }
    return {};
  }
  connect(store: Store) {
    this.$multiSelPane.connect(store);
    this.$mainMenu.addEventListener('click', (e) => clickMainMenu(e, store.dispatch));
    store.subscribe('selectItems', (changes) => this.selectItems(changes.newValue));
  }
}

export abstract class MulitiSelectablePaneBody extends HTMLDivElement {
  abstract paneName: Panes;
  abstract deletesHandler(selectds: HTMLElement[], store: Store): void;
  actions() {
    return {
      selectItems: makeAction({
        initValue: {
          count: 0,
          paneName: this.paneName,
        },
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('deleteSelecteds', (changes) => {
      if (changes.newValue === this.paneName) {
        this.deletesHandler(getSelecteds(), store);
      }
    });
  }
}
