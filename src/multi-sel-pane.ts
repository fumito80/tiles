import { State } from './types';
import { setEvents, whichClass } from './common';
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

export type MultiSelectPaneType = Exclude<keyof NonNullable<Store['actions']['multiSelPanes']['initValue']>, 'all'>;

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  #className!: MultiSelectPaneType;
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
    setEvents($$byTag('button', this), {
      click(e) {
        const buttonClass = whichClass(['del-multi-sel', 'multi-sel-menu-button'] as const, this);
        switch (buttonClass) {
          case 'multi-sel-menu-button':
            showMenu($menu, false)(e);
            e.stopImmediatePropagation();
            break;
          case 'del-multi-sel':
            deleteHandler(getSelecteds());
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
  }
  connect(store: Store) {
    store.subscribe('multiSelPanes', ({ newValue }) => this.show(newValue));
  }
}

export class MutiSelectableItem extends HTMLElement {
  selected = false;
  protected preMultiSel = false;
  protected checkMultiSelect() {
    if (this.preMultiSel) {
      this.preMultiSel = false;
      return true;
    }
    return false;
  }
  preMultiSelect(isBegin: boolean) {
    this.preMultiSel = true;
    this.classList.toggle('selected', isBegin);
  }
  select(selected?: boolean) {
    if (this.checkMultiSelect()) {
      return false;
    }
    const isSelected = selected ?? !this.classList.contains('selected');
    this.classList.toggle('selected', isSelected);
    this.selected = isSelected;
    return isSelected;
  }
}

export abstract class PaneHeader extends HTMLDivElement implements IPubSubElement {
  private includeUrl!: boolean;
  private $mainMenu!: HTMLElement;
  protected $multiSelPane!: MultiSelPane;
  protected $popupMenu!: PopupMenu;
  abstract menuClickHandler(e: MouseEvent): void;
  abstract multiSelPaneParams: {
    className: MultiSelectPaneType,
    deleteHandler: ($selecteds: HTMLElement[]) => void,
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(settings: State['settings'], $tmplMultiSelPane: MultiSelPane, _?: any) {
    this.$mainMenu = $byClass('main-menu', this)!;
    this.includeUrl = settings.includeUrl;
    this.$mainMenu.addEventListener('mousedown', (e) => e.preventDefault());
    const $menu = $byClass('main-menu', this)!;
    $byClass('main-menu-button', this)?.addEventListener('click', showMenu($menu, false));
    this.$multiSelPane = document.importNode($tmplMultiSelPane, true);
    this.$popupMenu = $byTag('popup-menu', this);
    if (!(this.$popupMenu instanceof PopupMenu)) {
      throw new Error('No popup found');
    }
    this.$popupMenu.init(this.menuClickHandler.bind(this));
    const { className, deleteHandler } = this.multiSelPaneParams;
    this.$multiSelPane.init(className, this, this.$popupMenu, deleteHandler);
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
      };
    }
    return {};
  }
  connect(store: Store) {
    this.$multiSelPane.connect(store);
    if (!hasClass(this, 'end')) {
      return;
    }
    store.subscribe('clickMainMenu', (_, __, dispatch, e) => clickMainMenu(e, dispatch));
  }
}
