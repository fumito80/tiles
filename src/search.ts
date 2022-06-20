import {
  when,
  switches,
  extractUrl,
} from './common';

import {
  $, $$, $byClass, $byTag,
  rmClass, addAttr, addClass,
  selectFolder,
} from './client';
import { IPubSubElement, makeAction, Store } from './store';

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

export type SearchParams = {
  value: string, searchSelector: string, includeUrl: boolean,
}

export class FormSearch extends HTMLFormElement implements IPubSubElement {
  #includeUrl!: boolean;
  #exclusiveOpenBmFolderTree!: boolean;
  #store!: Store;
  private $inputQuery = $byClass<HTMLInputElement>('query', this);
  private $main = $byTag('main');
  private $leafs = $byClass('leafs') as HTMLElement;
  init(includeUrl: boolean, exclusiveOpenBmFolderTree: boolean) {
    this.#includeUrl = includeUrl;
    this.#exclusiveOpenBmFolderTree = exclusiveOpenBmFolderTree;
  }
  clearQuery() {
    if (this.$inputQuery.value === '') {
      return;
    }
    this.#store.dispatch('inputSearch', '');
    this.#store.dispatch('search', { value: '', searchSelector: '', includeUrl: this.#includeUrl });
    this.$inputQuery.value = '';
    addAttr('value', '')(this.$inputQuery);
    rmClass('searching')(this.$main);
    this.clearSearch();
    this.$inputQuery.focus();
  }
  resetQuery(includeUrl: boolean) {
    this.#includeUrl = includeUrl;
    this.search({ oldValue: '', newValue: this.$inputQuery.value });
  }
  clearSearch() {
    $$('.leafs .search-path').forEach(rmClass('search-path'));
    $$('.leafs .path').forEach(rmClass('path'));
    this.#store.dispatch('clearSearch', null, true);
    const openFolder = $('.folders .open');
    if (openFolder) {
      rmClass('open')(openFolder);
      const $target = $(':scope > .marker > .title', openFolder)!;
      selectFolder($target, $byClass('leafs'), this.#exclusiveOpenBmFolderTree);
    }
  }
  search({ oldValue, newValue }: { oldValue: string, newValue: string }) {
    if (oldValue.length <= 1 && newValue.length <= 1) {
      return;
    }
    addClass('searching')(this.$main);
    rmClass('open')($('.leafs .open'));
    this.$leafs.scrollTop = 0;
    if (newValue.length <= 1) {
      this.clearSearch();
      rmClass('searching')(this.$main);
      this.$inputQuery.value = newValue;
      return;
    }
    const reFilter = getReFilter(newValue)!;
    const searchSelector = when(oldValue.length > 1 && newValue.startsWith(oldValue))
      .then('match' as const)
      .when(oldValue.startsWith(newValue))
      .then('unmatch' as const)
      .else('tab-wrap' as const);
    const targetBookmarks = switches(searchSelector)
      .case('match')
      .then(() => {
        const target = $$('.leafs .search-path');
        target.forEach(rmClass('search-path'));
        $$('.leafs .path').forEach(rmClass('path'));
        return target;
      })
      .case('unmatch')
      .then(() => $$('.leafs .leaf:not(.search-path)'))
      .else(() => {
        $$('.leafs .search-path').forEach(rmClass('search-path'));
        $$('.leafs .path').forEach(rmClass('path'));
        return $$('.leafs .leaf');
      });
    targetBookmarks.forEach((leaf) => {
      const $anchor = leaf.firstElementChild as HTMLAnchorElement;
      if (reFilter.test($anchor.textContent!)
        || (this.#includeUrl && reFilter.test(extractUrl(leaf.style.backgroundImage)))) {
        addClass('search-path')(leaf);
        for (let folder = leaf.parentElement as HTMLElement | null; folder && folder?.classList.contains('folder'); folder = folder.parentElement) {
          addClass('search-path', 'path')(folder);
        }
      }
    });
    this.#store.dispatch('search', { value: newValue, searchSelector, includeUrl: this.#includeUrl });
  }
  provideActions() {
    return {
      clearQuery: {},
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
    store.subscribe('inputSearch', this.search.bind(this));
    this.#store = store;
  }
}
