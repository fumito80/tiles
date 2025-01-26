/* eslint-disable import/prefer-default-export */
import { MulitiSelectablePaneBody } from './multi-sel-pane';
import { Dispatch, IPubSubElement } from './popup';
import { ISearchable, SearchParams } from './search';
import { OpenTab } from './tabs';
import { Options } from './types';

export class RecentTabs extends MulitiSelectablePaneBody implements IPubSubElement, ISearchable {
  readonly paneName = 'recent-tabs';
  #options!: Options;
  #reFilter: RegExp | undefined;
  #includeUrl: Boolean | undefined;
  init(
    // promiseInitHistory: Promise<MyHistoryItem[]>,
    options: Options,
    // isSearching: boolean,
  ) {
    this.#options = options;
  }
  search({ reFilter, includeUrl }: SearchParams, dispatch: Dispatch) {
    this.#reFilter = reFilter;
    this.#includeUrl = includeUrl;
    dispatch('historyCollapseDate', { collapsed: false }, true);
  }
  clearSearch() {
    this.#includeUrl = false;
  }
  // eslint-disable-next-line class-methods-use-this
  deletesHandler($selecteds: HTMLElement[], dispatch: Dispatch) {
    const removeds = $selecteds
      .filter(($el): $el is OpenTab => $el instanceof OpenTab)
      .map(($tab) => [chrome.tabs.remove($tab.tabId), $tab] as [Promise<void>, OpenTab]);
    const [promises, $tabs] = removeds.reduce(
      ([pp, tt], [p, t]) => [[...pp, p], [...tt, t]],
      [[], []] as [Promise<void>[], OpenTab[]],
    );
    Promise.all(promises).then(() => {
      $tabs
        .map(($tab) => {
          const { windowId } = $tab;
          $tab.remove();
          return windowId;
        })
        .filter((id, i, ids) => ids.indexOf(id) === i)
        .forEach((windowId) => dispatch('windowAction', { type: 'closeTab', windowId }, true));
      // this.selectItems(dispatch);
    });
  }
}
