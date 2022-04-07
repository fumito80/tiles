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
  paneWidth: {
    pane1: 200,
    pane2: 200,
    pane3: 200,
  },
  bodyColor: '#222222',
  tabs: true,
  history: true,
  historyMax: {
    rows: 30,
    days: null,
  },
};

export type Settings = typeof initialSettings;

export type ClientState = {
  open?: string;
  paths?: Array<string>;
}

export type HtmlBookmarks = {
  leafs: string;
  folders: string;
}

export type MyHistoryItem = Partial<chrome.history.HistoryItem &
  { lastVisitDate: string, headerDate: boolean }>;

const css = [
  'body {',
  '    font-size: 0.9em;',
  '}\n',
  '/* Scroll-bar width */',
  '.folders::-webkit-scrollbar,',
  '.leafs::-webkit-scrollbar,',
  '.pane-tabs::-webkit-scrollbar,',
  '.v-scroll-bar::-webkit-scrollbar {',
  '    width: 8px;',
  '}\n',
  '/* Scroll-bar color */',
  '::-webkit-scrollbar-thumb {',
  '    background-color: rgba(0, 0, 0, 0.2);',
  '}\n',
].join('\n');

export type ColorPalette = [
  paneBg: string,
  searching: string,
  frameBg: string,
  itemHover: string,
  keyColor: string,
];

const colorPalette: ColorPalette = ['FFFFFF', 'cce5ff', 'f6f6f6', 'e8e8e9', '1da1f2'];

export const initialOptions = {
  newTabPosition: 'rs' as 'rs' | 're' | 'ls' | 'le',
  includeUrl: true,
  showCloseTab: true,
  showCloseHistory: false, // Pending
  findTabsFirst: true,
  enableExternalUrl: false,
  externalUrl: '',
  findTabsMatches: 'domain' as 'domain' | 'prefix',
  css,
  editorTheme: 'vs-dark' as 'vs' | 'vs-dark',
  colorPalette,
};

export const initialState = {
  htmlBookmarks: {} as HtmlBookmarks,
  htmlTabs: '',
  htmlHistory: '',
  histories: [] as Array<MyHistoryItem>,
  clientState: {} as ClientState,
  settings: initialSettings,
  vscrollProps: {
    rowHeight: 0,
    elementHeight: 0,
  },
  options: initialOptions,
  currentWindowId: chrome.windows.WINDOW_ID_NONE as number,
};

export type State = typeof initialState;
export type Options = State['options'];

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

export const splitterClasses = ['pane1', 'pane2', 'pane3'] as const;

export type SplitterClasses = { [key in typeof splitterClasses[number]]: number };

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

export type Nil = undefined | null;
