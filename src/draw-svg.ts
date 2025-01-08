/* eslint-disable no-undef */
import { Canvg } from 'canvg';
import { DOMParser } from '@xmldom/xmldom';
import { Options } from './types';
import { base64Encode, getColorChroma, getColorWhiteness } from './common';

declare const DOMParser2: {
  prototype: globalThis.DOMParser;
  new(): globalThis.DOMParser;
};

async function getImageData(svg: string) {
  return new Promise<ImageData>((resolve) => {
    const canvas = new OffscreenCanvas(19, 19);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const canvg = Canvg.fromString(ctx, svg, {
      DOMParser: DOMParser as unknown as typeof DOMParser2,
    });
    canvg.render({ enableRedraw: true })
      .then(() => ctx.getImageData(0, 0, 19, 19))
      .then(resolve);
  });
}

export async function getSvgBrowserIcon(colorPalette: Options['colorPalette']) {
  const [first, ...rest] = colorPalette;
  const outer = rest.reduce((acc, color) => {
    const whiteness = getColorWhiteness(color);
    if (whiteness > 0.8) {
      return acc;
    }
    const whitenessAcc = getColorWhiteness(acc);
    if (whitenessAcc > 0.8) {
      return color;
    }
    if (getColorChroma(acc) >= getColorChroma(color)) {
      return acc;
    }
    return color;
  }, first);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="19" height="19" fill="#1D3557">
      <path d="M94 504 L 94 170 A 148 148 0 1 1 304 290 C 240 318 105 350 112 504 z" stroke="white" stroke-width="5" stroke-linejoin="round" />
      <circle fill="#${outer}" cx="240" cy="158" r="65" />
    </svg>
  `;
}

export function getSvgZoomIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" stroke="#000000" class="icon-zoom" width="128" height="128" viewBox="0 0 128 128" stroke-linejoin="round" stroke-linecap="round" fill="none">
      <path stroke-width="10" d="M20 64 L108 64" />
      <path stroke-width="10" d="M40 44 L20 64 L40 84" />
      <path stroke-width="10" d="M88 44 L108 64 L88 84" />
      <path stroke-width="10" d="M5 20 L5 108" />
      <path stroke-width="10" d="M123 20 L123 108" />
    </svg>
  `;
}

export function setSvg(el: HTMLImageElement, svg: string) {
  base64Encode(svg).then((base64) => {
    el.setAttribute('href', `data:image/svg+xml;charset=utf-8;base64,${base64}`);
  });
}

export function setToolbarIcon(colorPalette: Options['colorPalette']) {
  getSvgBrowserIcon(colorPalette)
    .then(getImageData)
    .then((imageData) => chrome.action.setIcon({ imageData }));
}
