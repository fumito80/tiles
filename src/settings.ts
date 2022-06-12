import './css/settings.scss';
import * as bootstrap from 'bootstrap';
import { State } from './types';
import './settings-layout';
import { InputMonacoEditor, SelectEditorTheme } from './monaco-editor';
import './settings-colors';
import {
  $, $$, $byTag, $byClass, $byId,
  curry, pipe, tap,
  getSync, setSync, setLocal,
  bootstrap as myBootstrap,
  whichClass,
  objectEqaul,
  addListener,
  rmClass, addClass, setText, hasClass,
  camelToSnake,
  setPopupStyle,
} from './common';

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

function getInputValue(inputs: Inputs[OptionNames]) {
  const [input, ...rest] = inputs;
  switch (input.type) {
    case 'checkbox':
      return input.disabled ? false : input.checked;
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
  return async (e: Event) => {
    const { options: { css, colorPalette } } = await pipe(getOptions, setLocal)(inputs);
    const name = (e.target as Element).getAttribute('name');
    if (['color-palette', 'css'].includes(name!)) {
      setPopupStyle({ css, colorPalette });
    }
  };
}

function setSyncListener(inputs: Inputs) {
  $byClass('chrome-sync')?.addEventListener('click', async (e) => {
    const className = whichClass(['upload-sync', 'download-sync'] as const, e.target as HTMLButtonElement);
    switch (className) {
      case 'upload-sync':
        pipe(getOptions, setSync)(inputs);
        break;
      case 'download-sync': {
        const options = await getSync('options');
        if (Object.keys(options).length === 0) {
          break;
        }
        const currentOptions = getOptions(inputs);
        if (objectEqaul(options, currentOptions, true)) {
          break;
        }
        pipe(tap(initInputs), setLocal)(options);
        const $article = $byTag('article')!;
        pipe(
          addListener('animationend', () => rmClass('blink')($article), { once: true }),
          rmClass('blink'),
          addClass('blink'),
        )($article);
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
  setText(`Version ${version}`)($byClass('version'));
  setText(name)($byTag('title'));
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

async function restoreCss() {
  // eslint-disable-next-line no-restricted-globals
  // eslint-disable-next-line no-alert
  const anser = window.confirm('Reset CSS settings to default.\nAre you sure?');
  if (anser === true) {
    const css = await fetch('./default.css').then((resp) => resp.text());
    $<HTMLInputElement>('input[name="css"]')!.value = css;
  }
}

function initOthers() {
  $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));
  $byId('customize-css')?.addEventListener('shown.bs.collapse', async () => {
    const $editorCollapse = $byId('customize-css')!;
    if (hasClass($editorCollapse, 'loaded')) {
      return;
    }
    await initMonacoEditor({
      el: $byClass('css-editor')!,
      inputMonacoEditor: $('[name="css"]')!,
      selectEditorTheme: $('[name="editor-theme"]')!,
    });
    addClass('loaded')($editorCollapse);
  });
  $byClass('restore-css')?.addEventListener('click', restoreCss);
}

const init = pipe(
  tap<Pick<State, 'options'>>(setAppInfo),
  initInputs,
  setSyncListener,
  saveOptions,
  curry(document.addEventListener)('change'),
  initOthers,
);

myBootstrap('options').then(init);
