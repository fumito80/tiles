import {
  State,
  pastMSec,
  initialSettings,
  initialOptions,
  HtmlBookmarks,
  MyHistoryItem,
  // CliMessageTypes,
  // OpenBookmarkType,
  // EditBookmarkTypes,
  // dropClasses,
  CliMessageTypes,
  // PayloadAction,
} from './types';
// import { cbToResolve } from './utils';
import { makeLeaf, makeNode, makeHistory } from './html';
import {
  pipe,
  propEq,
  propNe,
  regsterChromeEvents,
  setLocal,
  getLocal,
  setBrowserIcon,
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
      return (isNode && node.parentId !== '1') ? '' : makeLeaf(node);
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

function makeHtmlHistory(rows: number) {
  const aDay = 1000 * 60 * 60 * 24;
  return () => {
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
            const headerDate = {
              headerDate: true,
              lastVisitDate: item.lastVisitDate,
              lastVisitTime: item.lastVisitTime! - (item.lastVisitTime! % aDay),
            };
            return [...acc, headerDate, item];
          }
          return [...acc, item];
        }, []);
      const htmlData = histories.slice(0, rows).map(makeHistory).join('');
      const htmlHistory = `<div class="current-date header-date"></div>${htmlData}`;
      setLocal({ htmlHistory, histories });
    });
  };
}

const historyEvents = [
  chrome.history.onVisited,
  chrome.history.onVisitRemoved,
];

function updateCurrentWindow(currentWindowId?: number) {
  if (!currentWindowId || currentWindowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  setLocal({ currentWindowId });
}

function regsterWindowEvent() {
  const queryOptions = { windowTypes: ['normal', 'app'] } as chrome.windows.WindowEventFilter;
  chrome.windows.onFocusChanged.addListener(updateCurrentWindow, queryOptions);
  chrome.windows.getCurrent(queryOptions, (win) => updateCurrentWindow(win.id));
}

type InitStateKeys = keyof Pick<State, 'settings' | 'clientState' | 'options'>;
const initStateKeys: Array<InitStateKeys> = ['settings', 'clientState', 'options'];

function init(storage: Pick<State, InitStateKeys>) {
  const settings = { ...initialSettings, ...storage.settings };
  const clientState = storage.clientState || {};
  const options = { ...initialOptions, ...storage.options };
  setBrowserIcon(options.colorPalette);
  makeHtmlBookmarks();
  makeHtmlHistory(settings.historyMax.rows)();
  setLocal({ settings, clientState, options });
  regsterChromeEvents(makeHtmlHistory(settings.historyMax.rows))(historyEvents);
  regsterWindowEvent();
}

getLocal(...initStateKeys).then(init);
