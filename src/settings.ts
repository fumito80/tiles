import './settings.scss';
import {
  $,
  $$,
  curry,
  getSync,
  setSync,
  setLocal,
  bootstrap,
  pipeP,
  whichClass,
  pipe,
  tap,
  objectEqaul,
  getColorWhiteness,
  setBrowserIcon,
} from './utils';
import { State, ColorPalette } from './types';
import { InputMonacoEditor, SelectEditorTheme } from './monaco-editor';

class ColorPaletteClass extends HTMLDivElement {
  #value?: ColorPalette;
  get value() {
    return this.#value!;
  }
  set value(value: ColorPalette) {
    this.#value = value;
    value.forEach((color, i) => {
      const el = this.children[i] as HTMLDivElement || this.appendChild(document.createElement('div'));
      el.style.setProperty('background-color', `#${color}`);
      el.dataset.color = color;
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

function setVersion() {
  $('.version')!.textContent = `Version ${chrome.runtime.getManifest().version}`;
}

async function setColorPalette({ options }: Pick<State, 'options'>) {
  const palettes: ColorPalette[] = await fetch('./color-palette1.json').then((resp) => resp.json());
  const htmlList = palettes
    .filter(([,, frameBg]) => getColorWhiteness(frameBg) > 0.6)
    .map((palette) => {
      const colors = palette
        .map((color) => {
          const whiteness = getColorWhiteness(color);
          const isLight = whiteness > 0.6;
          return `<div data-color="${color}" style="background-color: #${color}; color: ${isLight ? 'black' : 'white'}"></div>`;
        })
        .join('');
      if (objectEqaul(palette, options.colorPalette, true)) {
        return `<div class="selected">${colors}</div>`;
      }
      return `<div>${colors}</div>`;
    }).join('');
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
  return { options };
}

type InitParams = {
  el: HTMLElement;
  inputMonacoEditor: InputMonacoEditor;
  selectEditorTheme: SelectEditorTheme;
}

function initMonacoEditor({ el, inputMonacoEditor, selectEditorTheme }: InitParams) {
  import('./monaco-editor').then(({ monaco }) => {
    const editor = monaco.editor.create(el, {
      language: 'css',
      automaticLayout: true,
    });
    inputMonacoEditor.initialize(editor);
    selectEditorTheme.initialize(monaco.editor);
  });
}

pipeP(
  tap(setColorPalette),
  tap(setVersion),
  initInputs,
  setSyncListener,
  saveOptions,
  curry(document.addEventListener)('change'),
  () => ({
    el: $('.css-editor')!,
    inputMonacoEditor: $<InputMonacoEditor>('[name="css"]')!,
    selectEditorTheme: $<SelectEditorTheme>('[name="editor-theme"]')!,
  }),
  initMonacoEditor,
)(bootstrap('options'));
