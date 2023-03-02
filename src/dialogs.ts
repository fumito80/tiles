import { $byClass, $byTag } from './client';

const dialogStyle = `
  h4 {
    color: #1a73e8;
    margin-block-start: 0;
    margin-block-end: 0.5em;
  }
  h4:empty {
    margin: 0;
  }
  div {
    color: #222222;
    max-width: calc(100vw * 2 / 3);
  }
  textarea {
    display: block;
    min-width: calc(100vw * 2 / 3);
    min-height: 1rem;
    height: 6rem;
    margin-top: 0.375rem;
    padding: 0.375rem;
    border: 2px solid darkgray;
    border-radius: 0.375rem;
  }
  textarea:focus,
  textarea:active {
    border-color: #1a73e8;
    outline: 0;
  }
  button {
    float: right;
    margin-top: 10px;
    margin-left: 8px;
    position: relative;
    border: 0;
    border-radius: 0.2rem;
    padding: 3px 8px;
  }
  button:hover {
    background-color: #d6d6d6;
  }
  button:active {
    background-color: #bdbdbd;
  }
  button:last-child {
    background-color: #CCE5FF;
  }
  button:last-child:hover {
    background-color: #99cbff;
  }
  button:last-child:active {
    background-color: #66b1ff;
  }
`;

export class DialogContent extends HTMLElement {
  private shadow: ShadowRoot;
  private $title: HTMLDivElement;
  private $text: HTMLDivElement;
  private $input: HTMLTextAreaElement;
  private $cancelButton: HTMLButtonElement;
  private okListener!: () => void;
  private cancelListener!: () => void;
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'closed' });
    const style = this.shadow.appendChild(document.createElement('style'));
    style.textContent = dialogStyle;
    this.$title = this.shadow.appendChild(document.createElement('h4'));
    this.$text = this.shadow.appendChild(document.createElement('div'));
    this.$input = this.shadow.appendChild(document.createElement('textarea'));
    this.$cancelButton = this.shadow.appendChild(document.createElement('button'));
    this.$cancelButton.textContent = 'Cancel';
    this.$cancelButton.addEventListener('click', () => this.cancelListener());
    const $okButton = this.shadow.appendChild(document.createElement('button'));
    $okButton.textContent = 'OK';
    $okButton.addEventListener('click', () => this.okListener());
    this.$input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.okListener();
      }
    });
  }
  setConfig(
    text: string,
    cancel = false,
    title = '',
    inputText = undefined as string | undefined,
    placeholder = '',
  ) {
    this.$text.innerHTML = text;
    this.$title.innerHTML = title;
    this.$cancelButton.style.setProperty('display', cancel ? '' : 'none');
    this.$input.style.setProperty('display', inputText != null ? '' : 'none');
    this.$input.value = inputText ?? '';
    this.$input.setAttribute('placeholder', placeholder ?? '');
  }
  setOkButton(listener: () => void) {
    this.okListener = listener;
  }
  setCancelButton(listener: () => void) {
    this.cancelListener = listener;
  }
  get inputText() {
    return this.$input.value.trim();
  }
}
export default class ModalDialog extends HTMLDialogElement {
  private dialogContent: DialogContent;
  private $inputQuery!: HTMLInputElement;
  private resolve!: (value?: boolean) => void;
  constructor() {
    super();
    this.dialogContent = $byTag('dialog-content');
    if (!(this.dialogContent instanceof DialogContent)) {
      return;
    }
    this.dialogContent.setOkButton(this.clickOk.bind(this));
    this.dialogContent.setCancelButton(this.clickCancel.bind(this));
    this.$inputQuery = $byClass('query')!;
  }
  terminate(result: boolean) {
    this.close();
    this.resolve(result);
    this.$inputQuery.focus();
  }
  clickOk() {
    this.terminate(true);
  }
  clickCancel() {
    this.terminate(false);
  }
  async setConfig(msg: string, cancel = false, title = '', inputText = undefined as string | undefined, placeholder = '') {
    if (this.open) {
      return undefined;
    }
    this.dialogContent.setConfig(msg, cancel, title, inputText, placeholder);
    this.showModal();
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve as (value?: boolean) => void;
    });
  }
  async alert(msg: string) {
    return this.setConfig(msg);
  }
  async confirm(msg: string) {
    return this.setConfig(msg, true);
  }
  async inputText(msg: string, title = '', inputText = '', placeholder = '') {
    return this.setConfig(msg, true, title, inputText, placeholder)
      .then((ret) => (ret ? this.dialogContent.inputText : undefined));
  }
}

export const dialog = $byTag('dialog') as ModalDialog;
