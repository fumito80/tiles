import './view/settings.scss';
import * as bootstrap from 'bootstrap';
import { State, ColorPalette } from './types';
import { CustomInputElement } from './settings-layout';
import { InputMonacoEditor, SelectEditorTheme } from './monaco-editor';
import { setBrowserIcon } from './draw-svg';
import {
  curry, pipe, tap,
  getSync, setSync, setLocal,
  bootstrap as myBootstrap,
  whichClass,
  objectEqaul,
  addListener,
  camelToSnake,
  setPopupStyle,
  getLocal,
} from './common';
import {
  $, $$, $byTag, $byClass, $byId,
  rmClass, addClass, setText, hasClass,
  insertHTML,
  getChildren,
  getPalettesHtml,
} from './client';

type Options = State['options'];
type OptionNames = keyof Options;
type Inputs = { [key in OptionNames]: Array<HTMLInputElement> };

function findPalette(palette: ColorPalette) {
  $$('.fav-palette, .tab-pane>div')
    .filter(($el) => {
      $el.classList.remove('selected');
      return getChildren($el).every(($child, i) => $child.dataset.color === palette[i]);
    })
    .forEach(($el) => {
      $el.classList.add('selected');
      ($el as any).scrollIntoViewIfNeeded();
    });
}

class ColorPaletteClass extends CustomInputElement {
  #value?: ColorPalette;
  #inputs: HTMLInputElement[];
  constructor() {
    super();
    this.#inputs = [...this.children] as HTMLInputElement[];
    this.#inputs.forEach(addListener('change', () => {
      this.value = this.#inputs.map((input) => input.value.substring(1)) as ColorPalette;
    }));
  }
  get value() {
    return this.#value!;
  }
  set value(value: ColorPalette) {
    this.#value = value;
    value.forEach((color, i) => {
      const input = this.children[i] as HTMLInputElement;
      input.value = `#${color}`;
    });
    this.fireEvent();
    setBrowserIcon(value);
    findPalette(value);
  }
}

customElements.define('color-palette', ColorPaletteClass);

