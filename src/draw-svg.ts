import { Options } from './types';
import { base64Encode } from './common';

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
    const imageData = Uint8ClampedArray.from(Object.values(resp.data));
    return new ImageData(imageData, resp.width);
  }
  return getImageData(svg);
}

export async function getSvgBrowserIcon(colorPalette: Options['colorPalette']) {
  const [,,,, accent] = colorPalette;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" stroke-width="0" fill="whitesmoke">
        <defs>
          <filter id="shadow">
            <feOffset dx="0" dy="-80"></feOffset>
            <feGaussianBlur stdDeviation="30" result="offset-blur"></feGaussianBlur>
            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"></feComposite>
            <feFlood flood-color="#000000" flood-opacity=".4" result="color"></feFlood>
            <feComposite operator="in" in="color" in2="inverse" result="shadow"></feComposite>
            <feComposite operator="over" in="shadow" in2="SourceGraphic"></feComposite>
          </filter>
        </defs>
      <rect x="0" y="0" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="184" y="0" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="368" y="0" width="144" height="144" rx="30" style="filter:url(#shadow)" fill="#${accent}"></rect><rect x="0" y="184" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="184" y="184" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="368" y="184" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="0" y="368" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="184" y="368" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect><rect x="368" y="368" width="144" height="144" rx="30" style="filter:url(#shadow)"></rect>
    </svg>`;
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
