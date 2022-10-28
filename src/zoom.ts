import { Options } from './types';
import { getLocal, getGridColStart } from './common';
import {
  $, $$byClass, $byClass,
  setSplitWidth, addStyle, addClass, rmStyle, rmClass, hasClass,
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

function relocateGrid(
  $target: HTMLElement,
  $query: HTMLElement,
) {
  const gridColStart = getGridColStart($target);
  const $header = $$byClass('pane-header')[gridColStart];
  const $form = $query.parentElement!;
  $byClass('query-wrap', $header)!.append($form);
  $query.focus();
}

function restoreGrid($query: HTMLElement) {
  const $form = $query.parentElement!;
  const $endTitle = $('.pane-header.end')!;
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
    rmStyle('transform')($byClass('pane-header'));
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
    const promise3 = getLocal('settings')
      .then(({ settings: { paneWidth } }) => setSplitWidth(paneWidth))
      .then(() => new Promise((resolve) => {
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
  const gridColStart = getGridColStart($target);
  const isCenter = gridColStart !== 0;
  const width = $main.offsetWidth * zoomRatio;
  const promise1 = new Promise<void>((resolve) => {
    $target.addEventListener('transitionend', () => {
      addClass('zoom-pane')($main);
      relocateGrid($target, $query);
      resolve();
    }, { once: true });
  });
  const $safetyZoneRight = $byClass('safety-zone-right');
  rmStyle('width')($safetyZoneRight);
  addStyle('width', `${width}px`)($target);
  addStyle('left', `${$target.offsetLeft + width + 4}px`)($shadeRight);
  addStyle('left', `calc(-100% + ${$target.offsetLeft - 4}px)`)($shadeLeft);
  let shiftSafetyZone: number;
  if (isCenter) {
    const offset = ($main.offsetWidth - width) / 2 - $target.offsetLeft;
    addStyle('transform', `translateX(${offset}px)`)($main);
    addStyle('left', `${-offset + 5}px`)($iconAngleLeft);
    addStyle('right', `${offset + 5}px`)($iconAngleRight);
    addStyle('transform', `translateX(${-offset}px)`)($byClass('pane-header'));
    addClass('zoom-center')($main);
    shiftSafetyZone = $target.offsetLeft + (offset > 0 ? 14 - offset : 4);
    if (zoomRatio >= 0.9) {
      addStyle('width', '10px')($safetyZoneRight);
    }
  } else {
    addStyle('left', '-100px')($iconAngleLeft);
    addStyle('right', '5px')($iconAngleRight);
    shiftSafetyZone = 8;
  }
  addStyle('left', `calc(${zoomRatio * 100}% + ${shiftSafetyZone}px)`)($safetyZoneRight);
  async function mouseenter(ev: MouseEvent) {
    if (hasClass($main, 'drag-start')) {
      return;
    }
    clearTimeoutZoom();
    const $shade = ev.target as HTMLElement;
    if (hasClass($shade, 'shade-left')) {
      const $leftPane = $target.previousElementSibling as HTMLElement;
      if ((options.zoomHistory && hasClass($leftPane, 'histories'))
        || (options.zoomTabs && hasClass($leftPane, 'tabs'))) {
        await Promise.all([promise1, ...zoomOut($target, elements, mouseenter)()]);
        enterZoom($leftPane, elements, zoomRatio, options);
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
  return (e: Event) => {
    if (!hasClass($main, 'auto-zoom')) {
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
