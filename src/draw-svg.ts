import { Options } from './types';
import {
  base64Encode, getColorWhiteness, getColorChroma,
} from './common';

async function getImageData(svg: string) {
  return new Promise<ImageData>((resolve) => {
    base64Encode(svg).then((base64) => {
      const img = new Image();
      img.onload = () => {
        const canvas = new OffscreenCanvas(28, 28);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 28, 28);
        const imageData = ctx.getImageData(0, 0, 28, 28);
        resolve(imageData);
      };
      img.src = `data:image/svg+xml;charset=utf-8;base64,${base64}`;
    });
  });
}

async function getSvgBrowserIcon(colorPalette: Options['colorPalette']) {
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
  const d = 'M5 3 L15 3 C15 9 14 11 8 11 M8 10 C7 15 7 15 3 16';
  return `
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path stroke-width="5" stroke="#${outer}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>
      <path stroke-width="2" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>
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

export function getSvgUrl() {
  return `
    <svg width="128" height="128" viewBox="0 0 128 128" stroke-linejoin="round" stroke-linecap="round" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect stroke="#000000" stroke-width="5" x="3" y="13" width="123" height="102" rx="10" ry="10"></rect>
      <path fill="#000000" d="M15 98 L25 98 L55 30 L45 30 z" />
      <path fill="#000000" d="M15 98 L25 98 L55 30 L45 30 z" transform="translate(30,0)"/>
      <rect fill="#000000" x="95" y="40" width="15" height="15" rx="5" ry="5" />
      <rect fill="#000000" x="95" y="73" width="15" height="15" rx="5" ry="5" />
    </svg>
  `;
}

export function setSvg(el: HTMLImageElement, svg: string) {
  base64Encode(svg).then((base64) => {
    el.setAttribute('src', `data:image/svg+xml;charset=utf-8;base64,${base64}`);
  });
}

export function setBrowserIcon(colorPalette: Options['colorPalette']) {
  getSvgBrowserIcon(colorPalette)
    .then(getImageData)
    .then((imageData) => chrome.browserAction.setIcon({ imageData }));
}
