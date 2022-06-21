import { IPubSubElement, makeAction, Store } from './store';
import { when } from './common';
import {
  $, $byClass, $byTag,
  rmClass, addAttr, addClass,
  selectFolder,
  createNewTab,
} from './client';
import { Leafs } from './bookmarks';
import { Tabs } from './tabs';
import { History } from './history';
import { Options } from './types';

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

export type SearchParams = {
  value?: string, reFilter: RegExp, searchSelector: string, includeUrl: boolean,
}

export class FormSearch extends HTMLFormElement implements IPubSubElement {
  #oldValue = '';
  #includeUrl!: boolean;
  #exclusiveOpenBmFolderTree!: boolean;
  #store!: Store;
  readonly $inputQuery = $byClass<HTMLInputElement>('query', this);
  readonly $iconX = $byClass('icon-x', this);
  readonly $main = $byTag('main');
  private $leafs!: Leafs;
  private $tabs!: Tabs;
  private $history!: History;
  init(
    $leafs: Leafs,
    $tabs: Tabs,
    $history: History,
    includeUrl: boolean,
    options: Options,
  ) {
    this.#includeUrl = includeUrl;
    this.#exclusiveOpenBmFolderTree = options.exclusiveOpenBmFolderTree;
    this.$leafs = $leafs;
    this.$tabs = $tabs;
    this.$history = $history;
    this.$inputQuery.addEventListener('input', (e) => {
      const { value } = (e.target as HTMLInputElement);
      this.search(value);
    });
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
  clearQuery() {
    if (this.$inputQuery.value === '') {
      return;
    }
    this.search('');
    this.#oldValue = '';
    this.#store.dispatch('search', { value: '', searchSelector: '', includeUrl: this.#includeUrl });
    this.$inputQuery.value = '';
    addAttr('value', '')(this.$inputQuery);
    rmClass('searching')(this.$main);
    this.clearSearch();
    this.$inputQuery.focus();
  }
  resetQuery(includeUrl: boolean) {
    this.#includeUrl = includeUrl;
    this.#oldValue = '';
    this.search(this.$inputQuery.value);
  }
  clearSearch() {
    this.#store.dispatch('clearSearch', null, true);
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
    addClass('searching')(this.$main);
    rmClass('open')($('.leafs .open'));
    this.$leafs.scrollTop = 0;
    if (newValue.length <= 1) {
      this.clearSearch();
      rmClass('searching')(this.$main);
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
    this.$leafs.search(searchParams);
    this.$tabs.search(searchParams);
    this.$history.search(searchParams);
    this.#oldValue = newValue;
  }
  provideActions() {
    return {
      clearQuery: makeAction({
        target: this.$iconX,
        eventType: 'click',
        force: true,
      }),
      clearSearch: {},
      changeIncludeUrl: makeAction({ initValue: this.#includeUrl }),
      search: makeAction({
        initValue: {
          value: '',
          searchSelector: '',
          includeUrl: this.#includeUrl,
        },
      }),
      inputSearch: makeAction({
        initValue: '',
        target: this.$inputQuery,
        eventType: 'input',
        eventProcesser: (e) => (e.target as HTMLInputElement).value,
      }),
    };
  }
  connect(store: Store) {
    store.subscribe('changeIncludeUrl', (changes) => this.resetQuery(changes.newValue));
    store.subscribe('clearQuery', this.clearQuery.bind(this));
    this.#store = store;
  }
}
