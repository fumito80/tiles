import { resetHistory } from './vscroll';
import {
  $,
  $$,
  when,
  switches,
  extractUrl,
  rmClass,
  addAttr,
  rmAttr,
  addClass,
  $byClass,
  $$byClass,
} from './common';

const $inputQuery = $byClass('query') as HTMLInputElement;

let lastQueryValue = '';

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

export function clearSearch() {
  $$('.leafs .search-path').forEach(rmClass('search-path'));
  $$('.leafs .path').forEach(rmClass('path'));
  $$('.tabs-wrap > div > div').forEach(rmClass('match', 'unmatch'));
  $$byClass('empty').forEach(rmClass('empty'));
  resetHistory();
  const openFolder = $('.folders .open');
  if (openFolder) {
    rmClass('open')(openFolder);
    $(':scope > .marker > .title', openFolder)?.click();
  }
}

export function clearQuery() {
  lastQueryValue = '';
  if ($inputQuery.value === '') {
    return;
  }
  $inputQuery.value = '';
  addAttr('value', '')($inputQuery);
  rmAttr('data-searching')($inputQuery.parentElement);
  clearSearch();
  $inputQuery.focus();
}

function search(includeUrl: boolean, $leafs: HTMLElement) {
  const { value } = $inputQuery;
  if (lastQueryValue === '' && value.length <= 1) {
    return;
  }
  addAttr('data-searching', '1')($inputQuery.parentElement!);
  rmClass('open')($('.leafs .open'));
  // eslint-disable-next-line no-param-reassign
  $leafs.scrollTop = 0;
  if (value.length <= 1) {
    clearSearch();
    $inputQuery.parentElement!.removeAttribute('data-searching');
    $inputQuery.value = value;
    lastQueryValue = '';
    return;
  }
  const reFilter = getReFilter(value)!;
  const selectorTabs = when(lastQueryValue !== '' && value.startsWith(lastQueryValue))
    .then('.match' as const)
    .when(lastQueryValue.startsWith(value))
    .then('.unmatch' as const)
    .else('.tab-wrap' as const);
  const targetBookmarks = switches(selectorTabs)
    .case('.match')
    .then(() => {
      const target = $$('.leafs .search-path');
      target.forEach(rmClass('search-path'));
      $$('.leafs .path').forEach(rmClass('path'));
      return target;
    })
    .case('.unmatch')
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
  $$(`:scope > div > ${selectorTabs}`, $paneTabs).forEach((el) => {
    const tab = el.firstElementChild as HTMLElement;
    const isMatch = reFilter.test(tab.textContent!)
      || (includeUrl && reFilter.test(el.title));
    el.classList.toggle('match', isMatch);
    el.classList.toggle('unmatch', !isMatch);
  });
  ([...$paneTabs.children] as HTMLElement[])
    .forEach((win) => win.classList.toggle('empty', win.offsetHeight < 10));
  resetHistory({ reFilter, includeUrl });
  lastQueryValue = value;
}

let fnSearch: () => void;

export function resetQuery(includeUrl: boolean) {
  $inputQuery.removeEventListener('input', fnSearch);
  const $leafs = $byClass('leafs') as HTMLElement;
  fnSearch = () => search(includeUrl, $leafs);
  $inputQuery.addEventListener('input', fnSearch);
  const lqv = lastQueryValue;
  clearQuery();
  $inputQuery.value = lqv;
  fnSearch();
}
