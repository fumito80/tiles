/* eslint-disable import/prefer-default-export */

import { Options } from './types';
import {
  setEvents, addListener,
  last, getColorWhiteness, lightColorWhiteness, camelToSnake,
} from './common';
import DragAndDropEvents from './drag-drop';
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
import { ISubscribeElement, Store } from './store';
import { resetVScrollData } from './vscroll';

export class AppMain extends HTMLElement implements ISubscribeElement {
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
      ...(options.zoomHistory ? [$byClass('histories', this)] : []),
      ...(options.zoomTabs ? [$byClass('tabs', this)] : []),
    ];
    setEvents([...panes], { mouseenter: setZoomSetting(this, options) });
    toggleClass('disable-zoom-history', !options.zoomHistory)(this);
    toggleClass('disable-zoom-tabs', !options.zoomTabs)(this);
  }
  setEvents(store: Store) {
    this.addEventListener('click', (e) => {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'main-menu-button', 'query')) {
        return;
      }
      if (hasClass($target, 'leaf-menu-button')) {
        showMenu('leaf-menu')(e);
        return;
      }
      if ($target.hasAttribute('contenteditable')) {
        return;
      }
      store.dispatch('focusQuery');
    });
    const ddEvents = new DragAndDropEvents(store);
    const dragAndDropEvents = Object.getOwnPropertyNames(Object.getPrototypeOf(ddEvents))
      .filter((name) => name !== 'constructor')
      .reduce((acc, name) => ({ ...acc, [name]: (ddEvents as any)[name] }), {});
    setEvents([this], dragAndDropEvents, undefined, ddEvents);
  }
  setIncludeUrl(store: Store, includeUrl: boolean, isInit: boolean) {
    toggleClass('checked-include-url', includeUrl)(this);
    store.dispatch('changeIncludeUrl', includeUrl, true);
    if (isInit) {
      return;
    }
    resetVScrollData((data) => data);
  }
  connect(store: Store) {
    store.subscribe('setIncludeUrl', (changes, isInit) => this.setIncludeUrl(store, changes.newValue, isInit));
    store.subscribe('searching', (changes) => toggleClass('searching', changes.newValue)(this));
    this.setEvents(store);
  }
}
