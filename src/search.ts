import { IPubSubElement, makeAction, Store } from './store';
import { addListener, pipe, when } from './common';
import {
  $, $byClass,
  rmClass, addAttr,
  selectFolder,
  createNewTab,
  toggleClass,
} from './client';
import { Options, SearchHistory } from './types';

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

export type SearchParams = {
  reFilter: RegExp, searchSelector: string, includeUrl: boolean,
}

export interface ISearchable {
  search(params: SearchParams): void;
  clearSearch(): void;
}

export class FormSearch extends HTMLFormElement implements IPubSubElement {
  #oldValue = '';
  #includeUrl!: boolean;
  #exclusiveOpenBmFolderTree!: boolean;
  #searchHistory!: SearchHistory;
  #store!: Store;
  readonly $inputQuery = $byClass<HTMLInputElement>('query', this);
  readonly $iconX = $byClass('icon-x', this);
  readonly $leafs = $byClass('leafs');
  readonly $searchHistory = $byClass('search-history', this);
  private $searchTargets!: ISearchable[];
  init(
    $searchTargets: ISearchable[],
    includeUrl: boolean,
    options: Options,
    searchHistory: SearchHistory,
  ) {
    this.#includeUrl = includeUrl;
    this.#exclusiveOpenBmFolderTree = options.exclusiveOpenBmFolderTree;
    this.$searchTargets = $searchTargets;
    this.#searchHistory = ['AAA', 'BBB', ...searchHistory]; // searchHistory;
    this.#searchHistory.forEach(this.addHistory.bind(this));
    pipe(
      addListener('input', (e) => {
        const { value } = (e.target as HTMLInputElement);
        this.search(value);
      }),
      addListener('click', () => this.toggleHistory()),
      addListener('keydown', (e) => {
        if (e.key !== 'ArrowDown') {
          return;
        }
        this.toggleHistory();
      }),
    )(this.$inputQuery);
    this.addEventListener('submit', (e) => this.submitForm(e, options));
  }
  addHistory(history: string) {
    const $history = this.$searchHistory.appendChild(document.createElement('div'));
    $history.textContent = history;
  }
  toggleHistory(force?: boolean) {
    toggleClass('show-history', force)(this);
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
    this.$inputQuery.focus();
    this.toggleHistory(false);
  }
  clearQuery() {
    if (this.$inputQuery.value === '') {
      return;
    }
    this.search('');
    this.#oldValue = '';
    this.$searchTargets.forEach((target) => target.clearSearch());
    this.$inputQuery.value = '';
    addAttr('value', '')(this.$inputQuery);
    this.#store.dispatch('searching', false);
    this.clearSearch();
    this.$inputQuery.focus();
  }
  resetQuery(includeUrl: boolean) {
    this.#includeUrl = includeUrl;
    this.#oldValue = '';
    this.search(this.$inputQuery.value);
  }
  clearSearch() {
    this.#store.dispatch('clearSearch');
    const openFolder = $('.folders .open');
    if (openFolder) {
      rmClass('open')(openFolder);
      const $target = $(':scope > .marker > .title', openFolder)!;
      selectFolder($target, $byClass('leafs'), this.#exclusiveOpenBmFolderTree);
    }
  }
  search(newValue: string) {
    const oldValue = this.#oldValue;
    if (oldValue.length <= 1 && newValue.length <= 1) {
      this.#oldValue = newValue;
      return;
    }
    this.#store.dispatch('searching', true);
    rmClass('open')($('.leafs .open'));
    this.$leafs.scrollTop = 0;
    if (newValue.length <= 1) {
      this.clearSearch();
      this.#store.dispatch('searching', false);
      this.$inputQuery.value = newValue;
      this.#oldValue = newValue;
      return;
    }
    const searchSelector = when(oldValue.length > 1 && newValue.startsWith(oldValue))
      .then('match' as const)
      .when(oldValue.startsWith(newValue))
      .then('unmatch' as const)
      .else('tab-wrap' as const);
    const reFilter = getReFilter(newValue)!;
    const searchParams = { reFilter, searchSelector, includeUrl: this.#includeUrl };
    this.$searchTargets.forEach((target) => target.search(searchParams));
    this.#oldValue = newValue;
  }
  actions() {
    return {
      clearQuery: makeAction({
        target: this.$iconX,
        eventType: 'click',
        force: true,
      }),
      focusQuery: {},
      clearSearch: {},
      changeIncludeUrl: makeAction({ initValue: this.#includeUrl }),
      searching: {
        initValue: false,
      },
    };
  }
  connect(store: Store) {
    store.subscribe('changeIncludeUrl', (changes) => this.resetQuery(changes.newValue));
    store.subscribe('clearQuery', this.clearQuery.bind(this));
    store.subscribe('focusQuery', this.focusQuery.bind(this));
    this.#store = store;
  }
}
