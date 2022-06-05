import { State, ColorPalette, defaultColorPalette } from './types';
import { setBrowserIcon } from './draw-svg';

import {
  $, $byClass,
  pipe,
  getColorWhiteness,
  getColorChroma,
  prop,
  getRGB,
  lightColorWhiteness,
  insertHTML,
  objectEqaul,
  addListener,
  rmClass,
  addClass,
  hasClass,
} from './common';

type ColorInfo = {
  color: string;
  whiteness: number;
  chroma: number;
  vivid: number;
}

type Options = State['options'];

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

// function changeSelectColor([p, f, h, s1, s2]: ColorInfo[]) {
//   return s1.chroma < s2.chroma
//     ? [p, f, h, s1, s2]
//     : [p, f, h, s2, s1];
// }

function flipSelectColor([p, f, h, s1, s2]: ColorInfo[]) {
  return [p, f, h, s2, s1];
}

function flipHoverColor([p, f, h1, h2, m]: ColorInfo[]) {
  return [p, f, h2, h1, m];
}

function getRGBDiff(a: ColorInfo, b: ColorInfo) {
  const [r1, g1, b1] = getRGB(a.color);
  const [r2, g2, b2] = getRGB(b.color);
  return Math.abs(r2 - r1) + Math.abs(g2 - g1) + Math.abs(b2 - b1);
}

function changeHoverColor([p, f, h1, h2, m]: ColorInfo[]) {
  return getRGBDiff(p, h1) > getRGBDiff(p, h2) ? [p, f, h1, h2, m] : [p, f, h2, h1, m];
}

function getColorPaletteHTML(
  palettes: ColorInfo[][],
  options: Options,
  addon1 = changeHoverColor,
) {
  return palettes
    .map(addon1)
    .map((palette) => {
      const colors = palette
        .map((color) => {
          const isLight = color.whiteness > lightColorWhiteness;
          return `<div data-color="${color.color}" style="background-color: #${color.color}; color: ${isLight ? 'black' : 'white'}"></div>`;
        })
        .join('');
      if (objectEqaul(palette.map(prop('color')), options.colorPalette, true)) {
        return `<div class="selected">${colors}</div>`;
      }
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
    .filter((el, i, self) => !self.slice(0, i).find((pre) => objectEqaul(el, pre, true)));
}

function recombiPalette(palettes: ColorInfo[][], colorMatchTh: number) {
  const recomibined = palettes
    .concat(palettes.map(flipSelectColor))
    .concat(palettes.map(flipHoverColor).map(flipSelectColor))
    .concat(palettes.map(flipHoverColor))
    .concat(palettes.map(flipSelectColor).map(flipHoverColor))
    .concat(palettes.map(flipSelectColor).map(flipHoverColor).map(flipSelectColor))
    .flatMap(([p, f], _, self) => self.filter(
      ([p1, f1]) => p.color === p1.color && f.color === f1.color,
    ));
  return filterUnmatchColor(recomibined, colorMatchTh);
}

export default async function setColorPalette({ options }: Pick<State, 'options'>) {
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

  const other = base.filter(
    ([paneBg, frameBg]) => (
      paneBg.whiteness <= lightColorWhiteness && frameBg.whiteness > lightColorWhiteness
    )
    || (
      paneBg.whiteness > lightColorWhiteness && frameBg.whiteness <= lightColorWhiteness
    ),
  );
  const htmlOther = getColorPaletteHTML(recombiPalette(other, 200), options, (a) => a);

  const dark1 = base.filter(
    ([paneBg, frameBg]) => paneBg.whiteness <= lightColorWhiteness
      && frameBg.whiteness <= lightColorWhiteness,
  );

  const lightTheme = base
    .concat([...dark1, ...other].map(
      (palette) => palette.concat().sort((a, b) => b.whiteness - a.whiteness),
    ))
    .filter(([paneBg]) => paneBg.whiteness > lightColorWhiteness)
    .filter(([, frameBg]) => frameBg.whiteness > lightColorWhiteness);

  const darkOrVivid = [...other, ...lightTheme]
    .map((palette) => palette.concat().sort((a, b) => a.whiteness - b.whiteness))
    .filter(
      ([paneBg, frameBg]) => paneBg.whiteness <= lightColorWhiteness
      && frameBg.whiteness <= lightColorWhiteness,
    )
    .concat(dark1);

  const htmlDarkTheme = getColorPaletteHTML(recombiPalette(darkOrVivid, 200), options, (a) => a);

  const lightThemesAndDefault = [
    addColorSpec(defaultColorPalette),
    ...recombiPalette(lightTheme, 80),
  ];
  const htmlLightTheme = getColorPaletteHTML(lightThemesAndDefault, options, (a) => a);

  const $colorPalettes = $byClass('color-palettes')!;
  pipe(
    insertHTML('beforeend', '<div class="desc">Light theme</div>'),
    insertHTML('beforeend', htmlLightTheme),
    insertHTML('beforeend', '<div class="desc">Dark theme</div>'),
    insertHTML('beforeend', htmlDarkTheme),
    insertHTML('beforeend', '<div class="desc">Mix</div>'),
    insertHTML('beforeend', htmlOther),
    addListener('click', (e) => {
      const $target = e.target as HTMLElement;
      if (hasClass($target, 'desc')) {
        return;
      }
      if ($target.parentElement !== $colorPalettes) {
        return;
      }
      const palette = ([...$target.children] as HTMLElement[])
        .map((el) => el.dataset.color as string) as ColorPalette;
      $<ColorPaletteClass>('[is="color-palette"]')!.value = palette;
      rmClass('selected')($byClass('selected'));
      addClass('selected')($target);
    }),
  )($colorPalettes);
}
