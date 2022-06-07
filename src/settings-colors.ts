import * as bootstrap from 'bootstrap';
import { ColorPalette, defaultColorPalette } from './types';
import { setBrowserIcon } from './draw-svg';

import {
  $, $byClass,
  getColorWhiteness,
  getColorChroma,
  getRGB,
  lightColorWhiteness,
  insertHTML,
  objectEqaul,
  addListener,
  rmClass,
  addClass,
  hasClass,
  $byId,
  getLocal,
  $$,
} from './common';

type ColorInfo = {
  color: string;
  whiteness: number;
  chroma: number;
  vivid: number;
}

class ColorPaletteClass extends HTMLDivElement {
  #value?: ColorPalette;
  #inputs: HTMLInputElement[];
  constructor() {
    super();
    this.#inputs = [...this.children] as HTMLInputElement[];
    this.#inputs.forEach(
      addListener('change', () => {
        this.#value = this.#inputs.map((input) => input.value.substring(1)) as ColorPalette;
      }),
    );
  }
  get value() {
    return this.#value!;
  }
  set value(value: ColorPalette) {
    this.#value = value;
    value.forEach((color, i) => {
      const input = this.children[i] as HTMLInputElement;
      input.value = `#${color}`;
    });
    this.dispatchEvent(new Event('change', { bubbles: true }));
    setBrowserIcon(value);
  }
  // eslint-disable-next-line class-methods-use-this
  get validity() {
    return { valid: true };
  }
}

customElements.define('color-palette', ColorPaletteClass, { extends: 'div' });

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

function getColorPaletteHTML(
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

function addColorSpec(palette: ColorPalette) {
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

function recombiPalette(palettes: ColorInfo[][], colorMatchTh: number) {
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

function recombiPaletteDark(palettes: ColorInfo[][], colorMatchTh: number) {
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

export default async function makeColorPalette() {
  const palettes: ColorPalette[] = await fetch('./color-palette1.json').then((resp) => resp.json());
  const base = palettes
    .map(addColorSpec)
    .map((palette) => [...palette].sort((x, y) => x.vivid - y.vivid))
    .map(([a, b, c, d, e]) => [a, b, c, d].sort((x, y) => x.chroma - y.chroma).concat(e))
    .map(([p, cl, cm, cr, m]) => {
      if (cl.whiteness <= lightColorWhiteness) {
        return (cm.whiteness > lightColorWhiteness) ? [p, cm, cl, cr, m] : [p, cr, cl, cm, m];
      }
      return [p, cl, cm, cr, m];
    });

  const others = base.filter(
    ([paneBg, frameBg]) => (
      paneBg.whiteness <= lightColorWhiteness && frameBg.whiteness > lightColorWhiteness
    )
    || (
      paneBg.whiteness > lightColorWhiteness && frameBg.whiteness <= lightColorWhiteness
    ),
  );
  const other = getColorPaletteHTML(recombiPalette(others, 100));

  const dark1 = base.filter(
    ([paneBg, frameBg]) => paneBg.whiteness <= lightColorWhiteness
      && frameBg.whiteness <= lightColorWhiteness,
  );

  const lightTheme = base
    .concat([...dark1, ...others].map(
      (palette) => palette.concat().sort((a, b) => b.whiteness - a.whiteness),
    ))
    .filter(([paneBg]) => paneBg.whiteness > lightColorWhiteness)
    .filter(([, frameBg]) => frameBg.whiteness > lightColorWhiteness);

  const darkOrVivid = [...others, ...lightTheme]
    .map((palette) => palette.concat().sort((a, b) => a.whiteness - b.whiteness))
    .filter(
      ([paneBg, frameBg]) => paneBg.whiteness <= lightColorWhiteness
      && frameBg.whiteness <= lightColorWhiteness,
    )
    .concat(dark1);

  const dark = getColorPaletteHTML(recombiPaletteDark(darkOrVivid, 100));

  const lightThemesAndDefault = [
    addColorSpec(defaultColorPalette),
    ...recombiPalette(lightTheme, 80),
  ];
  const light = getColorPaletteHTML(lightThemesAndDefault);

  return { light, dark, other };
}

getLocal('settings', 'options').then(({ settings: { theme }, options }) => {
  insertHTML('beforeend', theme.light)($byId('light-theme'));
  insertHTML('beforeend', theme.dark)($byId('dark-theme'));
  insertHTML('beforeend', theme.other)($byId('mix-theme'));

  const $selected = $$('.tab-pane > div').find((el) => ([...el.children] as HTMLElement[]).every(
    (color, i) => color.dataset.color === options.colorPalette[i],
  ));
  if ($selected) {
    addClass('selected')($selected);
    const tab = new bootstrap.Tab($(`[aria-controls="${$selected.parentElement!.id}"]`)!);
    $byId('color-palettes').addEventListener('shown.bs.collapse', () => {
      ($selected as any).scrollIntoViewIfNeeded();
    }, { once: true });
    tab?.show();
  }

  addListener('click', (e) => {
    const $target = e.target as HTMLElement;
    if (!hasClass($target.parentElement, 'tab-pane')) {
      return;
    }
    const palette = ([...$target.children] as HTMLElement[])
      .map((el) => el.dataset.color as string) as ColorPalette;
    $<ColorPaletteClass>('[is="color-palette"]')!.value = palette;
    rmClass('selected')($byClass('selected'));
    addClass('selected')($target);
  })($byClass('tab-content'));
});
