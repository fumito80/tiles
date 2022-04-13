import './css/settings.scss';
import * as bootstrap from 'bootstrap';
import {
  $,
  $$,
  curry,
  getSync,
  setSync,
  setLocal,
  bootstrap as myBootstrap,
  whichClass,
  pipe,
  tap,
  objectEqaul,
  getColorWhiteness,
  getColorChroma,
  setBrowserIcon,
  prop,
  getRGB,
  lightColorWhiteness,
} from './utils';
import { State, ColorPalette } from './types';
import { InputMonacoEditor, SelectEditorTheme } from './monaco-editor';

class ColorPaletteClass extends HTMLDivElement {
  #value?: ColorPalette;
  #inputs: HTMLInputElement[];
  constructor() {
    super();
    this.#inputs = [...this.children] as HTMLInputElement[];
    this.#inputs.forEach((el) => {
      el.addEventListener('change', () => {
        this.#value = this.#inputs.map((input) => input.value.substring(1)) as ColorPalette;
      });
    });
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

type Options = State['options'];
type OptionNames = keyof Options;
type Inputs = { [key in OptionNames]: Array<HTMLInputElement> };

// @ts-ignore
// eslint-disable-next-line no-restricted-globals
self.MonacoEnvironment = {
  getWorkerUrl: (_: any, label: string) => {
    if (label === 'css') {
      return './css.worker.js';
    }
    return './editor.worker.js';
  },
};

function camelToSnake(value: string) {
  return value.split('').map((s) => [s, s.toLowerCase()]).map(([s, smallS]) => (s === smallS ? s : `-${smallS}`)).join('');
}

function getInputValue(inputs: Inputs[OptionNames]) {
  const [input, ...rest] = inputs;
  switch (input.type) {
    case 'checkbox':
      return (input as HTMLInputElement).checked;
    case 'radio':
      return [input, ...rest].find((el) => el.checked)!.value;
    default:
      return input.validity.valid ? input.value : null;
  }
}

function setInputValue(inputs: Inputs[OptionNames], value: any) {
  const [input, ...rest] = inputs;
  switch (input.type) {
    case 'checkbox':
      (input as HTMLInputElement).checked = !!value;
      break;
    case 'radio':
      [input, ...rest].find((el) => el.value === value)!.checked = true;
      break;
    default:
      input.value = value;
  }
}

function initInputs({ options }: Pick<State, 'options'>) {
  const $form = $<HTMLFormElement>('form')!;
  return Object.entries(options).reduce((acc, [key, value]) => {
    const inputName = camelToSnake(key);
    const inputElements = $$<HTMLInputElement>(`[name="${inputName}"]`, $form);
    if (inputElements.length === 0) {
      return acc;
    }
    setInputValue(inputElements, value);
    return { ...acc, [key]: inputElements };
  }, {} as Inputs);
}

function getOptions(inputs: Inputs) {
  const options = Object.entries(inputs).reduce((acc, [key, input]) => {
    const value = getInputValue(input);
    return { ...acc, [key]: value };
  }, {} as Options);
  return { options };
}

function saveOptions(inputs: Inputs) {
  return () => pipe(getOptions, setLocal)(inputs);
}

function setSyncListener(inputs: Inputs) {
  $('.chrome-sync')?.addEventListener('click', async (e) => {
    const className = whichClass(['upload-sync', 'download-sync'] as const, e.target as HTMLButtonElement);
    switch (className) {
      case 'upload-sync':
        pipe(getOptions, setSync)(inputs);
        break;
      case 'download-sync': {
        const options = await getSync('options');
        const currentOptions = getOptions(inputs);
        if (objectEqaul(options, currentOptions, true)) {
          break;
        }
        pipe(tap(initInputs), setLocal)(options);
        const $article = $('article')!;
        $article.addEventListener('animationend', () => $article.classList.remove('blink'), { once: true });
        $article.classList.remove('blink');
        $article.classList.add('blink');
        break;
      }
      default:
    }
  });
  chrome.storage.onChanged.addListener((_, areaName) => {
    if (areaName === 'sync') {
      // eslint-disable-next-line no-alert
      alert('Changes uploaded.');
    }
  });
  return inputs;
}

