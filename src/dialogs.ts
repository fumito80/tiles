import { $byTag } from './client';

const dialogStyle = `
  button {
    float: right;
    margin-top: 10px;
    margin-left: 8px;
  }
`;

export class DialogContent extends HTMLElement {
  private shadow: ShadowRoot;
  private $text: HTMLDivElement;
  private $cancelButton: HTMLButtonElement;
  private okListener!: () => void;
  private cancelListener!: () => void;
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'closed' });
    const style = this.shadow.appendChild(document.createElement('style'));
    style.textContent = dialogStyle;
    this.$text = this.shadow.appendChild(document.createElement('div'));
    this.$cancelButton = this.shadow.appendChild(document.createElement('button'));
    this.$cancelButton.textContent = 'Cancel';
    this.$cancelButton.addEventListener('click', () => this.cancelListener());
    const $okButton = this.shadow.appendChild(document.createElement('button'));
    $okButton.textContent = 'OK';
    $okButton.addEventListener('click', () => this.okListener());
  }
  setConfig(text: string, cancel = false) {
    this.$text.textContent = text;
    this.$cancelButton.style.setProperty('display', cancel ? '' : 'none');
  }
  setOkButton(listener: () => void) {
    this.okListener = listener;
  }
  setCancelButton(listener: () => void) {
    this.cancelListener = listener;
  }
}
export default class ModalDialog extends HTMLDialogElement {
  private dialogContent: DialogContent;
  private resolve!: (value?: unknown) => void;
  constructor() {
    super();
    this.dialogContent = $byTag('dialog-content');
    if (this.dialogContent instanceof DialogContent) {
      this.dialogContent.setOkButton(this.clickOk.bind(this));
      this.dialogContent.setCancelButton(this.clickCancel.bind(this));
    }
  }
  clickOk() {
    this.close();
    this.resolve(true);
  }
  clickCancel() {
    this.close();
    this.resolve(false);
  }
  async setConfig(msg: string, cancel = false) {
    if (this.open) {
      return undefined;
    }
    this.dialogContent.setConfig(msg, cancel);
    this.showModal();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
  async alert(msg: string) {
    return this.setConfig(msg);
  }
  async confirm(msg: string) {
    return this.setConfig(msg, true);
  }
}

export const dialog = $byTag('dialog') as ModalDialog;
