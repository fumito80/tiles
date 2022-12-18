import {
  $, $$, $$byClass, $byClass,
  addClass, rmClass, hasClass, addStyle,
  addBookmark, getBookmark,
  setAnimationClass, editTitle, createNewTab, remeveBookmark, getMessageDeleteSelecteds,
} from './client';
import {
  cbToResolve, cssid, curry3, extractUrl, getCurrentTab, setEvents, setFavicon, switches,
  delayMultiSelect, extractDomain, prop,
} from './common';
import { dialog } from './dialogs';
import { dropBmInNewWindow } from './drag-drop';
import {
  getSelecteds,
  MulitiSelectablePaneBody, MultiSelPane, MutiSelectableItem, MulitiSelectablePaneHeader,
} from './multi-sel-pane';
import { ISearchable, SearchParams } from './search';
import {
  ISubscribeElement, makeAction, Store, Dispatch, States,
} from './store';
import {
  MulitiSelectables, OpenBookmarkType, Options, State,
} from './types';

export class Leaf extends MutiSelectableItem {
  updateTitle(title: string) {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', title);
    $anchor.textContent = title;
  }
  updateAnchor({ title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
    setFavicon(url!)(this);
    this.updateTitle(title);
  }
  openOrFind(options: Options) {
    if (this.checkMultiSelect()) {
      return;
    }
    (options.findTabsFirst ? this.findInTabsBookmark : this.openBookmark).bind(this)(options);
  }
  async openBookmark(
    options: Options,
    openType: keyof typeof OpenBookmarkType = OpenBookmarkType.tab,
  ) {
    const { url } = await getBookmark(this.id);
    switch (openType) {
      case OpenBookmarkType.tab: {
        createNewTab(options, url!);
        break;
      }
      case OpenBookmarkType.window:
      case OpenBookmarkType.incognito: {
        const incognito = openType === OpenBookmarkType.incognito;
        chrome.windows.create({ url, incognito }, window.close);
        break;
      }
      case OpenBookmarkType.current:
        getCurrentTab().then(({ id }) => chrome.tabs.update(id!, { url }, window.close));
        break;
      default:
    }
  }
  async findInTabsBookmark(options: Options) {
    const { url = '' } = await getBookmark(this.id);
    const [schemeSrc, domainSrc] = extractDomain(url);
    const finder = options.findTabsMatches === 'prefix'
      ? (tab: chrome.tabs.Tab) => !!tab.url?.startsWith(url)
      : (tab: chrome.tabs.Tab) => {
        const [scheme, domain] = extractDomain(tab.url);
        return domain === domainSrc && scheme === schemeSrc;
      };
    const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        chrome.windows.getCurrent((win) => {
          const findIndex = tabs.findIndex((t) => t.active && t.windowId === win.id);
          const sorted = [
            ...tabs.slice(findIndex + 1),
            ...tabs.slice(0, findIndex + 1),
          ];
          const firstTab = sorted.find(finder);
          resolve(firstTab);
        });
      });
    });
    if (tab?.id == null) {
      this.openBookmark(options);
      return;
    }
    chrome.windows.update(tab.windowId, { focused: true });
    chrome.tabs.update(tab.id, { active: true }, window.close);
  }
  async editBookmarkTitle() {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    const title = await editTitle($anchor, this.id, false, true);
    if (!title) {
      return;
    }
    this.updateTitle(title);
    if (this.closest('.folders')) {
      ($(`.leafs ${cssid(this.id)}`) as Leaf).updateTitle(title);
    }
    setAnimationClass('hilite')(this);
  }
}

