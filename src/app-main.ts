/* eslint-disable import/prefer-default-export */

import { MulitiSelectables, Options } from './types';
import {
  setEvents, addListener,
  last, getColorWhiteness, lightColorWhiteness, camelToSnake, getLocal, pipe,
} from './common';
import { setZoomSetting } from './zoom';
import {
  $byClass, $$byClass,
  hasClass, toggleClass,
  setResizeHandler,
  setSplitterHandler,
  resizeSplitHandler,
  resizeWidthHandler,
  resizeHeightHandler,
  getEndPaneMinWidth,
  showMenu,
  rmClass,
  addClass,
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
  'tabs-menu-button',
  'folder-menu-button',
  'open-new-tab', 'open-new-window', 'open-incognito',
];

export class AppMain extends HTMLElement implements IPubSubElement {
  #options!: Options;
  init(options: Options, isSearching: boolean) {
    this.#options = options;
    this.classList.toggle('searching', isSearching);
    const [themeDarkPane, themeDarkFrame, themeDarkHover, themeDarkSearch, themeDarkKey] = options
      .colorPalette
      .map((code) => getColorWhiteness(code))
      .map((whiteness) => whiteness <= lightColorWhiteness);
    Object.entries({
      themeDarkPane,
      themeDarkFrame,
      themeDarkHover,
      themeDarkSearch,
      themeDarkKey,
    }).forEach(([key, enabled]) => toggleClass(camelToSnake(key), enabled)(this));

    const $paneBodies = $$byClass('pane-body', this);
    const $endHeaderPane = last($$byClass('pane-header', this))!;
    const $endBodyPane = last($paneBodies)!;

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

    $byClass('resize-x', this)?.addEventListener('mousedown', (e) => {
      const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
      setResizeHandler(resizeWidthHandler(
        $endBodyPane,
        document.body.offsetWidth + e.screenX,
        endPaneMinWidth,
      ));
    });

    $byClass('resize-y')?.addEventListener('mousedown', () => setResizeHandler(resizeHeightHandler));

    const panes = [
      ...(options.zoomHistory ? [$byClass('histories', this)!] : []),
      ...(options.zoomTabs ? [$byClass('tabs', this)!] : []),
    ];
    setEvents([...panes], { mouseenter: setZoomSetting(this, options) });
    toggleClass('disable-zoom-history', !options.zoomHistory)(this);
    toggleClass('disable-zoom-tabs', !options.zoomTabs)(this);
  }
  // eslint-disable-next-line class-methods-use-this
  async keydown(_: any, e: KeyboardEvent, __: any, store: StoreSub) {
    if (e.shiftKey && e.ctrlKey) {
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
  setIncludeUrl(
    { newValue }: { newValue: boolean },
    _: any,
    __: any,
    store: StoreSub,
  ) {
    toggleClass('checked-include-url', newValue)(this);
    store.dispatch('changeIncludeUrl', newValue, true);
  }
  async clickAppMain(_: any, e: MouseEvent, __: any, store: StoreSub) {
    const $target = e.target as HTMLElement;
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
