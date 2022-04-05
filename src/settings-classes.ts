/* eslint-disable max-classes-per-file */

import * as monaco from 'monaco-editor';
import { ColorPalette } from './types';
import { setBrowserIcon } from './utils';

export * as monaco from 'monaco-editor';

export class InputMonacoEditor extends HTMLInputElement {
  #editor?: monaco.editor.IStandaloneCodeEditor;
  get value() {
    return this.#editor?.getValue() ?? '';
  }
  set value(value: string) {
    this.#editor?.setValue(value);
  }
  initialize(editor: monaco.editor.IStandaloneCodeEditor) {
    this.#editor = editor;
    this.#editor.getModel()?.onDidChangeContent(() => {
      this.form?.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

customElements.define('monaco-editor', InputMonacoEditor, { extends: 'input' });

export class SelectEditorTheme extends HTMLSelectElement {
  #editor?: typeof monaco.editor;
  get value() {
    return super.value;
  }
  set value(value: string) {
    super.value = value;
    this.setTheme(value);
  }
  initialize(editor: typeof monaco.editor) {
    this.#editor = editor;
    this.addEventListener('change', () => this.setTheme(super.value));
  }
  setTheme(theme: string) {
    this.#editor?.setTheme(theme);
  }
}

customElements.define('monaco-editor-theme', SelectEditorTheme, { extends: 'select' });

export class ColorPaletteClass extends HTMLDivElement {
  #value?: ColorPalette;
  get value() {
    return this.#value!;
  }
  set value(value: ColorPalette) {
    this.#value = value;
    value.forEach(([color], i) => {
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
