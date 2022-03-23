import {
  pastMSec,
  initialSettings,
  options,
  // IClientState,
  HtmlBookmarks,
  // ISettings,
  // IState,
  MyHistoryItem,
  // CliMessageTypes,
  // OpenBookmarkType,
  // EditBookmarkTypes,
  // dropClasses,
  CliMessageTypes,
  // Collection,
  // PayloadAction,
} from './types';
// import { cbToResolve } from './utils';
import { makeLeaf, makeNode } from './html';
import {
  pipe,
  prop,
  propEq,
  propNe,
  regsterChromeEvents,
  makeHistoryRow,
  setStorage,
  getStorage,
} from './utils';

export const mapStateToResponse = {
  [CliMessageTypes.saveOptions]: () => true,
  // ({ dispatch }: ReduxHandlers, { payload }: PayloadAction<bx.IOptions>) => {
  //   dispatch(sliceOptions.actions.update(payload));
  // },
};

export type MapStateToResponse = typeof mapStateToResponse;

function digBookmarks(isNode = true) {
  return (node: chrome.bookmarks.BookmarkTreeNode): string => {
    if (node.url) {
      return isNode ? '' : makeLeaf(node);
    }
    const children = node.children?.map(digBookmarks(isNode)).join('') ?? '';
    const { length } = node.children?.filter(propEq('url', undefined)) ?? [];
    return makeNode({ ...node, children, length });
  };
}

const concat = (a: string[] = []) => (b: string = '') => b.concat(a.join(''));

function makeHtmlBookmarks() {
  chrome.bookmarks.getTree(([{ children }]) => {
    const leafs = children?.map(digBookmarks(false)).join('') || '';
    const rootTree = children?.find(propEq('id', '1'))?.children;
    const folders = pipe(
      concat(rootTree?.filter(prop('url')).map(makeLeaf)),
      concat(rootTree?.map(digBookmarks())),
      concat(children?.filter(propNe('id', '1')).map(digBookmarks())),
    )();
    const htmlBookmarks: HtmlBookmarks = { leafs, folders };
    chrome.storage.local.set({ htmlBookmarks });
  });
}

const bookmarksEvents = [
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onImportEnded,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onRemoved,
];

regsterChromeEvents(makeHtmlBookmarks)(bookmarksEvents);

async function makeHtmlHistory() {
  const { settings: { historyMax: { rows } } } = await getStorage('settings');
  const startTime = Date.now() - pastMSec;
  chrome.history.search({ text: '', startTime, maxResults: 99999 }, (results) => {
    const histories = results
      .concat()
      .sort((a, b) => Math.sign(b.lastVisitTime! - a.lastVisitTime!))
      .map((item) => ({
        ...item,
        lastVisitDate: (new Date(item.lastVisitTime!)).toLocaleDateString(),
      }))
      .reduce<MyHistoryItem[]>((acc, item) => {
        const prevLastVisitDate = acc.at(-1)?.lastVisitDate;
        const headerDate = { headerDate: true, lastVisitDate: item.lastVisitDate };
        if (prevLastVisitDate && prevLastVisitDate !== item.lastVisitDate) {
          return [...acc, headerDate, item];
        }
        return [...acc, item];
      }, []);
    const htmlData = histories.slice(0, rows).map(makeHistoryRow).join('');
    const htmlHistory = `<div class="current-date header-date"></div>${htmlData}`;
    setStorage({ htmlHistory, histories });
  });
}

const historyEvents = [
  chrome.history.onVisited,
  chrome.history.onVisitRemoved,
];

regsterChromeEvents(makeHtmlHistory)(historyEvents);

const settings = initialSettings;
const clientState = {};
setStorage({ settings, clientState, options });

makeHtmlBookmarks();
makeHtmlHistory();
