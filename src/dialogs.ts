import { $byTag } from './client';

const dialogStyle = `
  :host {
    display: grid;
    gap: 1em;
  }
  button {
    margin-left: auto;
  }
`;

class DialogContent extends HTMLElement {
  private shadow: ShadowRoot;
  private $text: HTMLDivElement;
  private okListener!: () => void;
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'closed' });
    const style = this.shadow.appendChild(document.createElement('style'));
    style.textContent = dialogStyle;
    this.$text = this.shadow.appendChild(document.createElement('div'));
    const $okButton = this.shadow.appendChild(document.createElement('button'));
    $okButton.textContent = 'OK';
    $okButton.addEventListener('click', () => this.okListener());
  }
  setText(text: string) {
    this.$text.textContent = text;
  }
  setOkButton(listener: () => void) {
    this.okListener = listener;
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
    }
  }
  clickOk() {
    this.close();
    this.resolve();
  }
  async alert(msg: string) {
    this.dialogContent.setText(msg);
    this.showModal();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}

customElements.define('dialog-content', DialogContent);
customElements.define('modal-dialog', ModalDialog, { extends: 'dialog' });
export const dialog = $byTag('dialog') as ModalDialog;