class FavColorPalettes extends CustomInputElement {
  #value = [] as ColorPalette[];
  #colorPalette!: ColorPaletteClass;
  constructor() {
    super();
    this.addEventListener('click', this.clickPalette.bind(this));
    $byClass('remove-fav-palette')?.addEventListener('click', this.removeItem.bind(this));
    this.#colorPalette = $byTag('color-palette');
  }
  get value() {
    return this.#value;
  }
  set value(palettes: ColorPalette[]) {
    this.#value = palettes;
    this.updateView();
  }
  add(palette: ColorPalette) {
    const exists = this.#value.some((p) => p.every((color, i) => color === palette[i]));
    if (exists) {
      return;
    }
    this.#value.push(palette);
    this.updateView();
    this.fireEvent();
    findPalette(palette);
  }
  removeItem() {
    $byClass('selected', this)?.remove();
    const value = getChildren(this).map(
      ($el) => getChildren($el).map(($child) => $child.dataset.color),
    );
    this.#value = value as ColorPalette[];
    this.fireEvent();
  }
  updateView() {
    this.innerHTML = getPalettesHtml(this.#value);
  }
  clickPalette(e: MouseEvent) {
    const $target = e.target as HTMLElement;
    if (!hasClass($target, 'fav-palette')) {
      return;
    }
    const palette = getChildren($target).map(($el) => $el.dataset.color) as ColorPalette;
    findPalette(palette);
    this.#colorPalette.value = palette;
    this.fireEvent();
  }
}

customElements.define('fav-color-palettes', FavColorPalettes);

// @ts-ignore
// eslint-disable-next-line no-restricted-globals
self.MonacoEnvironment = {
  getWorkerUrl: (_: any, label: string) => {
    if (label === 'css') {
      return './css.worker.js';
    }
    return './editor.worker.js';
  },
};

function getInputValue(inputs: Inputs[OptionNames]) {
  const [input, ...rest] = inputs;
  switch (input.type) {
    case 'checkbox':
      return input.disabled ? false : input.checked;
    case 'radio':
      return [input, ...rest].find((el) => el.checked)!.value;
    default:
      return input.validity.valid ? input.value : null;
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

function initInputs({ options }: Pick<State, 'options'>) {
  const $form = $<HTMLFormElement>('form')!;
  return Object.entries(options).reduce((acc, [key, value]) => {
    const inputName = camelToSnake(key);
    const inputElements = $$<HTMLInputElement>(`[name="${inputName}"]`, $form);
    if (inputElements.length === 0) {
      return acc;
    }
    setInputValue(inputElements, value);
    return { ...acc, [key]: inputElements };
  }, {} as Inputs);
}

function getOptions(inputs: Inputs) {
  const options = Object.entries(inputs).reduce((acc, [key, input]) => {
    const value = getInputValue(input);
    return { ...acc, [key]: value };
  }, {} as Options);
  return { options };
}

function saveOptions(inputs: Inputs) {
  return async (e: Event) => {
    const { options: { css, colorPalette } } = await pipe(getOptions, setLocal)(inputs);
    const name = (e.target as Element).getAttribute('name');
    if (['color-palette', 'css'].includes(name!)) {
      setPopupStyle({ css, colorPalette });
    }
  };
}

function setSyncListener(inputs: Inputs) {
  $byClass('chrome-sync')?.addEventListener('click', async (e) => {
    const className = whichClass(['upload-sync', 'download-sync'] as const, e.target as HTMLButtonElement);
    switch (className) {
      case 'upload-sync':
        pipe(getOptions, setSync)(inputs);
        break;
      case 'download-sync': {
        const options = await getSync('options');
        if (Object.keys(options).length === 0) {
          break;
        }
        const currentOptions = getOptions(inputs);
        if (objectEqaul(options, currentOptions, true)) {
          break;
        }
        pipe(tap(initInputs), setLocal)(options);
        const $article = $byTag('article')!;
        pipe(
          addListener('animationend', () => rmClass('blink')($article), { once: true }),
          rmClass('blink'),
          addClass('blink'),
        )($article);
        break;
      }
      default:
    }
  });
  chrome.storage.onChanged.addListener((_, areaName) => {
    if (areaName === 'sync') {
      // eslint-disable-next-line no-alert
      alert('Changes uploaded.');
    }
  });
  return inputs;
}

function setAppInfo() {
  const { version, name } = chrome.runtime.getManifest() as chrome.runtime.Manifest;
  setText(`Version ${version}`)($byClass('version')!);
  setText(name)($byTag('title'));
}

type InitParams = {
  el: HTMLElement;
  inputMonacoEditor: InputMonacoEditor;
  selectEditorTheme: SelectEditorTheme;
}

async function initMonacoEditor({ el, inputMonacoEditor, selectEditorTheme }: InitParams) {
  return import('./monaco-editor').then(({ monaco }) => {
    const editor = monaco.editor.create(el, {
      language: 'css',
      automaticLayout: true,
    });
    inputMonacoEditor.initialize(editor);
    selectEditorTheme.initialize(monaco.editor);
  });
}

async function restoreCss() {
  // eslint-disable-next-line no-restricted-globals
  // eslint-disable-next-line no-alert
  const anser = window.confirm('Reset CSS settings to default.\nAre you sure?');
  if (anser === true) {
    const css = await fetch('./default.css').then((resp) => resp.text());
    $<HTMLInputElement>('input[name="css"]')!.value = css;
  }
}

function initOthers() {
  $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));
  $byId('customize-css')?.addEventListener('shown.bs.collapse', async () => {
    const $editorCollapse = $byId('customize-css')!;
    if (hasClass($editorCollapse, 'loaded')) {
      return;
    }
    await initMonacoEditor({
      el: $byClass('css-editor')!,
      inputMonacoEditor: $('[name="css"]')!,
      selectEditorTheme: $('[name="editor-theme"]')!,
    });
    addClass('loaded')($editorCollapse);
  });
  $byClass('restore-css')?.addEventListener('click', restoreCss);
  const favPalettes = $byTag('fav-color-palettes');
  const colorPalette = $byTag('color-palette');
  if (!(colorPalette instanceof ColorPaletteClass)) {
    return;
  }
  if (!(favPalettes instanceof FavColorPalettes)) {
    return;
  }
  $byClass('add-fav-palette')?.addEventListener('click', () => favPalettes.add(colorPalette.value));
  findPalette(colorPalette.value);
  chrome.runtime.onMessage.addListener((message) => {
    if (message === 'close-popup') {
      getLocal('options').then(({ options }) => {
        const isSame = colorPalette.value.every((color, i) => color === options.colorPalette[i]);
        if (!isSame) {
          colorPalette.value = options.colorPalette;
        }
      });
    }
  });
}

const init = pipe(
  tap<Pick<State, 'options'>>(setAppInfo),
  initInputs,
  setSyncListener,
  saveOptions,
  curry(document.addEventListener)('change'),
  initOthers,
);

myBootstrap('options').then(init);

getLocal('settings', 'options').then(({ settings: { theme }, options }) => {
  insertHTML('beforeend', theme.light)($byId('light-theme'));
  insertHTML('beforeend', theme.dark)($byId('dark-theme'));
  insertHTML('beforeend', theme.other)($byId('mix-theme'));

  const $selected = $$('.tab-pane > div').find((el) => ([...el.children] as HTMLElement[]).every(
    (color, i) => color.dataset.color === options.colorPalette[i],
  ));
  if ($selected) {
    addClass('selected')($selected);
    const tab = new bootstrap.Tab($(`[aria-controls="${$selected.parentElement!.id}"]`)!);
    $byId('color-palettes').addEventListener('shown.bs.collapse', () => {
      ($selected as any).scrollIntoViewIfNeeded();
    }, { once: true });
    tab?.show();
  }

  addListener('click', (e) => {
    const $target = e.target as HTMLElement;
    if (!hasClass($target.parentElement ?? undefined, 'tab-pane')) {
      return;
    }
    const palette = ([...$target.children] as HTMLElement[])
      .map((el) => el.dataset.color as string) as ColorPalette;
    $byTag<ColorPaletteClass>('color-palette')!.value = palette;
    findPalette(palette);
  })($byClass('tab-content')!);
});
