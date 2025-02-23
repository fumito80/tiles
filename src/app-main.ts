/* eslint-disable import/prefer-default-export */

import {
  ApplyStyle, ColorPalette, MulitiSelectables, Options, Settings,
} from './types';
import {
  setEvents, getLocal, pipe, getNextIndex, updateSettings,
  chromeEventFilter, cssid, makeCss, pick, setPopupStyle,
  addListener,
} from './common';
import { setZoomSetting } from './zoom';
import {
  $byClass,
  $$byClass,
  hasClass, toggleClass,
  resizeHeightHandler,
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
  preShowMenu,
  splitColMouseDownHandler,
  splitRowMouseDownHandler,
  setMouseEventListener,
  setPopupHeight,
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
  'history-item', 'history-title',
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
  #windowId!: number;
  #shortcuts!: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>[] | undefined;
  #appZoom!: number;
  init(options: Options, settings: Settings, isSearching: boolean) {
    this.#options = options;
    this.#settings = settings;
    this.classList.toggle('searching', isSearching);
    setThemeClass(this, options.colorPalette);
    chrome.windows.getCurrent().then((win) => {
      this.#windowId = win.id!;
    });

    const $$colGrids = $$byClass('col-grid', this);
    const panes = [
      ...(options.wider1 ? [$$colGrids[0]] : []),
      ...(options.wider2 ? [$$colGrids[1]] : []),
    ];
    setEvents([...panes], { mouseenter: setZoomSetting(this, options) });
    const [zoomTabs, zoomHistory] = panes
      .reduce<[boolean, boolean]>(([tabs, history], $colGrid) => ([
        tabs || !!$byClass('windows', $colGrid),
        history || !!$byClass('history', $colGrid),
      ]), [false, false] as const);
    toggleClass('disable-zoom-history', !zoomHistory)(this);
    toggleClass('disable-zoom-tabs', !zoomTabs)(this);
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
    chrome.commands.getAll().then((commands) => {
      this.#shortcuts = commands
        .filter((cmd) => cmd.shortcut)
        .map((cmd) => ({
          key: cmd.shortcut!.replaceAll(/Ctrl|Alt|Shift|Command|\+/g, ''),
          ctrlKey: /Ctrl/.test(cmd.shortcut!),
          altKey: /Alt/.test(cmd.shortcut!),
          shiftKey: /Shift/.test(cmd.shortcut!),
          metaKey: /Command/.test(cmd.shortcut!),
        }));
    });
    chrome.tabs.setZoomSettings({
      mode: 'disabled',
      scope: 'per-tab',
    });

    $$byClass('split-h').forEach(addListener('mousedown', splitColMouseDownHandler(this)));

    $$byClass('col-grid').forEach(($colGrid, i) => {
      $$byClass('split-v', $colGrid).forEach(addListener('mousedown', splitRowMouseDownHandler(this, i)));
    });

    if (options.windowMode) {
      return;
    }

    $byClass('resize-y')?.addEventListener('mousedown', (e) => {
      (e.target as HTMLElement).classList.add('mousedown');
      setMouseEventListener(resizeHeightHandler(this), setPopupHeight, true);
    });
  }
  async keydown({ newValue: e }: Changes<'keydownMain'>, _: any, states: States, store: StoreSub) {
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
      const {
        bookmarks, windows, history, 'recent-tabs': recentTabs, all: alls,
      } = states.multiSelPanes ?? {};
      const all = !(bookmarks || windows || history || recentTabs || alls);
      store.dispatch('multiSelPanes', { all });
    } else {
      const isShortcut = (e.key === 'Escape' && !e.shiftKey) || this.#shortcuts?.some((keys) => (
        keys.key === e.key.toUpperCase()
        && keys.altKey === e.altKey
        && keys.ctrlKey === e.ctrlKey
        && keys.shiftKey === e.shiftKey
        && keys.metaKey === e.metaKey
      ));
      if (isShortcut) {
        store.dispatch('focusWindow', undefined, true);
      }
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
  // eslint-disable-next-line class-methods-use-this
  mousedownAppMain(_: any, e: MouseEvent) {
    if (hasClass(e.target as HTMLElement, 'leaf-menu-button')) {
      preShowMenu('leaf-menu', e);
    }
  }
  async clickAppMain(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $target = e.target as HTMLElement;
    if (!$target.closest('.menu-special') && !hasClass($target, 'main-menu-button')) {
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
      bookmarks: false, windows: false, history: false, 'recent-tabs': false, all: false,
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
      const appZoom = await store.getStates('setAppZoom');
      showMenu('leaf-menu', appZoom)(e);
      store.dispatch('multiSelPanes', { bookmarks: false, all: false });
      return;
    }
    if (hasClass($target, 'main-menu-button')) {
      return;
    }
    store.dispatch('focusQuery');
  }
  async changeFocusedWindow({ newValue: { windowId } }: Changes<'changeFocusedWindow'>) {
    if (this.#options.windowMode || windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }
    window.close();
  }
  // eslint-disable-next-line class-methods-use-this
  resizeWindow({ newValue: popupWindow }: Changes<'resizeWindow'>, _: any, __: any, store: StoreSub) {
    if (popupWindow.state === 'normal' && popupWindow.focused) {
      const windowSize = pick('width', 'height', 'top', 'left')(popupWindow) as NonNullable<Settings['windowSize']>;
      updateSettings((settings) => ({ ...settings, windowSize }));
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
    const [sheet] = document.adoptedStyleSheets;
    sheet.replace(makeCss(this.#settings, colorPalette, css));
    setThemeClass($byTag('app-main'), colorPalette);
  }
  minimizeOthers(changes: Changes<'windowAction'>) {
    if (changes.newValue.type === 'minimizeOthers') {
      this.minimize();
    }
  }
  minimize() {
    chrome.windows.update(this.#windowId, { state: 'minimized' });
  }
  setAppZoom({ newValue }: Changes<'setAppZoom'>) {
    const [width, height] = this.#options.windowMode
      ? ['unset', `calc(100vh / ${newValue} - 5px)`]
      : [`${this.#settings.width / newValue}px`, `${this.#settings.height / newValue}px`];
    Object.assign(document.body.style, {
      width,
      height,
      zoom: newValue,
    });
    $byClass('draggable-clone')!.style.maxWidth = `calc(300px / ${newValue} / ${devicePixelRatio})`;
    this.#appZoom = newValue;
    setPopupStyle(this.#options);
  }
  get appZoom() {
    return this.#appZoom;
  }
  actions() {
    return {
      clickAppMain: makeAction({
        target: this,
        eventType: 'click',
        eventOnly: true,
      }),
      mousedownAppMain: makeAction({
        target: this,
        eventType: 'mousedown',
        eventOnly: true,
      }),
      multiSelPanes: makeAction({
        initValue: {
          bookmarks: false,
          windows: false,
          history: false,
          'recent-tabs': false,
          all: false,
        } satisfies MulitiSelectables as MulitiSelectables,
      }),
      keydownMain: makeAction({
        initValue: {
          key: '', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
        } as Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>,
        target: this,
        eventType: 'keydown',
        eventProcesser: pick('key', 'shiftKey', 'ctrlKey', 'altKey', 'metaKey'),
        force: true,
      }),
      keyupMain: makeAction({
        target: this,
        eventType: 'keyup',
        eventOnly: true,
        noStates: true,
      }),
      changeFocusedWindow: makeAction({
        initValue: undefined as { windowId: number } | undefined,
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
      focusWindow: {},
    };
  }
  connect(store: Store) {
    if (!this.#options.windowMode) {
      chrome.windows.onFocusChanged.addListener((windowId) => {
        store.dispatch('changeFocusedWindow', { windowId }, true);
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
      store.dispatch('setCurrentWindowId', { windowId, isEventTrigger: true }, true);
    }, chromeEventFilter);
    chrome.storage.local.onChanged.addListener((storage) => {
      if (!storage.htmlBookmarks) {
        return;
      }
      store.dispatch('updateBookmarks');
    });
  }
}
