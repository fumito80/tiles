/* eslint-disable import/prefer-default-export */

import { Options } from './types';
import {
  setEvents, addListener,
  last, getColorWhiteness, lightColorWhiteness, camelToSnake,
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
} from './client';
import {
  Dispatch, IPubSubElement, makeAction, States, Store,
} from './store';
import { resetVScrollData } from './vscroll';

const excludeClasses = [
  'anchor',
  'leaf',
  'multi-sel-menu-button',
  'show',
  'start-multi-select',
  'tab-wrap', 'outline',
  'collapse-tabs',
  'collapse-tab',
  'window', 'tab',
  'tabs-menu-button',
  'folder-menu-button',
];

async function clickAppMain(e: MouseEvent, dispatch: Dispatch) {
  const $target = e.target as HTMLElement;
  if (hasClass($target, ...excludeClasses)) {
    return;
  }
  dispatch('multiSelPanes', { leafs: false, tabs: false, history: false });
  if (hasClass($target, 'leaf-menu-button')) {
    showMenu('leaf-menu')(e);
    dispatch('multiSelPanes', { leafs: false });
    return;
  }
  if (hasClass($target, 'main-menu-button')) {
    return;
  }
  if ($target.hasAttribute('contenteditable')) {
    return;
  }
  dispatch('focusQuery');
}

async function keydown(e: KeyboardEvent, states: States, dispatch: Dispatch) {
  if (e.key === 'Shift') {
    const { leafs, tabs, history } = await states('multiSelPanes');
    if (leafs || tabs || history) {
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
  init(options: Options, isSearching: boolean) {
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
  setIncludeUrl(store: Store, includeUrl: boolean, isInit: boolean) {
    toggleClass('checked-include-url', includeUrl)(this);
    store.dispatch('changeIncludeUrl', includeUrl, true);
    if (isInit) {
      return;
    }
    resetVScrollData((data) => data);
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
          leafs: false,
          tabs: false,
          history: false,
          all: false,
        } as {
          leafs?: boolean,
          tabs?: boolean,
          history?: boolean,
          all?: boolean,
        },
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
    store.subscribe('setIncludeUrl', (changes) => this.setIncludeUrl(store, changes.newValue, changes.isInit));
    store.subscribe('searching', (changes) => toggleClass('searching', changes.newValue)(this));
    store.subscribe('clickAppMain', (_, __, dispatch, e) => clickAppMain(e, dispatch));
    store.subscribe('dragging', (changes) => this.classList.toggle('drag-start', changes.newValue));
    store.subscribe('keydownMain', (_, states, dispatch, e) => keydown(e, states, dispatch));
    store.subscribe('keyupMain', (_, states, dispatch, e) => keyup(e, states, dispatch));
  }
}
