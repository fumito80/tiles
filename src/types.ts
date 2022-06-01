import { mapMessagesPtoB } from './background';
import { mapMessagesBtoP } from './popup';

export type MapMessagesPtoB = typeof mapMessagesPtoB;
export type MapMessagesBtoP = typeof mapMessagesBtoP;

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
  autoZoom: true,
  includeUrl: false,
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

export type MyHistoryItem = Partial<chrome.history.HistoryItem & { headerDate: boolean }>;

export type ColorPalette = [
  paneBg: string,
  searching: string,
  frameBg: string,
  itemHover: string,
  keyColor: string,
];

export const defaultColorPalette: ColorPalette = ['FFFFFF', 'e8e8e9', 'CCE5FF', 'F6F6F6', '1DA1F2'];

export const initialOptions = {
  panes: ['histories', 'tabs', 'bookmarks'] as const,
  newTabPosition: 'rs' as 'rs' | 're' | 'ls' | 'le',
  showCloseTab: true,
  showSwitchTabsWin: true,
  showDeleteHistory: true,
  findTabsFirst: true,
  enableExternalUrl: false,
  externalUrl: '',
  findTabsMatches: 'domain' as 'domain' | 'prefix',
  css: '',
  editorTheme: 'vs-dark' as 'vs' | 'vs-dark',
  colorPalette: defaultColorPalette,
  zoomTabs: false,
  zoomHistory: true,
  zoomRatio: '0.7',
  fontSize: '0.9em',
  collapseTabs: false,
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
  },
  options: initialOptions,
  currentWindowId: chrome.windows.WINDOW_ID_NONE as number,
};

export type State = typeof initialState;
export type Options = State['options'];

export const CliMessageTypes = {
  initialize: 'cl-initialize',
  removeHistory: 'cl-remove-history',
} as const;

export const BkgMessageTypes = {
  updateHistory: 'bkg-update-history',
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

export const dropAreaClasses = [
  'drop-top',
  'drop-bottom',
  'drop-folder',
] as const;

export type DropClasses = typeof dropAreaClasses[number];

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

export type PayloadActionType<T> = ({ payload }: PayloadAction<T>) => any;

type MapMessages = MapMessagesPtoB & MapMessagesBtoP;

export type MessageTypePayloadAction<M extends MapMessages> = {
  [K in keyof M]: M[K] extends PayloadActionType<infer S> ? S : never;
}

export type InsertPosition = Parameters<Element['insertAdjacentElement']>[0];
export const positions: { [key: string]: InsertPosition } = {
  'drop-top': 'beforebegin',
  'drop-bottom': 'afterend',
  'drop-folder': 'beforeend',
};

export type Model = { [key: string]: any };
export type Collection = Array<Model>;

export type Nil = undefined | null;
