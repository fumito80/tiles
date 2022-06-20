/* eslint-disable import/prefer-default-export */

import {
  $$, $$byClass, addClass, rmClass,
} from './client';
import { extractUrl, switches } from './common';
import { SearchParams } from './search';
import { ISubscribeElement, Store } from './store';

export class Leafs extends HTMLDivElement implements ISubscribeElement {
  search({ reFilter, searchSelector, includeUrl }: SearchParams) {
    const targetBookmarks = switches(searchSelector)
      .case('match')
      .then(() => {
        const target = $$byClass('search-path', this);
        target.forEach(rmClass('search-path'));
        $$byClass('path', this).forEach(rmClass('path'));
        return target;
      })
      .case('unmatch')
      .then(() => $$('.leaf:not(.search-path)', this))
      .else(() => {
        $$byClass('search-path', this).forEach(rmClass('search-path'));
        $$byClass('path', this).forEach(rmClass('path'));
        return $$byClass('leaf', this);
      });
    targetBookmarks.reduce((acc, $leaf) => {
      const $anchor = $leaf.firstElementChild as HTMLAnchorElement;
      if (reFilter.test($anchor.textContent!)
        || (includeUrl && reFilter.test(extractUrl($leaf.style.backgroundImage)))) {
        addClass('search-path')($leaf);
        if (acc === $leaf.parentElement) {
          return acc;
        }
        for (let $folder = $leaf.parentElement as HTMLElement | null; $folder && $folder.classList.contains('folder'); $folder = $folder.parentElement) {
          addClass('search-path', 'path')($folder);
        }
        return $leaf.parentElement;
      }
      return acc;
    }, null as HTMLElement | null);
  }
  clearSearch() {
    $$byClass('search-path', this).forEach(rmClass('search-path'));
    $$byClass('path', this).forEach(rmClass('path'));
  }
  connect(store: Store) {
    store.subscribe('clearSearch', this.clearSearch.bind(this));
  }
}