function setAppInfo() {
  const { version, name } = chrome.runtime.getManifest() as chrome.runtime.Manifest;
  $('.version')!.textContent = `Version ${version}`;
  $('title')!.textContent = name;
}

type ColorInfo = {
  color: string;
  whiteness: number;
  chroma: number;
  vivid: number;
}

async function setColorPalette({ options }: Pick<State, 'options'>) {
  const palettes: ColorPalette[] = await fetch('./color-palette1.json').then((resp) => resp.json());
  const htmlList = palettes
    .map((palette) => palette.map((color) => ({
      color,
      whiteness: getColorWhiteness(color),
      chroma: getColorChroma(color),
    } as ColorInfo)))
    .map((palette) => palette.map((color) => ({
      ...color, vivid: color.chroma * (color.whiteness * 0.1),
    })))
    .map((palette) => [...palette].sort((x, y) => x.vivid - y.vivid))
    .map(([a, b, c, d, e]) => [a, b, c, d].sort((x, y) => x.chroma - y.chroma).concat(e))
    .map(([p, cl, cm, cr, m]) => {
      if (cl.whiteness <= lightColorWhiteness) {
        return (cm.whiteness > lightColorWhiteness) ? [p, cm, cl, cr, m] : [p, cr, cl, cm, m];
      }
      return [p, cl, cm, cr, m];
    })
    .filter(([, frameBg]) => frameBg.whiteness > lightColorWhiteness)
    .map(([p, f, h1, h2, m]) => {
      const [r, g, b] = getRGB(p.color);
      const [r1, g1, b1] = getRGB(h1.color);
      const [r2, g2, b2] = getRGB(h2.color);
      return ((Math.abs(r1 - r) + Math.abs(g1 - g) + Math.abs(b1 - b))
        > (Math.abs(r2 - r) + Math.abs(g2 - g) + Math.abs(b2 - b)))
        ? [p, f, h1, h2, m]
        : [p, f, h2, h1, m];
    })
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
  const $colorPalettes = $('.color-palettes')!;
  $colorPalettes.innerHTML = htmlList;
  $colorPalettes.addEventListener('click', (e) => {
    const $target = e.target as HTMLElement;
    if ($target.parentElement !== $colorPalettes) {
      return;
    }
    const palette = ([...$target.children] as HTMLElement[])
      .map((el) => el.dataset.color as string) as ColorPalette;
    $<ColorPaletteClass>('[is="color-palette"]')!.value = palette;
    $('.selected')?.classList.remove('selected');
    $target.classList.add('selected');
  });
}

type InitParams = {
  el: HTMLElement;
  inputMonacoEditor: InputMonacoEditor;
  selectEditorTheme: SelectEditorTheme;
}

async function initMonacoEditor({ el, inputMonacoEditor, selectEditorTheme }: InitParams) {
  return import('./monaco-editor').then(({ monaco }) => {
    const editor = monaco.editor.create(el, {
      language: 'css',
      automaticLayout: true,
    });
    inputMonacoEditor.initialize(editor);
    selectEditorTheme.initialize(monaco.editor);
  });
}

function initOthers() {
  $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));
  $('#customize-css')!.addEventListener('shown.bs.collapse', async () => {
    const $editorCollapse = $('#customize-css')!;
    if ($editorCollapse.classList.contains('loaded')) {
      return;
    }
    await initMonacoEditor({
      el: $('.css-editor')!,
      inputMonacoEditor: $('[name="css"]')!,
      selectEditorTheme: $('[name="editor-theme"]')!,
    });
    $editorCollapse.classList.add('loaded');
  });
}

const init = pipe(
  tap<Pick<State, 'options'>>(setAppInfo),
  tap(setColorPalette),
  initInputs,
  setSyncListener,
  saveOptions,
  curry(document.addEventListener)('change'),
  initOthers,
);

myBootstrap('options').then(init);
