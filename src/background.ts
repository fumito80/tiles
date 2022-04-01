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
  setLocal,
  getLocal,
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
  const { settings: { historyMax: { rows } } } = await getLocal('settings');
  const startTime = Date.now() - pastMSec;
  chrome.history.search({ text: '', startTime, maxResults: 99999 }, (results) => {
    const histories = [...results]
      .sort((a, b) => Math.sign(b.lastVisitTime! - a.lastVisitTime!))
      .map((item) => ({
        ...item,
        lastVisitDate: (new Date(item.lastVisitTime!)).toLocaleDateString(),
      }))
      .reduce<MyHistoryItem[]>((acc, item) => {
        const prevLastVisitDate = acc.at(-1)?.lastVisitDate;
        if (prevLastVisitDate && prevLastVisitDate !== item.lastVisitDate) {
          const headerDate = { headerDate: true, lastVisitDate: item.lastVisitDate };
          return [...acc, headerDate, item];
        }
        return [...acc, item];
      }, []);
    const htmlData = histories.slice(0, rows).map(makeHistoryRow).join('');
    const htmlHistory = `<div class="current-date header-date"></div>${htmlData}`;
    setLocal({ htmlHistory, histories });
  });
}

const historyEvents = [
  chrome.history.onVisited,
  chrome.history.onVisitRemoved,
];

regsterChromeEvents(makeHtmlHistory)(historyEvents);

const settings = initialSettings;
const clientState = {};
setLocal({ settings, clientState, options });

makeHtmlBookmarks();
makeHtmlHistory();

function updateCurrentWindow(currentWindowId?: number) {
  if (!currentWindowId || currentWindowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  setLocal({ currentWindowId });
}

const queryOptions = { windowTypes: ['normal', 'app'] } as chrome.windows.WindowEventFilter;
chrome.windows.onFocusChanged.addListener(updateCurrentWindow, queryOptions);
chrome.windows.getCurrent(queryOptions, (win) => updateCurrentWindow(win.id));
