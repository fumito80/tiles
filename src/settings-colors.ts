import { ColorPalette } from './types';

import {
  getColorWhiteness,
  getColorChroma,
  getRGB,
  lightColorWhiteness,
  objectEqaul,
} from './common';

type ColorInfo = {
  color: string;
  whiteness: number;
  chroma: number;
  vivid: number;
}

function getRGBDiff(a: ColorInfo, b: ColorInfo) {
  const [r1, g1, b1] = getRGB(a.color);
  const [r2, g2, b2] = getRGB(b.color);
  return Math.abs(r2 - r1) + Math.abs(g2 - g1) + Math.abs(b2 - b1);
}

function flipSelectColor([p, f, h, s1, s2]: ColorInfo[]) {
  return [p, f, h, s2, s1];
}

function flipHoverColor([p, f, h1, h2, m]: ColorInfo[]) {
  return [p, f, h2, h1, m];
}

function changeSelectColorChroma3([p, f, s1, s2, s3]: ColorInfo[]) {
  const diff1 = s1.chroma * (1.0 - s1.whiteness);
  const diff2 = s2.chroma * (1.0 - s2.whiteness);
  const diff3 = s3.chroma * (1.0 - s3.whiteness);
  if (diff1 < diff2 && diff3 < diff2) {
    return [p, f, s1, s3, s2];
  }
  if (diff2 < diff1 && diff3 < diff1) {
    return [p, f, s2, s3, s1];
  }
  return [p, f, s1, s2, s3];
}

function changeHoverColorChroma2([p, f, h1, h2, s]: ColorInfo[]) {
  const diff1 = h1.chroma * (1 - h1.whiteness);
  const diff2 = h2.chroma * (1 - h2.whiteness);
  if (diff1 < diff2) {
    return [p, f, h2, h1, s];
  }
  return [p, f, h1, h2, s];
}

function changeSelectColorChroma3Dark([p, f, s1, s2, s3]: ColorInfo[]) {
  const diff1 = s1.chroma * (3 - s1.whiteness);
  const diff2 = s2.chroma * (3 - s2.whiteness);
  const diff3 = s3.chroma * (3 - s3.whiteness);
  if (diff1 < diff2 && diff3 < diff2) {
    return [p, f, s1, s3, s2];
  }
  if (diff2 < diff1 && diff3 < diff1) {
    return [p, f, s2, s3, s1];
  }
  return [p, f, s1, s2, s3];
}

function changeHoverColorChroma2Dark([p, f, h1, h2, s]: ColorInfo[]) {
  const diff1 = h1.chroma * (h1.whiteness);
  const diff2 = h2.chroma * (h2.whiteness);
  if (diff1 < diff2) {
    return [p, f, h2, h1, s];
  }
  return [p, f, h1, h2, s];
}

export function getColorPaletteHTML(
  palettes: ColorInfo[][],
) {
  return palettes
    .map((palette) => {
      const colors = palette
        .map((color) => {
          const isLight = color.whiteness > lightColorWhiteness;
          return `<div data-color="${color.color}" style="background-color: #${color.color}; color: ${isLight ? 'black' : 'white'}"></div>`;
        })
        .join('');
      return `<div>${colors}</div>`;
    })
    .join('');
}

export function addColorSpec(palette: ColorPalette) {
  return palette
    .map((color) => ({
      color,
      whiteness: getColorWhiteness(color),
      chroma: getColorChroma(color),
    } as ColorInfo))
    .map((color) => ({ ...color, vivid: color.chroma * (color.whiteness * 0.1) }));
}

function filterUnmatchColor(palettes: ColorInfo[][], colorMatchTh: number) {
  return palettes
    .filter(([p, f, h]) => getRGBDiff(p, h) > colorMatchTh && getRGBDiff(f, h) > colorMatchTh)
    .filter(([p, f,,, s]) => getRGBDiff(p, s) > colorMatchTh && getRGBDiff(f, s) > colorMatchTh)
    .filter(([p, f], i, self) => !self.slice(0, i).find(
      ([p1, f1]) => objectEqaul({ p, f }, { p: p1, f: f1 }, true),
    ));
}

export function recombiPalette(palettes: ColorInfo[][], colorMatchTh: number) {
  const recomibined = palettes.map(changeSelectColorChroma3).map(changeHoverColorChroma2)
    .concat(palettes.map(flipHoverColor).map(flipSelectColor))
    .concat(palettes)
    .concat(palettes.map(flipSelectColor))
    .concat(palettes.map(flipSelectColor).map(flipHoverColor).map(flipSelectColor))
    .concat(palettes.map(flipSelectColor).map(flipHoverColor))
    .concat(palettes.map(flipHoverColor))
    .flatMap(([p, f], _, self) => self.filter(
      ([p1, f1]) => p.color === p1.color && f.color === f1.color,
    ));
  return filterUnmatchColor(recomibined, colorMatchTh);
}

export function recombiPaletteDark(palettes: ColorInfo[][], colorMatchTh: number) {
  const recomibined = palettes.map(changeSelectColorChroma3Dark).map(changeHoverColorChroma2Dark)
    .concat(palettes.map(flipHoverColor).map(flipSelectColor))
    .concat(palettes)
    .concat(palettes.map(flipSelectColor))
    .concat(palettes.map(flipHoverColor))
    .concat(palettes.map(flipSelectColor).map(flipHoverColor))
    .concat(palettes.map(flipSelectColor).map(flipHoverColor).map(flipSelectColor))
    .flatMap(([p, f], _, self) => self.filter(
      ([p1, f1]) => p.color === p1.color && f.color === f1.color,
    ));
  return filterUnmatchColor(recomibined, colorMatchTh);
}
