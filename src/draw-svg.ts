/* eslint-disable no-undef */
import { Canvg, IOptions, presets } from 'canvg';
import { DOMParser } from '@xmldom/xmldom';
import { Options } from './types';
import { base64Encode, getColorWhiteness } from './common';

const preset = presets.offscreen({ DOMParser });

async function getImageData(svg: string) {
  return new Promise<ImageData>((resolve) => {
    const canvas = new OffscreenCanvas(19, 19);
    const ctx = canvas.getContext('2d')!;
    const canvg = Canvg.fromString(ctx, svg, preset as IOptions);
    canvg.render({ enableRedraw: true })
      .then(() => ctx.getImageData(0, 0, 19, 19))
      .then(resolve);
  });
}

export async function getSvgBrowserIcon(colorPalette: Options['colorPalette']) {
  const [, frame] = colorPalette;
  let outerStroke = 'F5F5F5';
  if (getColorWhiteness(frame) > ((getColorWhiteness('FFFFFF') - getColorWhiteness('000000')) / 2)) {
    outerStroke = '14213D';
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="19" height="19">
    <g stroke-width="20" stroke-linejoin="round" shape-rendering="optimizeQuality">
      <path fill="#${frame}" stroke="#${outerStroke}" d="M86 504 L 86 175 A 175 175 0 1 1 260 360 l -70 0 z" />
      <circle fill="#${outerStroke}" cx="262" cy="185" r="80" />
    </g>
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
