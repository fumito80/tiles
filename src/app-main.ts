/* eslint-disable import/prefer-default-export */

import { ColorPalette, MulitiSelectables, Options } from './types';
import {
  setEvents, addListener, last, getLocal, pipe, getNextIndex,
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
  preShowMenu,
} from './client';
import {
  makeAction, Changes, IPubSubElement, StoreSub,
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
  #randomPalettes = [] as ColorPalette[];
  #randomPalettesIndex = 0;
  init(options: Options, isSearching: boolean) {
    this.#options = options;
    this.classList.toggle('searching', isSearching);
    setThemeClass(this, options.colorPalette);

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

    $byClass('resize-y')?.addEventListener('mousedown', () => setResizeHandler(resizeHeightHandler));

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
  // eslint-disable-next-line class-methods-use-this
  mousedownAppMain(_: any, e: MouseEvent) {
    if (hasClass(e.target as HTMLElement, 'leaf-menu-button')) {
      preShowMenu('leaf-menu', e);
    }
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
    };
  }
  // eslint-disable-next-line class-methods-use-this
  connect() {}
}
