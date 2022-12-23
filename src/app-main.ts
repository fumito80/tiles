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
  Dispatch, IPubSubElement, makeAction, States, Store,
} from './store';
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

async function clickAppMain(e: MouseEvent, options: Options, dispatch: Dispatch) {
  const $target = e.target as HTMLElement;
  if ($target.hasAttribute('contenteditable') || hasClass($target, 'query', 'icon-x')) {
    return;
  }
  if (hasClass($target, ...excludeClasses)) {
    dispatch('focusQuery');
    return;
  }
  dispatch('multiSelPanes', {
    bookmarks: false, tabs: false, histories: false, all: false,
  });
  if (hasClass($target, 'leaf-menu-button')) {
    if (options.findTabsFirst && options.bmAutoFindTabs) {
      const { bmFindTabMatchMode = {} } = await getLocal('bmFindTabMatchMode');
      const $leaf = $target.parentElement;
      if ($leaf instanceof Leaf) {
        const findMode = bmFindTabMatchMode[$leaf.id] || options.findTabsMatches;
        pipe(rmClass('domain', 'prefix'), addClass(findMode))($leaf);
      }
    }
    showMenu('leaf-menu')(e);
    dispatch('multiSelPanes', { bookmarks: false, all: false });
    return;
  }
  if (hasClass($target, 'main-menu-button')) {
    return;
  }
  dispatch('focusQuery');
}

async function keydown(e: KeyboardEvent, states: States, dispatch: Dispatch) {
  if (e.shiftKey && e.ctrlKey) {
    const { bookmarks, tabs, histories } = await states('multiSelPanes');
    if (bookmarks || tabs || histories) {
      return;
    }
    dispatch('multiSelPanes', { all: true });
  }
}

async function keyup(e: KeyboardEvent, states: States, dispatch: Dispatch) {
  if (e.key === 'Shift') {
    const { all } = await states('multiSelPanes');
    if (!all) {
      return;
    }
    dispatch('multiSelPanes', { all: false });
  }
}

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
          .reduce((acc, el) => acc + el.offsetWidth, endPaneMinWidth);
        const adjustMouseX = e.clientX - $splitter.offsetLeft;
        const handler = resizeSplitHandler($targetPane, $splitter, subWidth + 16, adjustMouseX);
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
  setIncludeUrl(includeUrl: boolean, dispatch: Dispatch) {
    toggleClass('checked-include-url', includeUrl)(this);
    dispatch('changeIncludeUrl', includeUrl, true);
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
      }),
      keyupMain: makeAction({
        target: this,
        eventType: 'keyup',
        eventOnly: true,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('setIncludeUrl', (changes) => this.setIncludeUrl(changes.newValue, store.dispatch));
    store.subscribe('searching', (changes) => toggleClass('searching', changes.newValue)(this));
    store.subscribe('clickAppMain', (_, e) => clickAppMain(e, this.#options, store.dispatch));
    store.subscribe('dragging', (changes) => this.classList.toggle('drag-start', changes.newValue));
    store.subscribe('keydownMain', (_, e) => keydown(e, store.getStates, store.dispatch));
    store.subscribe('keyupMain', (_, e) => keyup(e, store.getStates, store.dispatch));
  }
}
