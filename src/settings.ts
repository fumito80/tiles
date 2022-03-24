import './settings.scss';

import { State } from './types';
import {
  $, $$, cbToResolve, curry, getStorage, setStorage, objectEqaul,
} from './utils';

function camelToSnake(value: string) {
  return value.split('').map((s) => {
    const smallChr = s.toLowerCase();
    if (s === smallChr) {
      return s;
    }
    return `-${smallChr}`;
  }).join('');
}

function getInputValue(name: string, form: HTMLFormElement) {
  const snakeCase = camelToSnake(name);
  const [control, ...controls] = $$(`[name="${snakeCase}"]`, form);
  if (control.type === 'checkbox') {
    return (control as HTMLInputElement).checked;
  }
  if (control.type === 'radio') {
    return [control, ...controls].find((el) => el.checked).value;
  }
  return control.value;
}

function setInputValue(name: string, value: any, form: HTMLFormElement) {
  const snakeCase = camelToSnake(name);
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
  Object.entries(options).forEach(([k, v]) => setInputValue(k, v, $form));
}

function saveOptions(optionsIn: State['options'], $form: HTMLFormElement) {
  let preOptions = optionsIn;
  return () => {
    const options = Object.keys(optionsIn)
      .reduce((acc, key) => ({ ...acc, [key]: getInputValue(key, $form) }), {}) as typeof optionsIn;
    if (objectEqaul(preOptions, options)) {
      return;
    }
    setStorage({ options });
    preOptions = options;
  };
}

async function init({ options }: Pick<State, 'options'>) {
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  const $form = $<HTMLFormElement>('form')!;
  initOptions(options, $form);
  $form.addEventListener('change', saveOptions(options, $form));
}

getStorage('options').then(init);
