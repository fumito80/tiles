import {
  $, $$, $$byClass, $byClass, addClass, rmClass, hasClass, addStyle, addBookmark, getBookmark,
  setAnimationClass, editTitle, createNewTab, remeveBookmark, getMessageDeleteSelecteds,
} from './client';
import {
  cssid, getCurrentTab, setEvents, setFavicon, switches,
  delayMultiSelect, prop, setLocal, getLocal, htmlEscape,
} from './common';
import { dialog } from './dialogs';
import { dropBmInNewWindow } from './drag-drop';
import {
  getSelecteds,
  MulitiSelectablePaneBody, MultiSelPane, MutiSelectableItem, MulitiSelectablePaneHeader,
} from './multi-sel-pane';
import { ISearchable, SearchParams } from './search';
import {
  ISubscribeElement, makeAction, Store, Dispatch, States, Changes, StoreSub,
} from './popup';
import {
  AbstractConstructor, MulitiSelectables, OpenBookmarkType, Options, State,
} from './types';

export class Leaf extends MutiSelectableItem {
  updateTitle(title: string, url: string) {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', `${htmlEscape(title)}\n${htmlEscape(url.substring(0, 1024))}`);
    $anchor.textContent = title;
  }
  updateAnchor({ title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
    setFavicon(url!)(this);
    this.updateTitle(title, url!);
  }
  openOrFind(options: Options, dispatch: Dispatch) {
    if (this.checkMultiSelect()) {
      return;
    }
    if (options.findTabsFirst) {
      dispatch('activateTab', { url: this.url, focused: true, bookmarkId: this.id });
      return;
    }
    this.openBookmark(options);
  }
  get url() {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    const [, url] = $anchor.title?.split('\n') || [];
    return url;
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
  async editBookmarkTitle() {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    const title = await editTitle($anchor, this.id, false, true);
    if (!title) {
      return;
    }
    this.updateTitle(title, this.url);
    if (this.closest('.folders')) {
      ($(`.leafs ${cssid(this.id)}`) as Leaf).updateTitle(title, this.url);
    }
    setAnimationClass('hilite')(this);
  }
}

export class HeaderLeafs extends MulitiSelectablePaneHeader {
  readonly paneName = 'bookmarks';
  private $pinBookmark!: HTMLElement;
  private options!: Options;
  readonly multiDeletesTitle = 'Delete selected bookmarks';
  override init(settings: State['settings'], options: Options, $tmplMultiSelPane: MultiSelPane) {
    super.init(settings, options, $tmplMultiSelPane);
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

async function updateUrl(
  bookmarkId: string,
  url: string,
  title: string,
  placeholder: string,
): Promise<string> {
  const result = await dialog.inputText(title, 'Edit URL of bookmark', url, placeholder);
  if (!result) {
    throw new Error();
  }
  const success = await chrome.bookmarks.update(bookmarkId, { url: result })
    .then(() => true)
    .catch((reason) => dialog.alert(reason.message).then(() => false));
  if (!success) {
    return updateUrl(bookmarkId, result, title, placeholder);
  }
  return result;
}

function setLeafMenu($leafMenu: HTMLElement, options: Options, dispatch: Dispatch) {
  setEvents([$leafMenu], {
    async click(e) {
      const $leaf = (e.target as HTMLElement).closest('bm-leaf');
      if (!($leaf instanceof Leaf)) {
        return;
      }
      const { value } = (e.target as HTMLElement).dataset;
      switch (value) {
        case 'find-in-tabs': {
          dispatch('activateTab', { url: $leaf.url, bookmarkId: $leaf.id });
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
          $leaf.classList.add('selected');
          await updateUrl($leaf.id, url, title, url)
            .then((result) => {
              $leaf.updateAnchor({ title, url: result });
              setAnimationClass('hilite')($leaf);
            })
            .catch(() => {});
          $leaf.classList.remove('selected');
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
          dispatch('focusQuery');
          $target.click();
          $target.focus();
          setTimeout(() => {
            ($leaf.firstElementChild as HTMLAnchorElement).focus();
            ($leaf as any).scrollIntoViewIfNeeded();
            setAnimationClass('hilite')($leaf);
          }, 100);
          break;
        }
        case 'bm-find-domain':
        case 'bm-find-prefix': {
          getLocal('bmFindTabMatchMode').then((matchMode) => {
            const mode = value === 'bm-find-domain' ? 'domain' : 'prefix';
            const bmFindTabMatchMode = {
              ...matchMode.bmFindTabMatchMode,
              [$leaf.id]: mode,
            } as const;
            setLocal({ bmFindTabMatchMode });
          });
          break;
        }
        default:
      }
      ($leaf.firstElementChild?.nextElementSibling as HTMLElement).blur();
    },
    mousedown(e) {
      e.preventDefault();
    },
    mouseover(e) {
      const { value = '' } = (e.target as HTMLElement).dataset;
      if (value === 'bm-find-domain' || value === 'bm-find-prefix') {
        const $leaf = (e.target as HTMLElement).closest('bm-leaf');
        if (!($leaf instanceof Leaf)) {
          return;
        }
        const { url } = $leaf;
        dispatch('mouseoverMenuTabsFind', { menu: value, url }, true);
      }
    },
    mouseout(e) {
      const { value = '' } = (e.target as HTMLElement).dataset;
      if (value === 'bm-find-domain' || value === 'bm-find-prefix') {
        dispatch('mouseoutMenuTabsFind', undefined, true);
      }
    },
  });
}

export function getBookmarksBase<TBase extends AbstractConstructor>(Base: TBase) {
  abstract class Mixin extends Base {
    matchedTabLeafId!: string | undefined;
    wheelHighlightTab(_: any, e: WheelEvent, __: any, store: StoreSub) {
      const $leaf = (e.target as HTMLElement).parentElement;
      if (!($leaf instanceof Leaf)) {
        return;
      }
      if (this.matchedTabLeafId === $leaf.id) {
        e.preventDefault();
        store.dispatch('nextTabByWheel', e.deltaY > 0 ? 'DN' : 'UP', true);
      }
    }
    setWheelHighlightTab({ newValue }: Changes<'setWheelHighlightTab'>) {
      this.matchedTabLeafId = newValue?.leafId;
    }
    connect(store: Store) {
      if (super.connect) {
        super.connect(store);
      }
      store.subscribe('setWheelHighlightTab', this.setWheelHighlightTab.bind(this));
    }
  }
  return Mixin;
}

export const Bookmarks = getBookmarksBase(MulitiSelectablePaneBody);

export class Leafs extends Bookmarks implements ISubscribeElement, ISearchable {
  readonly paneName = 'bookmarks';
  #options!: Options;
  $leafMenu!: HTMLElement;
  $lastClickedLeaf!: Leaf | undefined;
  init(options: Options) {
    this.#options = options;
    this.$leafMenu = $byClass('leaf-menu')!;
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
  async deletesHandler($selecteds: HTMLElement[], dispatch: Dispatch) {
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
    Promise.all(removes).then(() => this.selectItems(dispatch));
  }
  multiSelectLeafs({ newValue: { bookmarks } }: { newValue: MulitiSelectables }) {
    if (!bookmarks) {
      $$('.leafs .selected, .folders .selected')
        .filter(($el): $el is Leaf => $el instanceof Leaf && $el.selected)
        .forEach(($leaf) => $leaf.select(false, true));
      this.$lastClickedLeaf = undefined;
    }
  }
  mousedownItem(_: any, e: MouseEvent, __: any, store: StoreSub) {
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
      const { dragging, multiSelPanes } = await store.getStates();
      const bookmarks = !multiSelPanes?.bookmarks;
      if (dragging) {
        if (!bookmarks) {
          this.selectItems(store.dispatch);
        }
        return;
      }
      store.dispatch('multiSelPanes', { bookmarks, all: false });
      if (!bookmarks || multiSelPanes?.all) {
        store.dispatch('multiSelPanes', { all: undefined });
        return;
      }
      $leaf.preMultiSelect(bookmarks);
      this.selectItems(store.dispatch);
    }, delayMultiSelect);
  }
  async clickItem(_: any, e: MouseEvent, states: States, store: StoreSub) {
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
      const { bookmarks, all } = states.multiSelPanes!;
      if (bookmarks || all) {
        $leaf.select();
        if (all) {
          store.dispatch('multiSelPanes', { bookmarks: true, all: false });
        }
        if (e.shiftKey) {
          this.selectWithShift($leaf);
        }
        this.selectItems(store.dispatch);
        this.$lastClickedLeaf = $leaf;
        return;
      }
      if (all == null) {
        store.dispatch('multiSelPanes', { all: false });
        return;
      }
      $leaf.openOrFind(this.#options, store.dispatch);
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
    (targetBookmarks as Leaf[]).reduce((acc, $leaf) => {
      const $anchor = $leaf.firstElementChild as HTMLAnchorElement;
      if (reFilter.test($anchor.textContent!) || (includeUrl && reFilter.test($leaf.url))) {
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
        noStates: true,
      }),
      mouseupLeafs: makeAction({
        target: this,
        eventType: 'mouseup',
        eventOnly: true,
        noStates: true,
      }),
      mouseoverLeafs: makeAction({
        target: this,
        eventType: 'mouseover',
        eventOnly: true,
        noStates: true,
      }),
      mouseoutLeafs: makeAction({
        target: this,
        eventType: 'mouseout',
        eventOnly: true,
        noStates: true,
      }),
      wheelLeafs: makeAction({
        target: this,
        eventType: 'wheel',
        eventOnly: true,
        listenerOptions: false,
        noStates: true,
      }),
      nextTabByWheel: makeAction({
        initValue: undefined as undefined | 'UP' | 'DN',
        force: true,
      }),
      openBookmarks: makeAction({
        initValue: [] as string[],
      }),
      mouseoverMenuTabsFind: makeAction({
        initValue: {
          menu: undefined as undefined | 'bm-find-domain' | 'bm-find-prefix',
          url: '',
        },
      }),
      mouseoutMenuTabsFind: {},
    };
  }
  override connect(store: Store) {
    super.connect(store);
    setLeafMenu(this.$leafMenu, this.#options, store.dispatch);
  }
}
