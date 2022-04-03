/* eslint-disable max-classes-per-file */

import './settings.scss';
import * as monaco from 'monaco-editor';

import { State } from './types';
import {
  $, $$, curry, getSync, setSync, setLocal, bootstrap, pipeP, whichClass, pipe, tap, objectEqaul,
} from './utils';

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

class MonacoEditor extends HTMLInputElement {
  editor?: monaco.editor.IStandaloneCodeEditor;
  get value() {
    return this.editor?.getValue() ?? '';
  }
  set value(value: string) {
    this.editor?.setValue(value);
  }
  setEditor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
    const $form = $<HTMLFormElement>('form')!;
    this.editor.getModel()?.onDidChangeContent(() => {
      $form.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

customElements.define('monaco-editor', MonacoEditor, { extends: 'input' });

class EditorTheme extends HTMLSelectElement {
  editor?: typeof monaco.editor;
  get value() {
    return super.value;
  }
  set value(value: string) {
    super.value = value;
    this.setTheme(value);
  }
  setEditor(editor: typeof monaco.editor) {
    this.editor = editor;
    this.addEventListener('change', () => this.setTheme(super.value));
  }
  setTheme(theme: string) {
    this.editor?.setTheme(theme);
  }
}

customElements.define('monaco-editor-theme', EditorTheme, { extends: 'select' });

function initMonacoEditor({ options }: Pick<State, 'options'>) {
  const editor = monaco.editor.create($('.css-editor')!, {
    language: 'css',
    automaticLayout: true,
  });
  $<MonacoEditor>('[name="css"]')!.setEditor(editor);
  $<EditorTheme>('[name="editor-theme"]')!.setEditor(monaco.editor);
  return { options };
}

pipeP(
  initMonacoEditor,
  initInputs,
  setSyncListener,
  saveOptions,
  curry(document.addEventListener)('change'),
)(bootstrap('options'));
