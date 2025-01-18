import { Options } from './types';
import { base64Encode, getColorChroma, getColorWhiteness } from './common';

let creating: Promise<void> | undefined;

async function setupOffscreenDocument(path: string) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'reason for needing the document',
    });
    await creating;
    creating = undefined;
  }
}

export async function getImageData(svg: string) {
  const svgData = await base64Encode(svg);
  return new Promise<ImageData>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.width);
      resolve(imageData);
    };
    img.setAttribute('src', `data:image/svg+xml;base64,${svgData}`);
  });
}

async function dispatchGetImageData(svg: string) {
  if (typeof Image === 'undefined') {
    await setupOffscreenDocument('offscreen.html');
    const resp = await chrome.runtime.sendMessage({ type: 'getImageData', svg });
    const imageData = Uint8ClampedArray.from(resp.data);
    return new ImageData(imageData, resp.width);
  }
  return getImageData(svg);
}

export async function getSvgBrowserIcon(colorPalette: Options['colorPalette']) {
  const [first, ...rest] = colorPalette;
  const accent = rest.reduce((acc, color) => {
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
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="19" height="19" stroke-width="0" fill="#${accent}">
    <defs>
      <filter id="shadow-main">
        <feOffset dx="0" dy="0"></feOffset>
        <feGaussianBlur stdDeviation="10" result="offset-blur"></feGaussianBlur>
        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"></feComposite>
        <feFlood flood-color="#000000" flood-opacity="0.5" result="color"></feFlood>
        <feComposite operator="in" in="color" in2="inverse" result="shadow"></feComposite>
        <feComposite operator="over" in="shadow" in2="SourceGraphic"></feComposite>
      </filter>
      <filter id="shadow-onepoint">
        <feOffset dx="355" dy="-355"></feOffset>
        <feGaussianBlur stdDeviation="10" result="offset-blur"></feGaussianBlur>
        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"></feComposite>
        <feFlood flood-color="#FFFFFF" flood-opacity=".7" result="color"></feFlood>
        <feComposite operator="in" in="color" in2="inverse" result="shadow"></feComposite>
        <feComposite operator="over" in="shadow" in2="SourceGraphic"></feComposite>
      </filter>
    </defs>
    <path d="M36 0 l72 0 q36 0 36 36 l0 72 a20 20 0 1 0 40 0 l0 -72 q0 -36 36 -36 l72 0 q36 0 36 36 l0 72 a20 20 0 1 0 40 0 l0 -72 q0 -36 36 -36 l72 0 q36 0 36 36 l0 72 q0 36 -36 36 l-72 0 a20 20 0 1 0 0 40 l72 0 q36 0 36 36 l0 72 q0 36 -36 36 l-72 0 a20 20 0 1 0 0 40 l72 0 q36 0 36 36 l0 72 q0 36 -36 36 l-72 0 q-36 0 -36 -36 l0 -72 a20 20 0 1 0 -40 0 l0 72 q0 36 -36 36 l-72 0 q-36 0 -36 -36 l0 -72 a20 20 0 1 0 -40 0 l0 72 q0 36 -36 36 l-72 0 q-36 0 -36 -36 l0 -72 q0 -36 36 -36 l72 0 a20 20 0 1 0 0 -40 l-72 0 q-36 0 -36 -36 l0 -72 q0 -36 36 -36 l72 0 a20 20 0 1 0 0 -40 l-72 0 q-36 0 -36 -36 l0 -72 q0 -36 36 -36 z M292 144 l-72 0 a20 20 0 1 0 0 40 l72 0 a20 20 0 1 0 0 -40 z M292 328 l-72 0 a20 20 0 1 0 0 40 l72 0 a20 20 0 1 0 0 -40 z M184 292 l0 -72 a20 20 0 1 0 -40 0 l0 72 a20 20 0 1 0 40 0 z M368 292 l0 -72 a20 20 0 1 0 -40 0 l0 72 a20 20 0 1 0 40 0 z" filter="url(#shadow-onepoint) url(#shadow-main)"></path><path d="M404 0 h72 q36 0 36 36 v72 q0 36 -36 36 h-72 q-36 0 -36 -36 v-72 q0 -36 36 -36z"></path>
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

export function setToolbarIcon(colorPalette: Options['colorPalette']) {
  getSvgBrowserIcon(colorPalette)
    .then(dispatchGetImageData)
    .then((imageData) => chrome.action.setIcon({ imageData }));
}
