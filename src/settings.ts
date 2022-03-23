import './settings.scss';

import { State } from './types';
import {
  $, $$, cbToResolve, curry, getStorage, setStorage, objectEqaul,
} from './utils';

function getFormValue(name: string, form: HTMLFormElement) {
  const snakeCase = name.split('')
    .map((s) => (s === s.toUpperCase() ? `-${s.toLowerCase()}` : s)).join('');
  const [control, ...controls] = $$(`[name="${snakeCase}"]`, form);
  if (control.type === 'checkbox') {
    return (control as HTMLInputElement).checked;
  }
  if (control.type === 'radio') {
    return [control, ...controls].find((el) => el.checked).value;
  }
  return control.value;
}

function setFormValue(name: string, value: any, form: HTMLFormElement) {
  const snakeCase = name.split('')
    .map((s) => (s === s.toUpperCase() ? `-${s.toLowerCase()}` : s)).join('');
  const [control, ...controls] = $$(`[name="${snakeCase}"]`, form);
  if (control.type === 'checkbox') {
    (control as HTMLInputElement).checked = !!value;
    return;
  }
  if (control.type === 'radio') {
    [control, ...controls].find((el) => el.value === value).checked = true;
    return;
  }
  control.value = value;
}

function initOptions(options: State['options'], $form: HTMLFormElement) {
  Object.entries(options).forEach(([k, v]) => setFormValue(k, v, $form));
}

function saveOptions(optionsIn: State['options'], $form: HTMLFormElement) {
  return () => {
    const options = Object.keys(optionsIn)
      .reduce((acc, key) => ({ ...acc, [key]: getFormValue(key, $form) }), {}) as typeof optionsIn;
    if (objectEqaul(optionsIn, options)) {
      return;
    }
    setStorage({ options });
  };
}

async function init({ options }: Pick<State, 'options'>) {
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  const $form = $<HTMLFormElement>('form')!;
  initOptions(options, $form);
  const save = saveOptions(options, $form);
  $form.addEventListener('click', save);
  $form.addEventListener('change', save);
}

getStorage('options').then(init);
