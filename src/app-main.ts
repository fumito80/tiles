/* eslint-disable import/prefer-default-export */

import {
  ApplyStyle, ColorPalette, MulitiSelectables, Options, Settings,
} from './types';
import {
  setEvents, addListener, last, getLocal, pipe, getNextIndex, updateSettings,
  chromeEventFilter, cssid, makeCss, pick,
} from './common';
import { setZoomSetting } from './zoom';
import {
  $byClass, $$byClass,
  hasClass, toggleClass,
  setResizeHandler,
  setSplitterHandler,
  resizeSplitHandler,
  resizeHeightHandler,
  getEndPaneMinWidth,
  showMenu,
  rmClass,
  addClass,
  setThemeClass,
  changeColorTheme,
  $,
  setFavColorMenu,
  setHTML,
  $$,
  $byTag,
  setBrowserFavicon,
  addChild,
} from './client';
import {
  makeAction, Changes, IPubSubElement, StoreSub, Store, States,
} from './popup';
import { Leaf } from './bookmarks';

const excludeClasses = [
  'anchor',
  'leaf',
  'multi-sel-menu-button',
  'show',
  'start-multi-select',
  'tab-wrap', 'outline',
  'collapse-tabs',
  'collapse-tab',
  'window', 'window-title', 'tab-title',
  'history', 'history-title',
  'main-menu-button',
  'tabs-menu-button',
  'folder-menu-button',
  'open-new-tab', 'open-new-window', 'open-incognito',
];

