import {
  $, $$, $$byClass, $byClass,
  addClass, rmClass, toggleClass, hasClass, addChild, addStyle,
  addBookmark, getBookmark,
  addFolder, setAnimationClass, editTitle, createNewTab,
} from './client';
import {
  addListener,
  cbToResolve,
  cssid,
  curry,
  curry3,
  delayMultiSelect,
  extractDomain,
  extractUrl, pipe, setEvents, setFavicon, switches,
} from './common';
import { ISearchable, SearchParams } from './search';
import {
  IPublishElement, ISubscribeElement, makeAction, Store,
} from './store';
import { OpenBookmarkType, Options, State } from './types';

export class PaneHeader extends HTMLDivElement implements IPublishElement {
  #includeUrl!: boolean;
  private $mainMenu!: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(settings: State['settings'], _?: boolean) {
    this.$mainMenu = $byClass('main-menu', this);
    this.#includeUrl = settings.includeUrl;
    pipe(
      addListener('click', (e) => {
        const $menu = e.target as HTMLElement;
        switch ($menu.dataset.value) {
          case 'add-bookmark': {
            const id = $byClass('open')?.id;
            addBookmark(id || '1');
            break;
          }
          case 'add-folder':
            addFolder();
            break;
          case 'settings':
            chrome.runtime.openOptionsPage();
            break;
          default:
        }
      }),
      addListener('mousedown', (e) => e.preventDefault()),
    )(this.$mainMenu);
  }
  actions() {
    if (!hasClass(this, 'end')) {
      return {};
    }
    return {
      setIncludeUrl: makeAction({
        initValue: this.#includeUrl,
        persistent: true,
        target: $byClass('include-url', this.$mainMenu),
        eventType: 'click',
        eventProcesser: (_, currentValue) => !currentValue,
      }),
    };
  }
}

export class HeaderLeafs extends PaneHeader implements ISubscribeElement {
  private $pinBookmark!: HTMLElement;
  override init(settings: State['settings']) {
    super.init(settings);
    this.$pinBookmark = $byClass('pin-bookmark', this);
    this.$pinBookmark.addEventListener('click', () => addBookmark());
  }
  multiSelect(changes: { newValue: boolean }) {
    this.classList.toggle('multi-select', changes.newValue);
  }
  connect(store: Store) {
    store.subscribe('multiSelectLeafs', this.multiSelect.bind(this));
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
      return;
    }
    this.classList.toggle('selected', selected ?? !this.classList.contains('selected'));
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
        case 'remove': {
          await cbToResolve(curry(chrome.bookmarks.remove)($leaf.id));
          addChild($byClass('leaf-menu'))($byClass('components'));
          pipe(
            addListener('animationend', () => $$(cssid($leaf.id)).forEach(($el) => $el.remove()), { once: true }),
            rmClass('hilite'),
            setAnimationClass('remove-hilite'),
          )($leaf);
          break;
        }
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

export class Leafs extends HTMLDivElement implements ISubscribeElement, ISearchable {
  store!: Store;
  #options!: Options;
  $leafMenu!: HTMLElement;
  #timerMultiSelect!: number;
  init(options: Options) {
    this.#options = options;
    this.$leafMenu = $byClass('leaf-menu');
    this.addEventListener('mouseup', () => {
      clearTimeout(this.#timerMultiSelect);
    });
    setLeafMenu(this.$leafMenu, options);
  }
  multiSelectLeafs(multiSelect: boolean) {
    if (!multiSelect) {
      $$('.selected', this).forEach(rmClass('selected'));
    }
  }
  switchMultiSelect(enabled: boolean) {
    this.store.dispatch('multiSelectLeafs', enabled);
  }
  mousedownItem(e: MouseEvent, multiSelect: boolean) {
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
    this.#timerMultiSelect = setTimeout(() => {
      this.store.getState('dragstart', (dragstart) => {
        if (dragstart) {
          if (multiSelect) {
            $leaf.select(true);
          }
          return;
        }
        this.switchMultiSelect(!multiSelect);
        $leaf.preMultiSelect(!multiSelect);
      });
    }, delayMultiSelect);
  }
  clickItem(e: MouseEvent, multiSelect: boolean) {
    const $target = e.target as HTMLDivElement;
    if ($target.hasAttribute('contenteditable')) {
      return;
    }
    if (hasClass($target, 'anchor')) {
      const $leaf = $target.parentElement;
      if ($leaf instanceof Leaf) {
        if (multiSelect) {
          $leaf.select();
          e.stopImmediatePropagation();
          return;
        }
        $leaf.openOrFind(this.#options);
      }
      return;
    }
    if (hasClass($target, 'title', 'icon-fa-angle-right')) {
      toggleClass('path')($target.parentElement?.parentElement);
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
      multiSelectLeafs: makeAction({ initValue: false }),
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
    };
  }
  connect(store: Store) {
    this.store = store;
    store.subscribe('clearSearch', this.clearSearch.bind(this));
    store.subscribe('clickLeafs', (_, __, e, states) => this.clickItem(e, states.multiSelectLeafs!));
    store.subscribe('mousedownLeafs', (_, __, e, states) => this.mousedownItem(e, states.multiSelectLeafs!));
    store.subscribe('multiSelectLeafs', ({ newValue }) => this.multiSelectLeafs(newValue));
  }
}
