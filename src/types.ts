import { mapMessagesPtoB } from './background';
import { HeaderLeafs, Leafs } from './bookmarks';
import { AppMain } from './app-main';
import { Folders } from './folders';
import { HeaderHistory, History } from './history';
import { mapMessagesBtoP } from './popup';
import { HeaderTabs, Tabs } from './tabs';

export type StoredElements = {
  'app-main': AppMain,
  'header-leafs': HeaderLeafs,
  'body-leafs': Leafs,
  'body-folders': Folders,
  'header-tabs': HeaderTabs,
  'body-tabs': Tabs,
  'header-history': HeaderHistory,
  'body-history': History,
}

export type MapMessagesPtoB = typeof mapMessagesPtoB;
export type MapMessagesBtoP = typeof mapMessagesBtoP;

export const pastMSec = 1000 * 60 * 60 * 24 * 365;

export const initialSettings = {
  postPage: false,
  width: 800,
  height: 500,
  paneWidth: {
    pane1: 200,
    pane2: 325,
    pane3: 100,
  },
  bodyColor: '#222222',
  tabs: true,
  history: true,
  historyMax: {
    rows: 30,
    days: null,
  },
  includeUrl: false,
  theme: {
    light: '',
    dark: '',
    other: '',
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

export type MyHistoryItem = Partial<chrome.history.HistoryItem & { headerDate: boolean }>;

export type ColorPalette = [
  paneBg: string,
  searching: string,
  frameBg: string,
  itemHover: string,
  keyColor: string,
];

export const defaultColorPalette: ColorPalette = ['FFFFFF', 'E8E8E9', 'CCE5FF', 'F6F6F6', '1DA1F2'];

export const initialOptions = {
  panes: ['histories', 'tabs', 'bookmarks'] as const,
  bookmarksPanes: ['leafs', 'folders'] as const,
  newTabPosition: 'rs' as 'rs' | 're' | 'ls' | 'le',
  showCloseTab: true,
  showSwitchTabsWin: true,
  showDeleteHistory: true,
  findTabsFirst: true,
  enableExternalUrl: false,
  externalUrl: '',
  findTabsMatches: 'prefix' as 'domain' | 'prefix',
  css: '',
  editorTheme: 'vs-dark' as 'vs' | 'vs-dark',
  colorPalette: defaultColorPalette,
  zoomTabs: false,
  zoomHistory: true,
  zoomRatio: '0.7',
  fontSize: '0.9em',
  collapseTabs: true,
  exclusiveOpenBmFolderTree: true,
};

export const initialState = {
  htmlBookmarks: {} as HtmlBookmarks,
  htmlTabs: '',
  htmlHistory: '',
  clientState: {} as ClientState,
  settings: initialSettings,
  vscrollProps: {
    rowHeight: 0,
  },
  options: initialOptions,
  lastSearchWord: '',
};

export type State = typeof initialState;
export type Options = State['options'];

export const CliMessageTypes = {
  initialize: 'cl-initialize',
  moveWindow: 'cl-move-window',
  moveWindowNew: 'cl-move-window-new',
} as const;

export const BkgMessageTypes = {
  updateHistory: 'bkg-update-history',
} as const;

export const OpenBookmarkType = {
  tab: 'tab',
  window: 'window',
  incognito: 'incognito',
  current: 'current',
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
  'leafs',
  'new-window-plus',
  'query',
] as const;

export type DropClasses = typeof dropAreaClasses[number];

export const splitterClasses = ['pane1', 'pane2', 'pane3'] as const;

export type SplitterClasses = { [key in typeof splitterClasses[number]]: number };

export type PayloadMoveItem = {
  id: string;
  targetId: string;
  dropClass: DropClasses;
}

export type PayloadAction<P = void, M = never, E = never> = {
  payload: P;
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
  leafs: 'beforeend',
};

export type Model = { [key: string]: any };
export type Collection = Array<Model>;

export type Nil = undefined | null;

// eslint-disable-next-line no-undef
export type HTMLElementEventType = HTMLElementEventMap;

export type InitailTabs = {
  windowId: number,
  tabs: chrome.tabs.Tab[];
}[];

export type PromiseInitTabs = Promise<[InitailTabs, number]>;

// eslint-disable-next-line no-undef
export type EventListenerOptions = boolean | AddEventListenerOptions;
