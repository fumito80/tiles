import { resetHistory } from './vscroll';
import {
  $,
  $$,
  when,
  switches,
  extractUrl,
} from './common';

const $inputQuery = $('.query') as HTMLInputElement;

export function getReFilter(value: string) {
  if (!value) {
    return undefined;
  }
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

export function clearSearch() {
  $$('.leafs .search-path').forEach((el) => el.classList.remove('search-path'));
  $$('.leafs .path').forEach((el) => el.classList.remove('path'));
  $$('.pane-tabs > div > div').forEach((el) => el.classList.remove('match', 'unmatch'));
  $$('.empty').forEach((el) => el.classList.remove('empty'));
  resetHistory();
  const openFolder = $('.folders .open');
  if (openFolder) {
    openFolder.classList.remove('open');
    $(':scope > .marker > .title', openFolder)?.click();
  }
}

export function clearQuery() {
  if ($inputQuery.value === '') {
    return;
  }
  $inputQuery.value = '';
  $inputQuery.setAttribute('value', '');
  $inputQuery.focus();
  $inputQuery.removeAttribute('data-searching');
  clearSearch();
}

let lastQueryValue = '';

function search(includeUrl: boolean) {
  const { value } = $inputQuery;
  if (lastQueryValue === '' && value.length <= 1) {
    return;
  }
  $inputQuery.setAttribute('data-searching', '1');
  $('.leafs .open')?.classList.remove('open');
  $('.leafs')!.scrollTop = 0;
  if (value.length <= 1) {
    clearSearch();
    $inputQuery.removeAttribute('data-searching');
    // eslint-disable-next-line no-param-reassign
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
      target.forEach((el) => el.classList.remove('search-path'));
      $$('.leafs .path').forEach((el) => el.classList.remove('path'));
      return target;
    })
    .case('.unmatch')
    .then(() => $$('.leafs .leaf:not(.search-path)'))
    .else(() => {
      $$('.leafs .search-path').forEach((el) => el.classList.remove('search-path'));
      $$('.leafs .path').forEach((el) => el.classList.remove('path'));
      return $$('.leafs .leaf');
    });
  targetBookmarks.forEach((leaf) => {
    const $anchor = leaf.firstElementChild as HTMLAnchorElement;
    if (reFilter.test($anchor.textContent!)
      || (includeUrl && reFilter.test(extractUrl($anchor.style.backgroundImage)))) {
      leaf.classList.add('search-path');
      let folder = leaf.parentElement;
      while (folder?.classList.contains('folder')) {
        folder.classList.add('search-path', 'path');
        folder = folder.parentElement;
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
  clearQuery();
  $inputQuery.value = lastQueryValue;
  lastQueryValue = '';
  search(includeUrl);
}
