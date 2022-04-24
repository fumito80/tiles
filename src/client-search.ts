import { Options } from './types';
import { resetHistory } from './vscroll';
import { createNewTab } from './client';
import {
  $,
  $$,
  when,
  switches,
  extractUrl,
} from './common';

const $inputQuery = $('.query')! as HTMLInputElement;
let lastQueryValue = '';

export function getReFilter(value: string) {
  return new RegExp(value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'i');
}

export default function search(options: Options) {
  return (e?: Event) => {
    const value = $inputQuery.value.trim();
    if (lastQueryValue === '' && value.length <= 1) {
      return false;
    }
    $inputQuery.setAttribute('data-searching', '1');
    $('.leafs .open')?.classList.remove('open');
    $('.leafs')!.scrollTop = 0;
    if (value.length <= 1) {
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
      lastQueryValue = '';
      $inputQuery.removeAttribute('data-searching');
      $inputQuery.value = value;
      return false;
    }
    if (e?.type === 'submit' && options.enableExternalUrl && options.externalUrl) {
      const url = options.externalUrl + encodeURIComponent(value);
      createNewTab(options, url);
      return false;
    }
    const reFilter = getReFilter(value);
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
        || (options.includeUrl && reFilter.test(extractUrl($anchor.style.backgroundImage)))) {
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
        || (options.includeUrl && reFilter.test(tab.title));
      el.classList.toggle('match', isMatch);
      el.classList.toggle('unmatch', !isMatch);
    });
    ([...$paneTabs.children] as HTMLElement[])
      .forEach((win) => win.classList.toggle('empty', win.offsetHeight < 10));
    resetHistory({ reFilter, includeUrl: options.includeUrl });
    lastQueryValue = value;
    return false;
  };
}