export class AppMain extends HTMLElement implements IPubSubElement {
  #options!: Options;
  #settings!: Settings;
  #randomPalettes = [] as ColorPalette[];
  #randomPalettesIndex = 0;
  // #timerResizeWindow!: ReturnType<typeof setTimeout>;
  #windowId!: number;
  init(options: Options, settings: Settings, isSearching: boolean) {
    this.#options = options;
    this.#settings = settings;
    this.classList.toggle('searching', isSearching);
    setThemeClass(this, options.colorPalette);
    chrome.windows.getCurrent().then((win) => {
      this.#windowId = win.id!;
    });

    const $paneBodies = $$byClass('pane-body', this);
    const $endHeaderPane = last($$byClass('pane-header', this))!;

    $$byClass('split-h', this).forEach(($splitter, i) => {
      const $targetPane = $paneBodies[i];
      addListener('mousedown', (e: MouseEvent) => {
        (e.currentTarget as HTMLElement).classList.add('mousedown');
        const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
        const subWidth = $paneBodies
          .filter((el) => el !== $targetPane && !hasClass(el, 'end'))
          .reduce((acc, el) => acc + el.offsetWidth, 0);
        const adjustMouseX = e.clientX - $splitter.offsetLeft;
        const handler = resizeSplitHandler(
          $targetPane,
          $splitter,
          subWidth + 18,
          adjustMouseX,
          endPaneMinWidth,
        );
        setSplitterHandler(handler);
      })($splitter);
    });

    if (!options.windowMode) {
      $byClass('resize-y')?.addEventListener('mousedown', () => setResizeHandler(resizeHeightHandler));
    }

    const panes = [
      ...(options.zoomHistory ? [$byClass('histories', this)!] : []),
      ...(options.zoomTabs ? [$byClass('tabs', this)!] : []),
    ];
    setEvents([...panes], { mouseenter: setZoomSetting(this, options) });
    toggleClass('disable-zoom-history', !options.zoomHistory)(this);
    toggleClass('disable-zoom-tabs', !options.zoomTabs)(this);
    getLocal('settings', 'options').then(({ settings: { palettes } }) => {
      const palettesAll = Object.values(palettes)
        .flatMap((palette) => palette.map((p) => p.map((pp) => pp.color) as ColorPalette));
      const { length } = palettesAll;
      for (let i = 0; i < length; i += 1) {
        const randomIndex = Math.floor((length - i) * Math.random());
        const [randomPalette] = palettesAll.splice(randomIndex, 1);
        this.#randomPalettes.push(randomPalette);
      }
    });
  }
  // eslint-disable-next-line class-methods-use-this
  async keydown(_: any, e: KeyboardEvent, __: any, store: StoreSub) {
    if (e.key === 'F2') {
      getLocal('options').then(({ options: { favColorPalettes, colorPalette } }) => {
        if (favColorPalettes.length === 0) {
          return;
        }
        const findIndex = favColorPalettes
          .findIndex((palette) => palette.every((p, i) => p === colorPalette[i]));
        const nextIndex = getNextIndex(favColorPalettes.length, findIndex, e.shiftKey);
        const palette = favColorPalettes[nextIndex];
        changeColorTheme(palette).then(() => setFavColorMenu(palette));
      });
    } else if (e.key === 'F8') {
      this.#randomPalettesIndex = getNextIndex(
        this.#randomPalettes.length,
        this.#randomPalettesIndex,
        e.shiftKey,
      );
      const palette = this.#randomPalettes[this.#randomPalettesIndex];
      changeColorTheme(palette);
    } else if (e.shiftKey && e.ctrlKey) {
      const { bookmarks, tabs, histories } = await store.getStates('multiSelPanes');
      if (bookmarks || tabs || histories) {
        return;
      }
      store.dispatch('multiSelPanes', { all: true });
    }
  }
  // eslint-disable-next-line class-methods-use-this
  async keyup(_: any, e: KeyboardEvent, __: any, store: StoreSub) {
    if (e.key === 'Shift') {
      const { all } = await store.getStates('multiSelPanes');
      if (!all) {
        return;
      }
      store.dispatch('multiSelPanes', { all: false });
    }
  }
  searching(changes: Changes<'searching'>) {
    toggleClass('searching', changes.newValue)(this);
  }
  dragging(changes: Changes<'dragging'>) {
    toggleClass('drag-start', changes.newValue)(this);
  }
  setIncludeUrl({ newValue }: Changes<'setIncludeUrl'>) {
    toggleClass('checked-include-url', newValue)(this);
  }
  async clickAppMain(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $target = e.target as HTMLElement;
    if (!$target.closest('.fav-color-themes') && !hasClass($target, 'main-menu-button')) {
      $('.main-menu.show')?.classList.remove('show');
    }
    if ($target.hasAttribute('contenteditable') || hasClass($target, 'query', 'icon-x')) {
      return;
    }
    if (hasClass($target, ...excludeClasses)) {
      store.dispatch('focusQuery');
      return;
    }
    store.dispatch('multiSelPanes', {
      bookmarks: false, tabs: false, histories: false, all: false,
    });
    if (hasClass($target, 'leaf-menu-button')) {
      if (this.#options.findTabsFirst && this.#options.bmAutoFindTabs) {
        const { bmFindTabMatchMode = {} } = await getLocal('bmFindTabMatchMode');
        const $leaf = $target.parentElement;
        if ($leaf instanceof Leaf) {
          const findMode = bmFindTabMatchMode[$leaf.id] || this.#options.findTabsMatches;
          pipe(rmClass('domain', 'prefix'), addClass(findMode))($leaf);
        }
      }
      showMenu('leaf-menu')(e);
      store.dispatch('multiSelPanes', { bookmarks: false, all: false });
      return;
    }
    if (hasClass($target, 'main-menu-button')) {
      return;
    }
    store.dispatch('focusQuery');
  }
  // eslint-disable-next-line class-methods-use-this
  async changeFocusedWindow({ newValue: windowId }: Changes<'changeFocusedWindow'>) {
    const { options: { windowMode } } = await getLocal('options');
    if (windowMode) {
      return;
    }
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }
    window.close();
  }
  // eslint-disable-next-line class-methods-use-this
  resizeWindow({ newValue: popupWindow }: Changes<'resizeWindow'>, _: any, __: any, store: StoreSub) {
    if (popupWindow.state === 'normal' && popupWindow.focused) {
      const windowSize = pick('width', 'height', 'top', 'left')(popupWindow) as NonNullable<Settings['windowSize']>;
      updateSettings({ windowSize });
      store.dispatch('updateWindowHeight', popupWindow.height);
    }
  }
  // eslint-disable-next-line class-methods-use-this
  refreshBookmarks(_: any, __: any, states: States, store: StoreSub) {
    if (states.editingBookmark) {
      store.dispatch('editingBookmark', false);
      return;
    }
    addChild($byClass('leaf-menu')!)($byClass('components')!);
    addChild($byClass('folder-menu')!)($byClass('components')!);
    store.dispatch('multiSelPanes', { all: false });
    getLocal('htmlBookmarks', 'clientState').then(({ clientState, htmlBookmarks }) => {
      setHTML(htmlBookmarks.leafs)($byClass('leafs')!);
      setHTML(htmlBookmarks.folders)($byClass('folders')!);
      clientState.paths?.map((id) => $(`.folders ${cssid(id)}`)).forEach(addClass('path'));
      if (clientState.open) {
        if (states.searching) {
          $(`.folders ${cssid(clientState.open)}`)?.classList.add('open');
        } else {
          $$(cssid(clientState.open)).forEach(addClass('open'));
        }
      }
    });
  }
  applyStyle({ newValue: { css, colorPalette } }: Changes<'applyStyle'>) {
    setBrowserFavicon(colorPalette);
    $byTag('style').textContent = makeCss(this.#settings, colorPalette, css);
  }
  actions() {
    return {
      clickAppMain: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      multiSelPanes: makeAction({
        initValue: {
          bookmarks: false,
          tabs: false,
          histories: false,
          all: false,
        } as MulitiSelectables,
      }),
      keydownMain: makeAction({
        target: this,
        eventType: 'keydown',
        eventOnly: true,
        noStates: true,
      }),
      keyupMain: makeAction({
        target: this,
        eventType: 'keyup',
        eventOnly: true,
        noStates: true,
      }),
      changeFocusedWindow: makeAction({
        initValue: 0,
        force: true,
      }),
      resizeWindow: makeAction({
        initValue: undefined as chrome.windows.Window | undefined,
      }),
      updateBookmarks: {},
      updateWindowHeight: makeAction({
        initValue: 0,
      }),
      applyStyle: makeAction({
        initValue: undefined as ApplyStyle | undefined,
      }),
      editingBookmark: makeAction({
        initValue: false,
      }),
    };
  }
  // eslint-disable-next-line class-methods-use-this
  connect(store: Store) {
    if (!this.#options.windowMode) {
      chrome.windows.onFocusChanged.addListener((windowId) => {
        store.dispatch('changeFocusedWindow', windowId, true);
      }, chromeEventFilter);
      return;
    }
    // Window Mode
    chrome.windows.onBoundsChanged.addListener((win) => {
      if (win.id === this.#windowId) {
        store.dispatch('resizeWindow', win);
      }
    });
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId !== this.#windowId) {
        store.dispatch('setCurrentWindowId', { windowId, isEventTrigger: true }, true);
      }
    }, chromeEventFilter);
    chrome.storage.local.onChanged.addListener((storage) => {
      if (!storage.htmlBookmarks) {
        return;
      }
      store.dispatch('updateBookmarks');
    });
  }
}
