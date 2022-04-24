import { $ } from './common';

function drawZoomIcon() {
  const svg = $('.zoom-icon')!;
  svg.innerHTML = `
    <path stroke-width="10" d="M20 64 L108 64" />
    <path stroke-width="10" d="M40 44 L20 64 L40 84" />
    <path stroke-width="10" d="M88 44 L108 64 L88 84" />
    <rect stroke-width="7" x="5" y="15" width="118" height="98" rx="20" ry="20"></rect>
  `;
}

export default function drawSvg() {
  drawZoomIcon();
}
