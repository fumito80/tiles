import * as monaco from 'monaco-editor';

export * as monaco from 'monaco-editor';

export class InputMonacoEditor extends HTMLInputElement {
  #editor?: monaco.editor.IStandaloneCodeEditor;
  override get value() {
    return this.#editor?.getValue() ?? '';
  }
  override set value(value: string) {
    super.value = value;
    this.#editor?.setValue(super.value);
  }
  initialize(editor: monaco.editor.IStandaloneCodeEditor) {
    this.#editor = editor;
    this.#editor?.setValue(super.value);
    this.#editor.getModel()?.onDidChangeContent(() => {
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
    super.value = '';
  }
}

customElements.define('monaco-editor', InputMonacoEditor, { extends: 'input' });

export class SelectEditorTheme extends HTMLSelectElement {
  #editor?: typeof monaco.editor;
  override get value() {
    return super.value;
  }
  override set value(value: string) {
    super.value = value;
    this.#setTheme();
  }
  initialize(editor: typeof monaco.editor) {
    this.#editor = editor;
    this.#setTheme();
    this.addEventListener('change', this.#setTheme);
  }
  #setTheme() {
    this.#editor?.setTheme(super.value);
  }
}

customElements.define('monaco-editor-theme', SelectEditorTheme, { extends: 'select' });
