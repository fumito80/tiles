import {
  MapStateToResponse,
} from './background';

export type {
  MapStateToResponse,
} from './background';

export const pastMSec = 1000 * 60 * 60 * 24 * 365;

export const initialSettings = {
  postPage: false,
  width: 800,
  height: 450,
  grid1Width: 200,
  grid2Width: 200,
  grid3Width: 200,
  bodyColor: '#222222',
  bodyBackgroundColor: '#f6f6f6',
  leafsBackgroundColor: '#ffffff',
  keyColor: '#1da1f2',
  tabs: true,
  history: true,
  historyMax: {
    rows: 30,
    days: null,
  },
} as const;

export type ISettings = typeof initialSettings;

export type IClientState = {
  open?: string;
  paths?: Array<string>;
}

export type HtmlBookmarks = {
  leafs: string;
  folders: string;
}

export type MyHistoryItem = Partial<chrome.history.HistoryItem &
  { lastVisitDate: string, headerDate: boolean }>;

export const initalState = {
  htmlBookmarks: {} as HtmlBookmarks,
  htmlTabs: '',
  htmlHistory: '',
  histories: [] as Array<MyHistoryItem>,
  clientState: {} as IClientState,
  settings: initialSettings,
  vscrollProps: {
    rowHeight: 0,
    elementHeight: 0,
  },
};

export type IState = typeof initalState;

export const CliMessageTypes = {
  initialize: 'cl-initialize',
  saveOptions: 'cl-save-options',
  saveState: 'cl-save-state',
  openBookmark: 'cl-open-bookmark',
  addBookmark: 'cl-add-bookmark',
  removeBookmark: 'cl-remove-bookmark',
  editBookmark: 'cl-edit-bookmark',
  addFolder: 'cl-add-folder',
  editFolder: 'cl-edit-folder',
  removeFolder: 'cl-remove-folder',
  getUrl: 'cl-get-url',
  moveItem: 'cl-move-item',
} as const;

export const OpenBookmarkType = {
  tab: 'tab',
  window: 'window',
  incognito: 'incognito',
} as const;

export type OpenBookmarkTypes = {
  openType: keyof typeof OpenBookmarkType;
  id: string;
}

export const EditBookmarkType = {
  title: 'title',
  url: 'url',
} as const;

export type EditBookmarkTypes = {
  editType: keyof typeof EditBookmarkType;
  value: string;
  id: string;
}

export const dropClasses = [
  'drop-top',
  'drop-bottom',
  'drop-folder',
] as const;

export type DropClasses = typeof dropClasses[number];

export type PayloadMoveItem = {
  id: string;
  targetId: string;
  dropClass: DropClasses;
}

export type PayloadAction<P = void, T extends string = string, M = never, E = never> = {
  payload: P;
  type: T;
} & ([M] extends [never] ? {} : {
  meta: M;
}) & ([E] extends [never] ? {} : {
  error: E;
});

export type RequestCallback<T> = ({ payload }: PayloadAction<T>) => any;

export type MessageStateMapObject<M extends MapStateToResponse> = {
  [K in keyof M]: M[K] extends RequestCallback<infer S> ? S : never;
}

type InsertPosition = Parameters<Element['insertAdjacentElement']>[0];
export const positions: { [key: string]: InsertPosition } = {
  'drop-top': 'beforebegin',
  'drop-bottom': 'afterend',
  'drop-folder': 'beforeend',
};

export type Model = { [key: string]: any };
export type Collection = Array<Model>;
