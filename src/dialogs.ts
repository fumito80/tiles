import { $byClass, $byTag, createElement } from './client';

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
  input,
  textarea {
    display: block;
    min-width: calc(100vw * 2 / 3);
    margin-top: 0.3rem;
    padding: 0.375rem;
    border: 2px solid darkgray;
    border-radius: 0.375rem;
  }
  input {
    margin-bottom: 0.3rem;
  }
  textarea {
    min-height: 1rem;
    height: 6rem;
  }
  input:focus,
  input:active,
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
    padding: 0.375rem 1.0rem;
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
  private $name: HTMLInputElement;
  private $captionUrl: HTMLDivElement;
  private $url: HTMLTextAreaElement;
  private $cancelButton: HTMLButtonElement;
  private okListener!: () => void;
  private cancelListener!: () => void;
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'closed' });
    const style = this.shadow.appendChild(createElement('style'));
    style.textContent = dialogStyle;
    this.$title = this.shadow.appendChild(createElement('h4'));
    this.$text = this.shadow.appendChild(createElement('div'));
    this.$name = this.shadow.appendChild(createElement('input'));
    this.$name.type = 'text';
    this.$captionUrl = this.shadow.appendChild(createElement('div'));
    this.$url = this.shadow.appendChild(createElement('textarea'));
    this.$cancelButton = this.shadow.appendChild(createElement('button'));
    this.$cancelButton.textContent = 'Cancel';
    this.$cancelButton.addEventListener('click', () => this.cancelListener());
    const $okButton = this.shadow.appendChild(createElement('button'));
    $okButton.textContent = 'OK';
    $okButton.addEventListener('click', () => this.okListener());
    this.$url.addEventListener('keydown', this.ok.bind(this));
    this.$name.addEventListener('keydown', this.ok.bind(this));
  }
  setConfig(
    text: string,
    cancel = false,
    captionTitle = '',
    title = '',
    captionUrl = '',
    url = '',
  ) {
    this.$text.innerHTML = text;
    this.$title.innerHTML = captionTitle;
    this.$cancelButton.style.setProperty('display', cancel ? '' : 'none');
    this.$name.style.setProperty('display', captionTitle ? '' : 'none');
    this.$name.value = title;
    this.$name.setAttribute('placeholder', title);
    this.$captionUrl.style.setProperty('display', captionUrl ? '' : 'none');
    this.$captionUrl.innerHTML = captionUrl;
    this.$url.style.setProperty('display', captionUrl ? '' : 'none');
    this.$url.value = url;
    this.$url.setAttribute('placeholder', url);
  }
  ok(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.okListener();
    }
  }
  setOkButton(listener: () => void) {
    this.okListener = listener;
  }
  setCancelButton(listener: () => void) {
    this.cancelListener = listener;
  }
  get input() {
    return {
      name: this.$name.value.trim(),
      url: this.$url.value.trim(),
    };
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
  async setConfig(msg: string, cancel = false, captionTitle = '', title = '', captionUrl = '', url = '') {
    if (this.open) {
      return undefined;
    }
    this.dialogContent.setConfig(msg, cancel, captionTitle, title, captionUrl, url);
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
  async editBookmark(title: string, name: string, url: string) {
    return this.setConfig('Name', true, title, name, 'URL', url)
      .then((ret) => (ret ? this.dialogContent.input : undefined));
  }
}

export const dialog = $byTag('dialog') as ModalDialog;
