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
  CliMessageTypes,
  // PayloadAction,
} from './types';
import { makeLeaf, makeNode, makeHistory as makeHtmlHistory } from './html';
import {
  pipe,
  propEq,
  propNe,
  regsterChromeEvents,
  setLocal,
  getLocal,
  setBrowserIcon,
  removeUrlHistory,
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

const aDay = 1000 * 60 * 60 * 24;

function makeHistory(rows: number) {
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
      const htmlHistory = histories.slice(0, rows).map(makeHtmlHistory).join('');
      setLocal({ htmlHistory, histories });
    });
  };
}

function removeHistory(rows: number) {
  return async ({ allHistory, urls }: chrome.history.RemovedResult) => {
    if (allHistory) {
      makeHistory(0)();
      return;
    }
    const [url] = urls!;
    const histories = await getLocal('histories').then(removeUrlHistory(url));
    const htmlHistory = histories.slice(0, rows).map(makeHtmlHistory).join('');
    setLocal({ htmlHistory, histories });
  };
}

function addHistory(rows: number) {
  return async (result: chrome.history.HistoryItem) => {
    const histories = await getLocal('histories')
      .then(removeUrlHistory(result.url!))
      .then(async ([head, ...tail]) => {
        const title = await new Promise<string>((resolve) => {
          chrome.history.search({ text: '' }, (results) => {
            const history = results.find((el) => el.id === result.id);
            resolve(history?.title || result.title!);
          });
        });
        const lastVisitDate = (new Date(result.lastVisitTime!)).toLocaleDateString();
        const currentHistory = { ...result, title, lastVisitDate };
        if (head.headerDate && head.lastVisitDate === lastVisitDate) {
          return [head, currentHistory, ...tail];
        }
        if (!head.headerDate && head.lastVisitDate !== lastVisitDate) {
          const headerDate = {
            headerDate: true,
            lastVisitDate: head.lastVisitDate,
            lastVisitTime: head.lastVisitTime! - (head.lastVisitTime! % aDay),
          };
          return [currentHistory, headerDate, head, ...tail];
        }
        return [currentHistory, head, ...tail];
      });
    const htmlHistory = histories.slice(0, rows).map(makeHtmlHistory).join('');
    setLocal({ htmlHistory, histories });
  };
}

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
  const historyRows = settings.historyMax.rows;
  setBrowserIcon(options.colorPalette);
  makeHtmlBookmarks();
  makeHistory(historyRows)();
  setLocal({ settings, clientState, options });
  regsterChromeEvents(addHistory(historyRows))([chrome.history.onVisited]);
  regsterChromeEvents(removeHistory(historyRows))([chrome.history.onVisitRemoved]);
  regsterWindowEvent();
}

getLocal(...initStateKeys).then(init);
