import { Options } from './types';
import {
  $, $$,
  getLocal, pipe, setSplitWidth, addStyle, addClass, rmStyle, getGridColStart, last,
} from './common';

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
    $shadeLeft: rest.$shadeLeft || $('.shade-left')!,
    $shadeRight: rest.$shadeRight || $('.shade-right')!,
    $query: rest.$query || $('.query')!,
    $iconAngleLeft: rest.$iconAngleLeft || $('.zoom-out.icon-fa-angle-right.left')!,
    $iconAngleRight: rest.$iconAngleRight || $('.zoom-out.icon-fa-angle-right.right')!,
  };
}

function relocateGrid(
  $target: HTMLElement,
  $query: HTMLElement,
  queryWidth: string,
) {
  const gridColStart = getGridColStart($target);
  const $header = $$('.pane-header')[gridColStart];
  const $form = $query.parentElement!;
  addStyle('width', queryWidth)($query);
  $('.query-wrap', $header)!.append($form);
  $query.focus();
}

function restoreGrid($query: HTMLElement) {
  const $form = $query.parentElement!;
  const $endTitle = last($$('.pane-header'));
  $('.query-wrap', $endTitle)!.append($form);
  rmStyle('width')($query);
  rmStyle('width')($form);
  rmStyle('overflow')($form);
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
    pipe(addStyle('overflow', 'hidden'), addStyle('width', '0'))($form);
    addStyle('left', '-100px')($iconAngleLeft);
    $main.style.removeProperty('transform');
    const promise1 = new Promise<void>((resolve) => {
      $shadeLeft.addEventListener('transitionend', () => {
        document.body.classList.remove('zoom-center');
        $main.classList.remove('zoom-pane', 'zoom-fade-out');
        restoreGrid($query);
        resolve();
      }, { once: true });
    });
    const promise2 = new Promise((resolve) => {
      $main.addEventListener('transitionend', resolve, { once: true });
    });
    $main.classList.add('zoom-fade-out');
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
  if ($main.classList.contains('zoom-pane')) {
    return;
  }
  const gridColStart = getGridColStart($target);
  const isCenter = gridColStart !== 0;
  const width = $main.offsetWidth * zoomRatio;
  const queryWidth = getComputedStyle($query).width;
  const promise1 = new Promise<void>((resolve) => {
    $target.addEventListener('transitionend', () => {
      addClass('zoom-pane')($main);
      relocateGrid($target, $query, queryWidth);
      resolve();
    }, { once: true });
  });
  addStyle('width', `${width}px`)($target);
  addStyle('left', `${$target.offsetLeft + width + 4}px`)($shadeRight);
  addStyle('left', `calc(-100% + ${$target.offsetLeft - 4}px)`)($shadeLeft);
  const $safetyZoneRight = $('.safety-zone-right');
  if (isCenter) {
    const offset = ($main.offsetWidth - width) / 2 - $target.offsetLeft;
    addStyle('transform', `translateX(${offset}px)`)($main);
    addStyle('left', `${-offset + 5}px`)($iconAngleLeft);
    addStyle('right', `${offset + 5}px`)($iconAngleRight);
    addClass('zoom-center')(document.body);
    rmStyle('left')($safetyZoneRight);
  } else {
    addStyle('left', '-100px')($iconAngleLeft);
    addStyle('right', '5px')($iconAngleRight);
    addStyle('left', `calc(${zoomRatio * 100}% + 8px)`)($safetyZoneRight);
  }
  async function mouseenter(ev: MouseEvent) {
    if ($main.classList.contains('drag-start-leaf')) {
      return;
    }
    clearTimeoutZoom();
    const $shade = ev.target as HTMLElement;
    if ($shade.classList.contains('shade-left')) {
      const $leftPane = $target.previousElementSibling as HTMLElement;
      if ((options.zoomHistory && $leftPane.classList.contains('histories'))
        || (options.zoomTabs && $leftPane.classList.contains('tabs'))) {
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
    if (!$main.classList.contains('auto-zoom')) {
      return;
    }
    clearTimeoutZoom();
    const isBreak = [...$main.classList].some((className) => ['zoom-pane', 'drag-start-leaf', 'drag-start-folder'].includes(className));
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
