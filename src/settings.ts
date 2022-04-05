/* eslint-disable max-classes-per-file */

import './settings.scss';

import { State, ColorPalette } from './types';
import {
  $, $$, curry, getSync, setSync, setLocal, bootstrap, pipeP, whichClass, pipe, tap, objectEqaul,
} from './utils';
import {
  InputMonacoEditor, SelectEditorTheme, ColorPaletteClass, monaco,
} from './settings-classes';

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

function initMonacoEditor({ options }: Pick<State, 'options'>) {
  const editor = monaco.editor.create($('.css-editor')!, {
    language: 'css',
    automaticLayout: true,
  });
  $<InputMonacoEditor>('[name="css"]')!.initialize(editor);
  $<SelectEditorTheme>('[name="editor-theme"]')!.initialize(monaco.editor);
  return { options };
}

function setVersion() {
  $('.version')!.textContent = `Version ${chrome.runtime.getManifest().version}`;
}

async function setColorPalette({ options }: Pick<State, 'options'>) {
  const palettes: ColorPalette[] = await fetch('./color-palette1.json').then((resp) => resp.json());
  const htmlList = palettes
    .filter(([,, [, frameIsLight]]) => frameIsLight)
    .map((palette) => {
      const colors = palette
        .map(([color, isLight]) => `<div data-color="${color}" data-is-light="${isLight}" style="background-color: #${color};"></div>`)
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
      .map((el) => [el.dataset.color as string, el.dataset.isLight === 'true']) as ColorPalette;
    $<ColorPaletteClass>('[is="color-palette"]')!.value = palette;
    $('.selected')?.classList.remove('selected');
    $target.classList.add('selected');
  });
}

pipeP(
  tap(setVersion),
  initMonacoEditor,
  tap(setColorPalette),
  initInputs,
  setSyncListener,
  saveOptions,
  curry(document.addEventListener)('change'),
)(bootstrap('options'));
