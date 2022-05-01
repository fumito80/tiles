import { resetHistory } from './vscroll';
import {
  $,
  $$,
  when,
  switches,
  extractUrl,
  rmClass,
  pipe,
  addAttr,
  rmAttr,
  tap,
  addClass,
} from './common';

const $inputQuery = $('.query') as HTMLInputElement;
const $leafs = $('.leafs') as HTMLElement;

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
  $$('.pane-tabs > div > div').forEach(rmClass('match', 'unmatch'));
  $$('.empty').forEach(rmClass('empty'));
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
  pipe(
    addAttr('value', ''),
    rmAttr('data-searching'),
    tap(clearSearch),
  )($inputQuery).focus();
}

function search(includeUrl: boolean) {
  const { value } = $inputQuery;
  if (lastQueryValue === '' && value.length <= 1) {
    return;
  }
  addAttr('data-searching', '1')($inputQuery);
  rmClass('open')($('.leafs .open'));
  $leafs.scrollTop = 0;
  if (value.length <= 1) {
    clearSearch();
    $inputQuery.removeAttribute('data-searching');
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
      || (includeUrl && reFilter.test(extractUrl($anchor.style.backgroundImage)))) {
      addClass('search-path')(leaf);
      for (let folder = leaf.parentElement as HTMLElement | null; folder && folder?.classList.contains('folder'); folder = folder.parentElement) {
        addClass('search-path', 'path')(folder);
      }
    }
  });
  const $paneTabs = $('.pane-tabs')!;
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

function searchIncludeUrl() {
  search(true);
}

function searchExcludeUrl() {
  search(false);
}

export function resetQuery(includeUrl: boolean) {
  $inputQuery.removeEventListener('input', searchIncludeUrl);
  $inputQuery.removeEventListener('input', searchExcludeUrl);
  $inputQuery.addEventListener('input', includeUrl ? searchIncludeUrl : searchExcludeUrl);
  const lqv = lastQueryValue;
  clearQuery();
  $inputQuery.value = lqv;
  search(includeUrl);
}
