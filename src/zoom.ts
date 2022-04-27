import { Options } from './types';
import { $, getLocal, setSplitWidth } from './common';

type ZoomingElements = {
  $main: HTMLElement,
  $shadeLeft: HTMLElement,
  $shadeRight: HTMLElement,
  $query: HTMLElement,
  $iconHistory: HTMLElement,
  $iconAngleRight: HTMLElement,
}

type ZoomingElementsArgs = Partial<ZoomingElements> & Pick<ZoomingElements, '$main'>;

function getZoomingElements({ $main, ...rest }: ZoomingElementsArgs): ZoomingElements {
  return {
    $main,
    $shadeLeft: rest.$shadeLeft || $('.shade-left')!,
    $shadeRight: rest.$shadeRight || $('.shade-right')!,
    $query: rest.$query || $('.query')!,
    $iconHistory: rest.$iconHistory || $('.zoom-out.icon-clock-rotate-left-solid')!,
    $iconAngleRight: rest.$iconAngleRight || $('.zoom-out.icon-fa-angle-right')!,
  };
}

function relocateGrid(
  $target: HTMLElement,
  $main: HTMLElement,
  $query: HTMLElement,
  queryWidth: string,
) {
  const gridColStart = getComputedStyle($target).gridColumnStart;
  const $title = $main.children[Number(gridColStart) - 1] as HTMLElement;
  $query.style.setProperty('width', queryWidth);
  $title.insertAdjacentElement('beforeend', $('.form-query')!);
  $query.focus();
}

function restoreGrid($main: HTMLElement, $query: HTMLElement) {
  $main.insertBefore($query.parentElement!, $('.pane-history'));
  $query.parentElement!.style.removeProperty('width');
  $query.parentElement!.style.removeProperty('overflow');
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
    $iconHistory,
  } = getZoomingElements(elements);
  return () => {
    $query.parentElement!.style.setProperty('overflow', 'hidden');
    $query.parentElement!.style.setProperty('width', '0');
    $iconHistory.style.setProperty('left', '-100px');
    $main.style.removeProperty('transform');
    const promise1 = new Promise<void>((resolve) => {
      $shadeLeft.addEventListener('transitionend', () => {
        document.body.classList.remove('zoom-center');
        $main.classList.remove('zoom-pane', 'zoom-fade-out');
        restoreGrid($main, $query);
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

async function enterZoom(
  $target: HTMLElement,
  elements: ZoomingElements,
  zoomRatio: number,
  zoomHistory: Options['zoomHistory'],
) {
  const {
    $main,
    $shadeLeft,
    $shadeRight,
    $query,
    $iconAngleRight,
    $iconHistory,
  } = elements;
  if ($main.classList.contains('zoom-pane')) {
    return;
  }
  const isCenter = [...$target.classList].some((className) => ['leafs', 'pane-tabs'].includes(className));
  const width = $main.offsetWidth * zoomRatio;
  const queryWidth = getComputedStyle($query).width;
  const promise1 = new Promise<void>((resolve) => {
    $target.addEventListener('transitionend', () => {
      $main.classList.add('zoom-pane');
      relocateGrid($target, $main, $query, queryWidth);
      resolve();
    }, { once: true });
  });
  $target.style.setProperty('width', `${width}px`);
  $shadeRight.style.setProperty('left', `${$target.offsetLeft + width + 4}px`);
  $shadeLeft.style.setProperty('left', `calc(-100% + ${$target.offsetLeft - 4}px)`);
  if (isCenter) {
    const offset = ($main.offsetWidth - width) / 2 - $target.offsetLeft;
    $main.style.setProperty('transform', `translateX(${offset}px)`);
    $iconHistory.style.setProperty('left', `${-offset + 5}px`);
    $iconAngleRight.style.setProperty('right', `${offset + 5}px`);
    document.body.classList.add('zoom-center');
  } else {
    $iconHistory.style.setProperty('left', '-100px');
    $iconAngleRight.style.setProperty('right', '5px');
  }
  async function mouseenter(ev: MouseEvent) {
    clearTimeout(timerZoom);
    const $shade = ev.target as HTMLElement;
    if ($shade.classList.contains('shade-left')) {
      await Promise.all([promise1, ...zoomOut($target, elements, mouseenter)()]);
      if (zoomHistory) {
        enterZoom($('.pane-history')!, elements, zoomRatio, zoomHistory);
      }
      return;
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
    if (!document.body.classList.contains('auto-zoom')) {
      return;
    }
    clearTimeout(timerZoom);
    const isBreak = [...$main.classList].some((className) => ['zoom-pane', 'drag-start-leaf', 'drag-start-folder'].includes(className));
    if (isBreak) {
      return;
    }
    const $target = e.target as HTMLElement;
    $target.addEventListener('mouseleave', () => clearTimeout(timerZoom), { once: true });
    timerZoom = setTimeout(() => {
      enterZoom($target, elements, zoomRatio, options.zoomHistory);
    }, 500);
  };
}
