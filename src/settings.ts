import './settings.scss';

import { State } from './types';
import {
  $, $$, cbToResolve, curry, getStorage, setStorage, pipe,
} from './utils';

type Options = State['options'];
type OptionNames = keyof Options;
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

function getInputValue(inputs: Inputs[OptionNames]) {
  const [input, ...rest] = inputs;
  switch (input.type) {
    case 'checkbox':
      return (input as HTMLInputElement).checked;
    case 'radio':
      return [input, ...rest].find((el) => el.checked)!.value;
    default:
      return input.value;
  }
}

function setInputValue(inputs: Inputs[OptionNames], value: any) {
  const [input, ...rest] = inputs;
  switch (input.type) {
    case 'checkbox':
      (input as HTMLInputElement).checked = !!value;
      break;
    case 'radio':
      [input, ...rest].find((el) => el.value === value)!.checked = true;
      break;
    default:
      input.value = value;
  }
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
    }, {} as Options);
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
