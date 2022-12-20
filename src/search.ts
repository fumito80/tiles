import {
  Dispatch, IPubSubElement, makeAction, Store,
} from './store';
import { getLocal, setLocal, when } from './common';
import {
  $, $byClass,
  rmClass, addAttr,
  selectFolder,
  createNewTab,
  hasClass,
} from './client';
import { Options, Panes } from './types';

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

function checkSingleChar(text: string) {
  // eslint-disable-next-line no-control-regex
  return text.length <= 1 && !/^[^\x01-\x7E\uFF61-\uFF9F]+$/.test(text);
}

export type SearchParams = {
  reFilter: RegExp, searchSelector: string, includeUrl: boolean,
}

export interface ISearchable {
  paneName: Panes;
  search(params: SearchParams, dispatch: Store['dispatch']): void;
  clearSearch(dispatch: Store['dispatch']): void;
}

export class FormSearch extends HTMLFormElement implements IPubSubElement {
  #oldValue = '';
  #includeUrl!: boolean;
  #exclusiveOpenBmFolderTree!: boolean;
  private $inputQuery!: HTMLInputElement;
  private $clear!: HTMLElement;
  private $leafs!: HTMLElement;
  private $searchTargets!: ISearchable[];
  private $queries!: HTMLElement;
  init(
    $searchTargets: ISearchable[],
    includeUrl: boolean,
    options: Options,
    lastSearchWord: string,
  ) {
    this.#includeUrl = includeUrl;
    this.#exclusiveOpenBmFolderTree = options.exclusiveOpenBmFolderTree;
    this.$searchTargets = $searchTargets;
    this.$inputQuery = $byClass<HTMLInputElement>('query', this)!;
    this.$clear = $byClass('clear-search', this)!;
    this.$leafs = $byClass('leafs')!;
    this.$inputQuery.value = lastSearchWord;
    this.addEventListener('submit', (e) => this.submitForm(e, options));
    this.$queries = $byClass('queries', this)!;
    this.$inputQuery.addEventListener('click', this.clickQuery.bind(this));
    this.$inputQuery.addEventListener('keydown', this.keydownQuery.bind(this), false);
  }
  async clickQuery() {
    const shown = hasClass(this, 'show-queries');
    if (shown) {
      this.classList.remove('show-queries');
      return undefined;
    }
    return getLocal('queries').then(({ queries }) => {
      const value = this.$inputQuery.value.trim();
      let targets = queries;
      if (value) {
        const reFilter = getReFilter(value)!;
        targets = queries.filter((el) => reFilter.test(el));
      }
      const html = targets.map((el) => `<div tabindex="0"><span>${el}</span><i class="icon-x"></i></div>`).join('');
      this.$queries.innerHTML = html;
      this.classList.add('show-queries');
    });
  }
  setQuery(e: MouseEvent, dispatch: Dispatch) {
    const $el = e.target as HTMLElement;
    if (hasClass($el, 'icon-x')) {
      const query = $el.parentElement?.textContent!;
      getLocal('queries')
        .then(({ queries }) => {
          const findIndex = queries.findIndex((el) => el === query);
          return [...queries.slice(0, findIndex), ...queries.slice(findIndex + 1)];
        })
        .then((queries) => setLocal({ queries }))
        .then(() => $el.parentElement?.remove());
      return;
    }
    const query = $el.textContent;
    this.search(query!, dispatch);
  }
  async keydownQuery(e: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) {
      return;
    }
    e.preventDefault();
    if (!hasClass(this, 'show-queries')) {
      await this.clickQuery();
    }
    this.$queries.scrollTop = 0;
    const $next = e.key === 'ArrowDown' ? this.$queries.firstElementChild : this.$queries.lastElementChild;
    ($next as HTMLElement)?.focus();
  }
  keydownQueries(e: KeyboardEvent, dispatch: Dispatch) {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      this.clickQuery();
      this.$inputQuery.focus();
      return;
    }
    e.preventDefault();
    const $focused = $('.queries>div:focus', this);
    if ($focused && e.key === 'Enter') {
      this.setQuery({ target: $focused } as unknown as MouseEvent, dispatch);
      this.classList.remove('show-queries');
      this.$inputQuery.focus();
      return;
    }
    if (!$focused) {
      const $next = e.key === 'ArrowDown' ? this.$queries.firstElementChild : this.$queries.lastElementChild;
      ($next as HTMLElement)?.focus();
      return;
    }
    const $next = e.key === 'ArrowDown' ? $focused.nextElementSibling : $focused.previousElementSibling;
    ($next as HTMLElement || this.$inputQuery)?.focus();
  }
  submitForm(e: Event, options: Options) {
    e.preventDefault();
    if (options.enableExternalUrl && options.externalUrl) {
      const value = this.$inputQuery.value.trim();
      if (value.length <= 1) {
        return false;
      }
      const url = options.externalUrl + encodeURIComponent(value);
      createNewTab(options, url);
    }
    return false;
  }
  focusQuery() {
    this.classList.remove('show-queries');
    this.$inputQuery.focus();
  }
  clearQuery(dispatch: Store['dispatch']) {
    if (this.$inputQuery.value === '') {
      return;
    }
    this.search('', dispatch);
    this.#oldValue = '';
    this.$searchTargets.forEach((target) => target.clearSearch(dispatch));
    this.$inputQuery.value = '';
    addAttr('value', '')(this.$inputQuery);
    dispatch('searching', false);
    this.clearSearch(dispatch);
    this.$inputQuery.focus();
  }
  resetQuery(includeUrl: boolean, dispatch: Store['dispatch']) {
    this.#includeUrl = includeUrl;
    this.#oldValue = '';
    this.search(this.$inputQuery.value, dispatch);
  }
  clearSearch(dispatch: Store['dispatch']) {
    dispatch('clearSearch');
    const openFolder = $('.folders .open');
    if (openFolder) {
      rmClass('open')(openFolder);
      const $target = $(':scope > .marker > .title', openFolder)!;
      selectFolder($target, $byClass('leafs')!, this.#exclusiveOpenBmFolderTree);
    }
  }
  search(newValue: string, dispatch: Dispatch) {
    this.classList.remove('show-queries');
    const oldValue = this.#oldValue;
    const isSingleChar = checkSingleChar(newValue);
    if (isSingleChar && (oldValue.length === 0 || checkSingleChar(oldValue))) {
      this.#oldValue = newValue;
      chrome.storage.local.set({ lastSearchWord: '' });
      return;
    }
    if (this.$inputQuery.value !== newValue) {
      this.$inputQuery.setAttribute('value', newValue);
      this.$inputQuery.value = newValue;
    }
    dispatch('searching', true);
    rmClass('open')($('.leafs .open'));
    this.$leafs.scrollTop = 0;
    if (isSingleChar) {
      this.clearSearch(dispatch);
      dispatch('searching', false);
      this.$inputQuery.value = newValue;
      this.#oldValue = newValue;
      chrome.storage.local.set({ lastSearchWord: '' });
      return;
    }
    const searchSelector = when(oldValue.length > 1 && newValue.startsWith(oldValue))
      .then('match' as const)
      .when(oldValue.startsWith(newValue))
      .then('unmatch' as const)
      .else('tab-wrap' as const);
    const reFilter = getReFilter(newValue)!;
    const searchParams = { reFilter, searchSelector, includeUrl: this.#includeUrl };
    this.$searchTargets.forEach((target) => target.search(searchParams, dispatch));
    this.#oldValue = newValue;
    chrome.storage.local.set({ lastSearchWord: newValue });
  }
  reSearch(paneName: Panes, dispatch: Dispatch) {
    const reFilter = getReFilter(this.$inputQuery.value)!;
    const searchParams = { reFilter, searchSelector: 'tab-wrap', includeUrl: this.#includeUrl };
    this.$searchTargets
      .filter(($target) => $target.paneName === paneName)
      .forEach((target) => target.search(searchParams, dispatch));
  }
  multiSelPanes(changes: NonNullable<Store['actions']['multiSelPanes']['initValue']>) {
    if (changes?.all) {
      this.$inputQuery.focus();
    }
    const isMultiSelect = Object.values(changes).some((type) => type);
    this.classList.toggle('hidden', isMultiSelect);
  }
  actions() {
    return {
      inputQuery: makeAction({
        target: this.$inputQuery,
        eventType: 'input',
        eventOnly: true,
      }),
      clearQuery: makeAction({
        target: this.$clear,
        eventType: 'click',
        force: true,
      }),
      focusQuery: {},
      clearSearch: {},
      changeIncludeUrl: makeAction({ initValue: this.#includeUrl }),
      searching: {
        initValue: false,
      },
      search: {
        initValue: '',
      },
      're-search': {
        initValue: '' as Panes,
      },
      setQuery: makeAction({
        target: this.$queries,
        eventType: 'click',
        eventOnly: true,
      }),
      keydownQueries: makeAction({
        target: this.$queries,
        eventType: 'keydown',
        eventOnly: true,
        listenerOptions: false,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('inputQuery', (_, e) => {
      const { value } = (e.target as HTMLInputElement);
      this.search(value, store.dispatch);
    });
    store.subscribe('changeIncludeUrl', (changes) => this.resetQuery(changes.newValue, store.dispatch));
    store.subscribe('clearQuery', () => this.clearQuery(store.dispatch));
    store.subscribe('focusQuery', this.focusQuery.bind(this));
    store.subscribe('multiSelPanes', (changes) => this.multiSelPanes(changes.newValue));
    store.subscribe('search', (changes) => this.search(changes.newValue || this.$inputQuery.value, store.dispatch));
    store.subscribe('re-search', (changes) => this.reSearch(changes.newValue, store.dispatch));
    store.subscribe('setQuery', (_, e) => this.setQuery(e, store.dispatch));
    store.subscribe('keydownQueries', (_, e) => this.keydownQueries(e, store.dispatch));
  }
}