export class HeaderLeafs extends MulitiSelectablePaneHeader {
  readonly paneName = 'bookmarks';
  private $pinBookmark!: HTMLElement;
  private options!: Options;
  readonly multiDeletesTitle = 'Delete selected bookmarks';
  override init(settings: State['settings'], $tmplMultiSelPane: MultiSelPane, options: Options) {
    super.init(settings, $tmplMultiSelPane);
    this.$pinBookmark = $byClass('pin-bookmark', this)!;
    this.$pinBookmark.addEventListener('click', () => addBookmark());
    this.options = options;
  }
  override connect(store: Store) {
    super.connect(store);
  }
  menuClickHandler(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    switch ($target.dataset.value) {
      case 'open-new-tab': {
        getSelecteds().reverse()
          .filter(($el): $el is Leaf => $el instanceof Leaf)
          .forEach((leaf) => leaf.openBookmark(this.options, OpenBookmarkType.tab));
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
  }
}

function setLeafMenu($leafMenu: HTMLElement, options: Options) {
  setEvents([$leafMenu], {
    async click(e) {
      const $leaf = (e.target as HTMLElement)
        ?.parentElement?.previousElementSibling?.parentElement;
      if (!($leaf instanceof Leaf)) {
        return;
      }
      switch ((e.target as HTMLElement).dataset.value) {
        case 'find-in-tabs': {
          $leaf.findInTabsBookmark(options);
          break;
        }
        case 'open-new-tab':
          $leaf.openBookmark(options);
          break;
        case 'open-in-current-tab':
          $leaf.openBookmark(options, OpenBookmarkType.current);
          break;
        case 'open-new-window':
          $leaf.openBookmark(options, OpenBookmarkType.window);
          break;
        case 'open-incognito':
          $leaf.openBookmark(options, OpenBookmarkType.incognito);
          break;
        case 'edit-title': {
          $leaf.editBookmarkTitle();
          break;
        }
        case 'edit-url': {
          const { url = '', title } = await getBookmark($leaf.id);
          // eslint-disable-next-line no-alert
          const value = prompt(`[Edit URL]\n${title}`, url);
          if (value == null) {
            break;
          }
          await cbToResolve(curry3(chrome.bookmarks.update)($leaf.id)({ url: value }));
          $leaf.updateAnchor({ title, url: value });
          setAnimationClass('hilite')($leaf);
          break;
        }
        case 'remove':
          remeveBookmark($leaf);
          break;
        case 'show-in-folder': {
          const id = $leaf.parentElement?.id;
          const $target = $(`.folders ${cssid(id!)} > .marker > .title`);
          if (!$target) {
            break;
          }
          $target.click();
          $target.focus();
          setTimeout(() => {
            ($leaf.firstElementChild as HTMLAnchorElement).focus();
            ($leaf as any).scrollIntoViewIfNeeded();
            setAnimationClass('hilite')($leaf);
          }, 100);
          break;
        }
        default:
      }
      ($leaf.firstElementChild?.nextElementSibling as HTMLElement).blur();
    },
    mousedown(e) {
      e.preventDefault();
    },
  });
}

export class Leafs extends MulitiSelectablePaneBody implements ISubscribeElement, ISearchable {
  readonly paneName = 'bookmarks';
  #options!: Options;
  $leafMenu!: HTMLElement;
  $lastClickedLeaf!: Leaf | undefined;
  private matchedTabLeafId!: string | undefined;
  init(options: Options) {
    this.#options = options;
    this.$leafMenu = $byClass('leaf-menu')!;
    setLeafMenu(this.$leafMenu, options);
  }
  selectItems(dispatch: Dispatch, precount?: number) {
    const count = precount ?? $$('.leafs .selected, .folders .selected').length;
    dispatch('selectItems', { paneName: this.paneName, count }, true);
  }
  selectWithShift($target: Leaf) {
    if (
      this.$lastClickedLeaf !== $target
      && this.$lastClickedLeaf?.parentElement === $target.parentElement
    ) {
      const leafs = [] as Leaf[];
      let started = false;
      for (
        let next = $target.parentElement?.firstElementChild as Leaf | Element | null;
        next != null;
        next = next.nextElementSibling
      ) {
        if (next === $target || next === this.$lastClickedLeaf) {
          if (started) {
            leafs.push(next as Leaf);
            break;
          }
          started = true;
        }
        if (started && next instanceof Leaf) {
          leafs.push(next);
        }
      }
      leafs.forEach(($leaf) => $leaf.select(true));
    }
  }
  // eslint-disable-next-line class-methods-use-this
  async deletesHandler($selecteds: HTMLElement[], store: Store) {
    if ($selecteds.length === 0) {
      return;
    }
    const ret = await dialog.confirm(getMessageDeleteSelecteds($selecteds.length));
    if (!ret) {
      return;
    }
    const removes = $selecteds
      .filter(($el): $el is Leaf => $el instanceof Leaf)
      .map(remeveBookmark);
    Promise.all(removes).then(() => this.selectItems(store.dispatch));
  }
  multiSelectLeafs({ bookmarks: multiSelect }: MulitiSelectables) {
    if (!multiSelect) {
      $$('.leafs .selected, .folders .selected')
        .filter(($el): $el is Leaf => $el instanceof Leaf && $el.selected)
        .forEach(($leaf) => $leaf.select(false, true));
      this.$lastClickedLeaf = undefined;
    }
  }
  mousedownItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLDivElement;
    if (hasClass($target, 'leaf-menu-button')) {
      addStyle({ top: '-1000px' })(this.$leafMenu);
      return;
    }
    const $leaf = $target.parentElement;
    if (!($leaf instanceof Leaf)) {
      return;
    }
    clearTimeout(this.timerMultiSelect);
    this.timerMultiSelect = setTimeout(async () => {
      const { dragging, multiSelPanes } = await states();
      const bookmarks = !multiSelPanes?.bookmarks;
      if (dragging) {
        if (!bookmarks) {
          this.selectItems(dispatch);
        }
        return;
      }
      dispatch('multiSelPanes', { bookmarks, all: false });
      if (!bookmarks || multiSelPanes?.all) {
        dispatch('multiSelPanes', { all: undefined });
        return;
      }
      $leaf.preMultiSelect(bookmarks);
      this.selectItems(dispatch);
    }, delayMultiSelect);
  }
  async clickItem(e: MouseEvent, states: States, dispatch: Dispatch) {
    const $target = e.target as HTMLDivElement;
    if ($target.hasAttribute('contenteditable')) {
      return;
    }
    if (hasClass($target, 'leaf', 'leaf-menu-button')) {
      return;
    }
    if (hasClass($target, 'title', 'icon-fa-angle-right') && $target.closest('.leafs')) {
      $target.parentElement?.parentElement?.classList.toggle('path');
      return;
    }
    const $leaf = $target instanceof Leaf ? $target : $target.parentElement;
    if ($leaf instanceof Leaf) {
      const { bookmarks, all } = await states('multiSelPanes');
      if (bookmarks || all) {
        $leaf.select();
        if (all) {
          dispatch('multiSelPanes', { bookmarks: true, all: false });
        }
        if (e.shiftKey) {
          this.selectWithShift($leaf);
        }
        this.selectItems(dispatch);
        this.$lastClickedLeaf = $leaf;
        return;
      }
      if (all == null) {
        dispatch('multiSelPanes', { all: false });
        return;
      }
      $leaf.openOrFind(this.#options);
    }
  }
  search({ reFilter, searchSelector, includeUrl }: SearchParams) {
    const targetBookmarks = switches(searchSelector)
      .case('match')
      .then(() => {
        const target = $$byClass('search-path', this);
        target.forEach(rmClass('search-path'));
        $$byClass('path', this).forEach(rmClass('path'));
        return target;
      })
      .case('unmatch')
      .then(() => $$('.leaf:not(.search-path)', this))
      .else(() => {
        $$byClass('search-path', this).forEach(rmClass('search-path'));
        $$byClass('path', this).forEach(rmClass('path'));
        return $$byClass('leaf', this);
      });
    targetBookmarks.reduce((acc, $leaf) => {
      const $anchor = $leaf.firstElementChild as HTMLAnchorElement;
      if (reFilter.test($anchor.textContent!)
        || (includeUrl && reFilter.test(extractUrl($leaf.style.backgroundImage)))) {
        addClass('search-path')($leaf);
        if (acc === $leaf.parentElement) {
          return acc;
        }
        for (let $folder = $leaf.parentElement as HTMLElement | null; $folder && $folder.classList.contains('folder'); $folder = $folder.parentElement) {
          addClass('search-path', 'path')($folder);
        }
        return $leaf.parentElement;
      }
      return acc;
    }, null as HTMLElement | null);
  }
  clearSearch() {
    $$byClass('search-path', this).forEach(rmClass('search-path'));
    $$byClass('path', this).forEach(rmClass('path'));
  }
  wheelHighlightTab(e: WheelEvent, dispatch: Dispatch) {
    const $leaf = (e.target as HTMLElement).parentElement;
    if (!($leaf instanceof Leaf)) {
      return;
    }
    if (this.matchedTabLeafId === $leaf.id) {
      e.preventDefault();
      dispatch('nextTabByWheel', '', true);
    }
  }
  setWheelHighlightTab(newValue: string) {
    this.matchedTabLeafId = newValue;
  }
  override actions() {
    return {
      ...super.actions(),
      clickLeafs: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mousedownLeafs: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
      }),
      mouseupLeafs: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
      }),
      mouseoverLeafs: makeAction({
        target: this,
        eventType: 'mouseover',
        eventOnly: true,
      }),
      mouseoutLeafs: makeAction({
        target: this,
        eventType: 'mouseout',
        eventOnly: true,
      }),
      wheelLeafs: makeAction({
        target: this,
        eventType: 'wheel',
        eventOnly: true,
        listenerOptions: false,
      }),
      nextTabByWheel: makeAction({
        initValue: '',
        force: true,
      }),
    };
  }
  override connect(store: Store) {
    super.connect(store);
    store.subscribe('clearSearch', this.clearSearch.bind(this));
    store.subscribe('clickLeafs', (_, e) => this.clickItem(e, store.getStates, store.dispatch));
    store.subscribe('mousedownLeafs', (_, e) => this.mousedownItem(e, store.getStates, store.dispatch));
    store.subscribe('mouseupLeafs', this.mouseupItem.bind(this));
    store.subscribe('multiSelPanes', ({ newValue }) => this.multiSelectLeafs(newValue));
    store.subscribe('clickFolders', (_, e) => this.clickItem(e, store.getStates, store.dispatch));
    store.subscribe('mousedownFolders', (_, e) => this.mousedownItem(e, store.getStates, store.dispatch));
    store.subscribe('mouseupFolders', this.mouseupItem.bind(this));
    store.subscribe('wheelLeafs', (_, e) => this.wheelHighlightTab(e, store.dispatch));
    store.subscribe('setWheelHighlightTab', (changes) => this.setWheelHighlightTab(changes.newValue));
  }
}
