import {
  $, $$, $$byClass, $byClass,
  addClass, rmClass, hasClass, addStyle,
  addBookmark, getBookmark,
  addFolder, setAnimationClass, editTitle, createNewTab, remeveBookmark,
} from './client';
import {
  cbToResolve, cssid, curry3, extractUrl, getCurrentTab, setEvents, setFavicon, switches,
  delayMultiSelect, extractDomain,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  IPubSubElement, ISubscribeElement, makeAction, Store, Dispatch, States,
} from './store';
import { OpenBookmarkType, Options, State } from './types';

export class PaneHeader extends HTMLDivElement implements IPubSubElement {
  #includeUrl!: boolean;
  private $mainMenu!: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(settings: State['settings'], _?: boolean) {
    this.$mainMenu = $byClass('main-menu', this);
    this.#includeUrl = settings.includeUrl;
    this.$mainMenu.addEventListener('mousedown', (e) => e.preventDefault());
  }
  clickMainMenu(e: MouseEvent, dispatch: Dispatch) {
    const $menu = e.target as HTMLElement;
    switch ($menu.dataset.value) {
      case 'add-bookmark': {
        const id = $byClass('open')?.id;
        addBookmark(id || '1');
        break;
      }
      case 'start-multi-select':
        dispatch('multiSelPanes', { all: true });
        $byClass('main-menu-button', this).blur();
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
  actions() {
    if (hasClass(this, 'end')) {
      return {
        setIncludeUrl: makeAction({
          initValue: this.#includeUrl,
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
  // eslint-disable-next-line class-methods-use-this
  connect(store: Store) {
    if (!hasClass(this, 'end')) {
      return;
    }
    store.subscribe('clickMainMenu', (_, __, dispatch, e) => this.clickMainMenu(e, dispatch));
  }
}

export class HeaderLeafs extends PaneHeader {
  private $pinBookmark!: HTMLElement;
  override init(settings: State['settings']) {
    super.init(settings);
    this.$pinBookmark = $byClass('pin-bookmark', this);
    this.$pinBookmark.addEventListener('click', () => addBookmark());
  }
  override connect(store: Store) {
    super.connect(store);
  }
}

export class Leaf extends HTMLElement {
  #preMultiSel = false;
  updateTitle(title: string) {
    const $anchor = this.firstElementChild as HTMLAnchorElement;
    $anchor.setAttribute('title', title);
    $anchor.textContent = title;
  }
  updateAnchor({ title, url }: Pick<chrome.bookmarks.BookmarkTreeNode, 'title' | 'url'>) {
    setFavicon(url!)(this);
    this.updateTitle(title);
  }
  preMultiSelect(isBegin: boolean) {
    this.#preMultiSel = true;
    this.classList.toggle('selected', isBegin);
  }
  checkMultiSelect() {
    if (this.#preMultiSel) {
      this.#preMultiSel = false;
      return true;
    }
    return false;
  }
  select(selected?: boolean) {
    if (this.checkMultiSelect()) {
      return false;
    }
    const isSelected = selected ?? !this.classList.contains('selected');
    this.classList.toggle('selected', isSelected);
    return isSelected;
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
    const title = await editTitle($anchor, this.id, false, true).catch(() => null);
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

function multiSelectLeafs({ leafs: multiSelect }: { leafs?: boolean }) {
  if (!multiSelect) {
    $$('.selected').forEach(rmClass('selected'));
  }
}

export class Leafs extends HTMLDivElement implements ISubscribeElement, ISearchable {
  #options!: Options;
  $leafMenu!: HTMLElement;
  $lastClickedLeaf!: Leaf | undefined;
  #timerMultiSelect!: number;
  init(options: Options) {
    this.#options = options;
    this.$leafMenu = $byClass('leaf-menu');
    // this.addEventListener('mouseup', () => clearTimeout(this.#timerMultiSelect));
    setLeafMenu(this.$leafMenu, options);
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
  mousedownItem(e: MouseEvent, states: Store['getStates'], dispatch: Store['dispatch']) {
    const $target = e.target as HTMLDivElement;
    if (hasClass($target, 'leaf-menu-button')) {
      addStyle({ top: '-1000px' })(this.$leafMenu);
      return;
    }
    const $leaf = $target.parentElement;
    if (!($leaf instanceof Leaf)) {
      return;
    }
    clearTimeout(this.#timerMultiSelect);
    this.#timerMultiSelect = setTimeout(async () => {
      const { dragging, multiSelPanes } = await states();
      if (dragging) {
        if (multiSelPanes?.leafs) {
          $leaf.select(true);
        }
        return;
      }
      dispatch('multiSelPanes', { leafs: !multiSelPanes?.leafs });
      $leaf.preMultiSelect(!multiSelPanes?.leafs);
    }, delayMultiSelect);
  }
  mouseupItem() {
    clearTimeout(this.#timerMultiSelect);
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
      const { leafs, all } = await states('multiSelPanes');
      if (leafs || all) {
        $leaf.select();
        if (all) {
          dispatch('multiSelPanes', { leafs: true });
        }
        if (e.shiftKey) {
          this.selectWithShift($leaf);
        }
        this.$lastClickedLeaf = $leaf;
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
  actions() {
    return {
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
    };
  }
  connect(store: Store) {
    store.subscribe('clearSearch', this.clearSearch.bind(this));
    store.subscribe('clickLeafs', (_, states, dispatch, e) => this.clickItem(e, states, dispatch));
    store.subscribe('mousedownLeafs', (_, states, dispatch, e) => this.mousedownItem(e, states, dispatch));
    store.subscribe('mouseupLeafs', this.mouseupItem.bind(this));
    store.subscribe('multiSelPanes', ({ newValue }) => multiSelectLeafs(newValue));
    store.subscribe('clickFolers', (_, states, dispatch, e) => this.clickItem(e, states, dispatch));
    store.subscribe('mousedownFolders', (_, states, dispatch, e) => this.mousedownItem(e, states, dispatch));
    store.subscribe('mouseupFolders', this.mouseupItem.bind(this));
  }
}
