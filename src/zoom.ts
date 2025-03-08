import { Options } from './types';
import { getLocal } from './common';
import {
  $, $byClass, $$byClass,
  initSplitWidth, addStyle, addClass, rmStyle, rmClass, hasClass,
} from './client';

type ZoomingElements = {
  $main: HTMLElement,
  $shadeLeft: HTMLElement,
  $shadeRight: HTMLElement,
  $query: HTMLElement,
  $iconAngleLeft: HTMLElement,
  $iconAngleRight: HTMLElement,
}

type ZoomingElementsArgs = Partial<ZoomingElements> & Pick<ZoomingElements, '$main'>;

function getZoomingElements({ $main, ...rest }: ZoomingElementsArgs): ZoomingElements {
  return {
    $main,
    $shadeLeft: rest.$shadeLeft || $byClass('shade-left')!,
    $shadeRight: rest.$shadeRight || $byClass('shade-right')!,
    $query: rest.$query || $byClass('query')!,
    $iconAngleLeft: rest.$iconAngleLeft || $('.zoom-out.icon-fa-angle-right.left')!,
    $iconAngleRight: rest.$iconAngleRight || $('.zoom-out.icon-fa-angle-right.right')!,
  };
}

function relocateGrid($target: HTMLElement, $query: HTMLElement) {
  const $header = $byClass('pane-header', $target);
  const $form = $query.parentElement!;
  $byClass('query-wrap', $header)!.append($form);
  $query.focus();
}

function restoreGrid($query: HTMLElement) {
  const $form = $query.parentElement!;
  const $endTitle = $('.end .pane-header')!;
  $byClass('query-wrap', $endTitle)!.append($form);
  rmStyle('width', 'overflow')($form);
  $query.focus();
}

export function zoomOut(
  $target: HTMLElement,
  elements: ZoomingElementsArgs,
  mouseenter?: (_: MouseEvent) => void,
) {
  const {
    $main,
    $shadeLeft,
    $shadeRight,
    $query,
    $iconAngleLeft,
  } = getZoomingElements(elements);
  return () => {
    const $form = $query.parentElement!;
    addStyle({ overflow: 'hidden', width: '0' })($form);
    addStyle('left', '-100px')($iconAngleLeft);
    rmStyle('transform')($main);
    rmStyle('transform')($('.pane-header > i')!);
    const promise1 = new Promise<void>((resolve) => {
      $shadeLeft.addEventListener('transitionend', () => {
        rmClass('zoom-pane', 'zoom-fade-out', 'zoom-center')($main);
        restoreGrid($query);
        resolve();
      }, { once: true });
    });
    const promise2 = new Promise((resolve) => {
      $main.addEventListener('transitionend', resolve, { once: true });
    });
    addClass('zoom-fade-out')($main);
    const promise3 = getLocal('settings', 'options')
      .then(({ settings, options }) => initSplitWidth(settings, options))
      .then(() => new Promise((resolve) => {
        rmStyle('width')($target);
        $target.addEventListener('transitionend', resolve, { once: true });
      }));
    if (mouseenter) {
      $shadeLeft.removeEventListener('mouseenter', mouseenter);
      $shadeRight.removeEventListener('mouseenter', mouseenter);
    }
    return [promise1, promise2, promise3];
  };
}

let timerZoom: ReturnType<typeof setTimeout>;

export function clearTimeoutZoom() {
  clearTimeout(timerZoom);
}

async function enterZoom(
  $target: HTMLElement,
  elements: ZoomingElements,
  zoomRatio: number,
  options: Options,
) {
  const {
    $main,
    $shadeLeft,
    $shadeRight,
    $query,
    $iconAngleLeft,
    $iconAngleRight,
  } = elements;
  if (hasClass($main, 'zoom-pane')) {
    return;
  }
  // const gridColStart = getGridColStart($target);
  const gridCol = $$byClass('col-grid').indexOf($target);
  const isCenter = gridCol !== 0;
  const width = $main.offsetWidth * zoomRatio;
  const gridTemplateColumns = $main.style.getPropertyValue('grid-template-columns');
  let colWidthPer = '';
  const newValue = gridTemplateColumns.split(' ').map((el, i) => {
    if (i === gridCol * 2) {
      colWidthPer = el;
      return 'auto';
    }
    return el;
  }).join(' ');
  const currentWidth = $main.offsetWidth * (parseFloat(colWidthPer) / 100);
  $main.style.setProperty('grid-template-columns', newValue);
  addStyle('width', `${currentWidth}px`)($target);
  const promise1 = new Promise<void>((resolve) => {
    $target.addEventListener('transitionend', () => {
      addClass('zoom-pane')($main);
      relocateGrid($target, $query);
      resolve();
    }, { once: true });
  });
  const $safetyZoneRight = $byClass('safety-zone-right')!;
  rmStyle('width')($safetyZoneRight);
  setTimeout(() => addStyle('width', `${width}px`)($target), 0);
  addStyle('left', `${$target.offsetLeft + width + 4}px`)($shadeRight);
  addStyle('left', `calc(-100% + ${$target.offsetLeft - 4}px)`)($shadeLeft);
  let shiftSafetyZone: number;
  if (isCenter) {
    const offset = ($main.offsetWidth - width) / 2 - $target.offsetLeft;
    addStyle('transform', `translateX(${offset}px)`)($main);
    addStyle('left', `${-offset + 5}px`)($iconAngleLeft);
    addStyle('right', `${offset + 5}px`)($iconAngleRight);
    addStyle('transform', `translateX(${-offset}px)`)($('.pane-header > i')!);
    addClass('zoom-center')($main);
    shiftSafetyZone = $target.offsetLeft + (offset > 0 ? 12 - offset : 2);
    if (zoomRatio >= 0.9) {
      addStyle('width', '10px')($safetyZoneRight);
    }
  } else {
    addStyle('left', '-100px')($iconAngleLeft);
    addStyle('right', '5px')($iconAngleRight);
    shiftSafetyZone = 0;
  }
  addStyle('left', `calc(${zoomRatio * 100}% + ${shiftSafetyZone}px)`)($safetyZoneRight);
  async function mouseenter(ev: MouseEvent) {
    if (hasClass($main, 'drag-start')) {
      return;
    }
    clearTimeoutZoom();
    const $shade = ev.target as HTMLElement;
    if (hasClass($shade, 'shade-left')) {
      if (options.wider1) {
        await Promise.all([promise1, ...zoomOut($target, elements, mouseenter)()]);
        enterZoom($target, elements, zoomRatio, options);
        return;
      }
    }
    timerZoom = setTimeout(zoomOut($target, elements, mouseenter), 500);
  }
  $shadeLeft.addEventListener('mouseenter', mouseenter);
  $shadeRight.addEventListener('mouseenter', mouseenter);
}

export function setZoomSetting($main: HTMLElement, options: Options) {
  const elements = getZoomingElements({ $main });
  const zoomRatio = Number.parseFloat(options.zoomRatio);
  return (e: MouseEvent) => {
    if (e.buttons !== 0) {
      return;
    }
    clearTimeoutZoom();
    const isBreak = hasClass($main, 'zoom-pane', 'drag-start');
    if (isBreak) {
      return;
    }
    const $target = e.target as HTMLElement;
    $target.addEventListener('mouseleave', clearTimeoutZoom, { once: true });
    timerZoom = setTimeout(() => {
      enterZoom($target, elements, zoomRatio, options);
    }, 500);
  };
}
