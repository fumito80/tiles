import {
  Changes, Dispatch, IPubSubElement, makeAction, Store, StoreSub,
} from './popup';
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
  clearSearch(_: any, __: any, ___: any, store: StoreSub): void;
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
    this.$inputQuery.value = options.restoreSearching ? lastSearchWord : '';
    this.addEventListener('submit', (e) => this.submitForm(e, options));
    this.$queries = $byClass('queries', this)!;
    this.$inputQuery.addEventListener('click', this.clickQuery.bind(this));
    this.$inputQuery.addEventListener('keydown', this.keydownQuery.bind(this), false);
  }
  inputQuery(_: any, e: Event, __: any, store: StoreSub) {
    const { value } = (e.target as HTMLInputElement);
    this.search(value, store.dispatch);
  }
  reSearchAll(changes: Changes<'search'>, _: any, __: any, store: StoreSub) {
    this.search(changes.newValue || this.$inputQuery.value, store.dispatch);
  }
  async clickQuery() {
    const shown = hasClass(this, 'show-queries');
    if (shown) {
      this.classList.remove('show-queries');
      return undefined;
    }
    return getLocal('queries').then(({ queries = [] }) => {
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
  setQuery(_: any, e: MouseEvent, __: any, store: StoreSub) {
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
    this.search(query!, store.dispatch);
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
  keydownQueries(_: any, e: KeyboardEvent, __: any, store: StoreSub) {
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
      this.setQuery(undefined, { target: $focused } as unknown as MouseEvent, undefined, store);
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
    if (!($next instanceof HTMLElement)) {
      this.$inputQuery.focus();
      this.classList.remove('show-queries');
      return;
    }
    $next.focus();
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
  clearQuery(_: any, __: any, ___: any, store: StoreSub) {
    if (this.$inputQuery.value === '') {
      return;
    }
    this.search('', store.dispatch);
    this.#oldValue = '';
    this.$searchTargets.forEach(
      (target) => target.clearSearch(undefined, undefined, undefined, store),
    );
    this.$inputQuery.value = '';
    addAttr('value', '')(this.$inputQuery);
    store.dispatch('searching', false);
    this.clearSearch(store.dispatch);
    this.$inputQuery.focus();
  }
  resetQuery({ newValue: includeUrl }: { newValue: boolean }, _: any, __: any, store: StoreSub) {
    this.#includeUrl = includeUrl;
    this.#oldValue = '';
    this.search(this.$inputQuery.value, store.dispatch);
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
  reSearch({ newValue: paneName }: { newValue: Panes }, _: any, __: any, store: StoreSub) {
    const reFilter = getReFilter(this.$inputQuery.value)!;
    const searchParams = { reFilter, searchSelector: 'tab-wrap', includeUrl: this.#includeUrl };
    this.$searchTargets
      .filter(($target) => $target.paneName === paneName)
      .forEach((target) => target.search(searchParams, store.dispatch));
  }
  multiSelPanes({ newValue: changes }: Changes<'multiSelPanes'>) {
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
  // eslint-disable-next-line class-methods-use-this
  connect() {}
}
