import { Options } from './types';
import { setEvents, addListener, last } from './common';
import dragAndDropEvents from './drag-drop';
import { setZoomSetting } from './zoom';
import {
  $byTag, $byClass, $$byClass,
  hasClass, toggleClass,
  setResizeHandler,
  setSplitterHandler,
  resizeSplitHandler,
  resizeWidthHandler,
  resizeHeightHandler,
  getEndPaneMinWidth,
  showMenu,
} from './client';

export default function setEventListners(options: Options) {
  const $main = $byTag('main')!;
  setEvents([$main], {
    click(e) {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'main-menu-button')) {
        return;
      }
      if (hasClass($target, 'leaf-menu-button')) {
        showMenu('leaf-menu')(e);
        return;
      }
      if ($target.hasAttribute('contenteditable')) {
        return;
      }
      $byClass('query')!.focus();
    },
    ...dragAndDropEvents,
  });

  const $paneBodies = $$byClass('pane-body');
  const $endHeaderPane = last($$byClass('pane-header'))!;
  const $endBodyPane = last($paneBodies)!;

  $$byClass('split-h').forEach(($splitter, i) => {
    const $targetPane = $paneBodies[i];
    addListener('mousedown', (e: MouseEvent) => {
      if (hasClass($main, 'auto-zoom')) {
        return;
      }
      const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
      const subWidth = $paneBodies
        .filter((el) => el !== $targetPane && !hasClass(el, 'end'))
        .reduce((acc, el) => acc + el.offsetWidth, endPaneMinWidth);
      const adjustMouseX = e.clientX - $splitter.offsetLeft;
      const handler = resizeSplitHandler($targetPane, $splitter, subWidth + 16, adjustMouseX);
      setSplitterHandler(handler);
    })($splitter);
  });

  $byClass('resize-x')?.addEventListener('mousedown', (e) => {
    const endPaneMinWidth = getEndPaneMinWidth($endHeaderPane);
    setResizeHandler(resizeWidthHandler(
      $endBodyPane,
      document.body.offsetWidth + e.screenX,
      endPaneMinWidth,
    ));
  });

  $byClass('resize-y')?.addEventListener('mousedown', () => setResizeHandler(resizeHeightHandler));

  const panes = [
    ...(options.zoomHistory ? [$byClass('histories')] : []),
    ...(options.zoomTabs ? [$byClass('tabs')] : []),
  ];
  setEvents([...panes], { mouseenter: setZoomSetting($main, options) });
  toggleClass('disable-zoom-history', !options.zoomHistory)($main);
  toggleClass('disable-zoom-tabs', !options.zoomTabs)($main);
}
