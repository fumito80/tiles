import { editor } from 'monaco-editor';

export { editor };

export class InputMonacoEditor extends HTMLInputElement {
  #editor?: editor.IStandaloneCodeEditor;
  override get value() {
    return this.#editor?.getValue() ?? '';
  }
  override set value(value: string) {
    this.#editor?.setValue(value);
  }
  initialize(monaco: editor.IStandaloneCodeEditor) {
    this.#editor = monaco;
    this.#editor?.setValue(super.value);
    this.#editor.getModel()?.onDidChangeContent(() => {
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
    super.value = '';
  }
}

customElements.define('monaco-editor', InputMonacoEditor, { extends: 'input' });

export class SelectEditorTheme extends HTMLSelectElement {
  #editor?: typeof editor;
  override get value() {
    return super.value;
  }
  override set value(value: string) {
    super.value = value;
    this.#setTheme();
  }
  initialize(monaco: typeof editor) {
    this.#editor = monaco;
    this.#setTheme();
    this.addEventListener('change', this.#setTheme);
  }
  #setTheme() {
    this.#editor?.setTheme(super.value);
  }
}

customElements.define('monaco-editor-theme', SelectEditorTheme, { extends: 'select' });
