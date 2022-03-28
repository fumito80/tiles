import './settings.scss';

import { State } from './types';
import {
  $, $$, cbToResolve, curry, getStorage, setStorage, pipe,
} from './utils';

type Options = State['options'];
type OptionNames = keyof State['options'];
type Inputs = { [key in OptionNames]: Array<HTMLInputElement> };

function camelToSnake(value: string) {
  return value.split('').map((s) => {
    const smallChr = s.toLowerCase();
    if (s === smallChr) {
      return s;
    }
    return `-${smallChr}`;
  }).join('');
}

function getInputValue(input: Inputs[OptionNames]) {
  const [control, ...controls] = input;
  if (control.type === 'checkbox') {
    return (control as HTMLInputElement).checked;
  }
  if (control.type === 'radio') {
    return [control, ...controls].find((el) => el.checked)!.value;
  }
  return control.value;
}

function setInputValue(input: Inputs[OptionNames], value: any) {
  const [control, ...controls] = input;
  if (control.type === 'checkbox') {
    (control as HTMLInputElement).checked = !!value;
    return;
  }
  if (control.type === 'radio') {
    [control, ...controls].find((el) => el.value === value)!.checked = true;
    return;
  }
  control.value = value;
}

function initInputs(options: Options) {
  const $form = $<HTMLFormElement>('form')!;
  return Object.entries(options).reduce((acc, [key, value]) => {
    const inputName = camelToSnake(key);
    const inputElements = $$<HTMLInputElement>(`[name="${inputName}"]`, $form);
    setInputValue(inputElements, value);
    return { ...acc, [key]: inputElements };
  }, {} as Inputs);
}

function saveOptions(inputs: Inputs) {
  return () => {
    const options = Object.entries(inputs).reduce((acc, [key, input]) => {
      const value = getInputValue(input);
      return { ...acc, [key]: value };
    }, {} as State['options']);
    setStorage({ options });
  };
}

async function init() {
  const { options } = await getStorage('options');
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  pipe(
    initInputs,
    saveOptions,
    curry(document.addEventListener)('change'),
  )(options);
}

init();
