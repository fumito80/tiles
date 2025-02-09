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
  const [accent] = colorPalette
    .filter((color) => getColorWhiteness(color) < 0.7)
    .sort((a, b) => Math.sign(getColorChroma(b) - getColorChroma(a)));
  // const [r, g, b] = /(..)(..)(..)/.exec(accent)!.slice(1).map((x) => parseInt(x, 16));
  // const ref = Math.max(r, g, b) + Math.min(r, g, b);
  // const complementary = [r, g, b].map((x) => (ref - x).toString(16).padStart(2, '0')).join('');
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="19" height="19" stroke-width="0" fill="#${accent}">
    <defs>
      <filter id="shadow">
        <feOffset dx="0" dy="0"></feOffset>
        <feGaussianBlur stdDeviation="10" result="offset-blur"></feGaussianBlur>
        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"></feComposite>
        <feFlood flood-color="#000000" flood-opacity="0.8" result="color"></feFlood>
        <feComposite operator="in" in="color" in2="inverse" result="shadow"></feComposite>
        <feComposite operator="over" in="shadow" in2="SourceGraphic"></feComposite>
      </filter>
      <filter id="blend">
        <feOffset dx="600" dy="-600"></feOffset>
        <feGaussianBlur stdDeviation="10" result="offset-blur"></feGaussianBlur>
        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"></feComposite>
        <feFlood flood-color="#FFFFFF" flood-opacity=".7" result="color"></feFlood>
        <feComposite operator="in" in="color" in2="inverse" result="shadow"></feComposite>
        <feComposite operator="over" in="shadow" in2="SourceGraphic"></feComposite>
      </filter>
    </defs>
    <rect fill="#${accent}" x="20" y="20" width="560" height="560" rx="130" filter="url(#blend)"></rect><path d=" M200 60 h80 q40 0 40 40 v80 q0 40 40 40 h80 q40 0 40 40 v80 q0 40 -40 40 h-80 q-40 0 -40 40 v80 q0 40 -40 40 h-80 q-40 0 -40 -40 v-80 q0 -40 40 -40 h80 q40 0 40 -40 v-80 q0 -40 -40 -40 h-80 q-40 0 -40 -40 v-80 q0 -40 40 -40 z" filter="url(#shadow)"></path>
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
