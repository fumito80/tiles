import { resetHistory } from './vscroll';
import {
  when,
  switches,
  extractUrl,
} from './common';

import {
  $,
  $$,
  rmClass,
  addAttr,
  addClass,
  $byClass,
  $$byClass,
  $byTag,
  $$byTag,
} from './client';
import { IPubSubElement, makeAction, Store } from './store';

// const $inputQuery = $byClass('query') as HTMLInputElement;

// let lastQueryValue = '';

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

function clearSearch(restoreFolder: boolean) {
  $$('.leafs .search-path').forEach(rmClass('search-path'));
  $$('.leafs .path').forEach(rmClass('path'));
  $$byTag('open-tab').forEach(rmClass('match', 'unmatch'));
  $$byClass('empty').forEach(rmClass('empty'));
  resetHistory();
  if (!restoreFolder) {
    return;
  }
  const openFolder = $('.folders .open');
  if (openFolder) {
    rmClass('open')(openFolder);
    $(':scope > .marker > .title', openFolder)?.click();
  }
}

export class FormSearch extends HTMLFormElement implements IPubSubElement {
  #includeUrl!: boolean;
  #lastQueryValue = '';
  #fnSearch!: () => void;
  private $inputQuery = $byClass<HTMLInputElement>('query', this);
  private $main = $byTag('main');
  init(includeUrl: boolean) {
    this.#includeUrl = includeUrl;
    this.resetQuery(includeUrl);
  }
  clearQuery(restoreFolder: boolean) {
    this.#lastQueryValue = '';
    if (this.$inputQuery.value === '') {
      return;
    }
    this.$inputQuery.value = '';
    addAttr('value', '')(this.$inputQuery);
    rmClass('searching')(this.$main);
    clearSearch(restoreFolder);
    this.$inputQuery.focus();
  }
  resetQuery(includeUrl: boolean) {
    this.$inputQuery.removeEventListener('input', this.#fnSearch);
    const $leafs = $byClass('leafs') as HTMLElement;
    this.#fnSearch = () => this.search(includeUrl, $leafs, this.$main);
    this.$inputQuery.addEventListener('input', this.#fnSearch);
    const lqv = this.#lastQueryValue;
    this.clearQuery(false);
    this.$inputQuery.value = lqv;
    this.#fnSearch();
  }
  search(includeUrl: boolean, $leafs: HTMLElement, $main: HTMLElement) {
    const { value } = this.$inputQuery;
    if (this.#lastQueryValue === '' && value.length <= 1) {
      return;
    }
    addClass('searching')($main);
    rmClass('open')($('.leafs .open'));
    // eslint-disable-next-line no-param-reassign
    $leafs.scrollTop = 0;
    if (value.length <= 1) {
      clearSearch(true);
      rmClass('searching')($main);
      this.$inputQuery.value = value;
      this.#lastQueryValue = '';
      return;
    }
    const reFilter = getReFilter(value)!;
    const selectorTabs = when(this.#lastQueryValue !== '' && value.startsWith(this.#lastQueryValue))
      .then('match' as const)
      .when(this.#lastQueryValue.startsWith(value))
      .then('unmatch' as const)
      .else('tab-wrap' as const);
    const targetBookmarks = switches(selectorTabs)
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
        || (includeUrl && reFilter.test(extractUrl(leaf.style.backgroundImage)))) {
        addClass('search-path')(leaf);
        for (let folder = leaf.parentElement as HTMLElement | null; folder && folder?.classList.contains('folder'); folder = folder.parentElement) {
          addClass('search-path', 'path')(folder);
        }
      }
    });
    const $paneTabs = $byClass('tabs-wrap')!;
    $$byClass(selectorTabs, $paneTabs).forEach((el) => {
      const tab = el.firstElementChild as HTMLElement;
      const isMatch = reFilter.test(tab.textContent!)
        || (includeUrl && reFilter.test(extractUrl(el.style.backgroundImage)));
      el.classList.toggle('match', isMatch);
      el.classList.toggle('unmatch', !isMatch);
    });
    ([...$paneTabs.children] as HTMLElement[])
      .forEach((win) => win.classList.toggle('empty', win.offsetHeight < 10));
    resetHistory({ reFilter, includeUrl });
    this.#lastQueryValue = value;
  }
  provideActions() {
    return {
      changeIncludeUrl: makeAction({ initValue: this.#includeUrl }),
      clearQuery: makeAction({ initValue: true }),
    };
  }
  connect(store: Store) {
    store.subscribe('changeIncludeUrl', (changes) => this.resetQuery(changes.newValue));
    store.subscribe('clearQuery', (changes) => this.clearQuery(changes.newValue));
  }
}
