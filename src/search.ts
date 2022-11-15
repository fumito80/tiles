import { IPubSubElement, makeAction, Store } from './store';
import { when } from './common';
import {
  $, $byClass,
  rmClass, addAttr,
  selectFolder,
  createNewTab,
} from './client';
import { Options } from './types';

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
  search(params: SearchParams, dispatch: Store['dispatch']): void;
  clearSearch(dispatch: Store['dispatch']): void;
}

export class FormSearch extends HTMLFormElement implements IPubSubElement {
  #oldValue = '';
  #includeUrl!: boolean;
  #exclusiveOpenBmFolderTree!: boolean;
  private $inputQuery!: HTMLInputElement;
  private $iconX!: HTMLElement;
  private $leafs!: HTMLElement;
  private $searchTargets!: ISearchable[];
  init(
    $searchTargets: ISearchable[],
    includeUrl: boolean,
    options: Options,
    lastSearchWord: string,
  ) {
    this.#includeUrl = includeUrl;
    this.#exclusiveOpenBmFolderTree = options.exclusiveOpenBmFolderTree;
    this.$searchTargets = $searchTargets;
    this.$inputQuery = $byClass<HTMLInputElement>('query', this);
    this.$iconX = $byClass('icon-x', this);
    this.$leafs = $byClass('leafs');
    this.$inputQuery.value = lastSearchWord;
    this.addEventListener('submit', (e) => this.submitForm(e, options));
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
      selectFolder($target, $byClass('leafs'), this.#exclusiveOpenBmFolderTree);
    }
  }
  search(newValue: string, dispatch: Store['dispatch']) {
    const oldValue = this.#oldValue;
    if (oldValue.length <= 1 && newValue.length <= 1) {
      this.#oldValue = newValue;
      chrome.storage.local.set({ lastSearchWord: newValue });
      return;
    }
    if (this.$inputQuery.value !== newValue) {
      this.$inputQuery.setAttribute('value', newValue);
      this.$inputQuery.value = newValue;
    }
    dispatch('searching', true);
    rmClass('open')($('.leafs .open'));
    this.$leafs.scrollTop = 0;
    if (newValue.length <= 1) {
      this.clearSearch(dispatch);
      dispatch('searching', false);
      this.$inputQuery.value = newValue;
      this.#oldValue = newValue;
      chrome.storage.local.set({ lastSearchWord: newValue });
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
  actions() {
    return {
      inputQuery: makeAction({
        target: this.$inputQuery,
        eventType: 'input',
        eventOnly: true,
      }),
      clearQuery: makeAction({
        target: this.$iconX,
        eventType: 'click',
        eventOnly: true,
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
    };
  }
  connect(store: Store) {
    store.subscribe('inputQuery', (_, __, dispatch, e) => {
      const { value } = (e.target as HTMLInputElement);
      this.search(value, dispatch);
    });
    store.subscribe('changeIncludeUrl', (changes, _, dispatch) => this.resetQuery(changes.newValue, dispatch));
    store.subscribe('clearQuery', (_, __, dispatch) => this.clearQuery(dispatch));
    store.subscribe('focusQuery', this.focusQuery.bind(this));
    store.subscribe('search', (changes, _, dispatch) => this.search(changes.newValue || this.$inputQuery.value, dispatch));
  }
}
