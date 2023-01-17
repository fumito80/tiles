import {
  ColorPalette, Options, Panes, State,
} from './types';
import {
  $$byClass, $$byTag, $byClass, $byTag, addAttr, hasClass, rmClass,
  addBookmark, addClass, addFolder, changeColorTheme, getChildren, setFavColorMenu, showMenu,
} from './client';
import {
  Changes, Dispatch, IPubSubElement, ISubscribeElement, makeAction, Store, StoreSub,
} from './popup';
import { getLocal, pick } from './common';

export function getSelecteds() {
  return $$byClass('selected');
}

function clickMainMenu(e: MouseEvent, store: Store) {
  const $menu = e.target as HTMLElement;
  switch ($menu.dataset.value) {
    case 'add-bookmark': {
      const id = $byClass('open')?.id;
      addBookmark(id || '1');
      break;
    }
    case 'start-multi-select':
      store.getStates('multiSelPanes').then(({ all }) => !all).then((all) => {
        store.dispatch('multiSelPanes', { all });
        if (!all) {
          store.dispatch('focusQuery');
        }
      });
      break;
    case 'add-folder':
      addFolder();
      break;
    case 'settings':
      chrome.runtime.openOptionsPage();
      break;
    default:
  }
  if (hasClass($menu, 'fav-palette')) {
    const colorPalette = getChildren($menu).map(($el) => $el.dataset.color) as ColorPalette;
    changeColorTheme(colorPalette).then(() => setFavColorMenu(colorPalette));
  }
}

export class PopupMenu extends HTMLElement {
  init(menuClickHandler: (e: MouseEvent) => void) {
    this.addEventListener('click', menuClickHandler);
    this.addEventListener('mousedown', (e) => e.preventDefault());
  }
}

function getElementWidth($el: HTMLElement) {
  const styles = getComputedStyle($el);
  const props = pick('width', 'marginLeft', 'marginRight', 'paddingLeft', 'paddingRight')(styles);
  return Object.values(props)
    .reduce((acc, value) => acc + Number.parseFloat(String(value)), 0) || 0;
}

export class MultiSelPane extends HTMLElement implements ISubscribeElement {
  // eslint-disable-next-line no-use-before-define
  #header!: MulitiSelectablePaneHeader;
  $count!: HTMLElement;
  $buttons!: HTMLButtonElement[];
  $icon!: HTMLButtonElement;
  // eslint-disable-next-line no-use-before-define
  init(header: MulitiSelectablePaneHeader, $menu: HTMLElement) {
    this.#header = header;
    this.$buttons = $$byTag('button', this);
    this.$count = $byClass('count-selected', this)!;
    this.$icon = $byClass('icon-check-all', this)!;
    const $deletesButton = $byClass('del-multi-sel', this);
    addAttr('title', header.multiDeletesTitle)($deletesButton);
    header.insertAdjacentElement('afterbegin', this);
    $byClass('multi-sel-menu-button', this)?.addEventListener('click', (e) => {
      showMenu($menu, true)(e);
      e.stopImmediatePropagation();
    }, true);
  }
  show({ newValue }: {
    newValue: {
      leafs?: boolean, tabs?: boolean, history?: boolean, all?: boolean,
    }
  }) {
    const { all } = newValue;
    const [, show] = Object.entries(newValue).find(([key]) => key === this.#header.paneName) || [];
    if (!show && !all) {
      this.$count.textContent = '';
      rmClass('show')(this);
      this.style.setProperty('max-width', '0');
      return;
    }
    if (all) {
      this.$count.textContent = '';
      addClass('show', 'pre')(this);
      const { height } = this.$icon.getBoundingClientRect();
      this.style.setProperty('max-width', `${height}px`);
      return;
    }
    if (show) {
      rmClass('pre')(this);
      addClass('show')(this);
    }
  }
  selectItems(count: number, dispatch: Dispatch) {
    this.$count.textContent = String(count);
    if (count === 0) {
      dispatch('multiSelPanes', {
        bookmarks: false, tabs: false, histories: false, all: true,
      }, true);
      return;
    }
    this.$count.textContent = String(count);
    rmClass('pre')(this);
    const maxWidth = ([...this.children] as HTMLElement[])
      .map(getElementWidth)
      .reduce((acc, width) => acc + width, 0);
    this.style.setProperty('max-width', `${Math.ceil(maxWidth)}px`);
  }
  connect(store: Store) {
    store.subscribe('multiSelPanes', this.show.bind(this));
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
  select(selected?: boolean, force = false) {
    if (!force && this.checkMultiSelect()) {
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
  private showMenu!: Function;
  protected $multiSelPane!: MultiSelPane;
  abstract menuClickHandler(e: MouseEvent): void;
  readonly abstract multiDeletesTitle: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(settings: State['settings'], _: Options, $tmplMultiSelPane: MultiSelPane, _others?: any) {
    this.includeUrl = settings.includeUrl;
    this.$mainMenu = $byClass('main-menu', this)!;
    this.showMenu = showMenu(this.$mainMenu, true);
    $byClass('main-menu-button', this)?.addEventListener('click', (e) => {
      this.$mainMenu.classList.toggle('show');
      if (hasClass(this.$mainMenu, 'show')) {
        showMenu(this.$mainMenu, true)(e);
        getLocal('options').then(({ options }) => setFavColorMenu(options.colorPalette));
      }
    });
    this.$multiSelPane = document.importNode($tmplMultiSelPane, true);
    const $popupMenu = $byTag('popup-menu', this);
    if (!($popupMenu instanceof PopupMenu)) {
      throw new Error('No popup found');
    }
    $popupMenu.init(this.menuClickHandler.bind(this));
    this.$multiSelPane.init(this, $popupMenu);
  }
  selectItems({ newValue }: Changes<'selectItems'>, _: any, __: any, store: StoreSub) {
    if (newValue?.paneName !== this.paneName) {
      return;
    }
    this.$multiSelPane.selectItems(newValue.count, store.dispatch);
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
    this.$mainMenu.addEventListener('click', (e) => clickMainMenu(e, store));
    store.subscribe('selectItems', this.selectItems.bind(this));
  }
}

export abstract class MulitiSelectablePaneBody extends HTMLDivElement {
  protected timerMultiSelect!: number;
  abstract paneName: Panes;
  abstract deletesHandler(selectds: HTMLElement[], dispatch: Dispatch): void;
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
  preDeletesHandler({ newValue }: { newValue: Panes }, _: any, __: any, store: StoreSub) {
    if (newValue === this.paneName) {
      this.deletesHandler(getSelecteds(), store.dispatch);
    }
  }
  mouseupItem() {
    clearTimeout(this.timerMultiSelect);
  }
  connect(store: Store) {
    store.subscribe('deleteSelecteds', this.preDeletesHandler.bind(this));
  }
}
