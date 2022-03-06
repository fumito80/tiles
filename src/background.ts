import {
  initialSettings,
  IClientState,
  IHtml,
  // ISettings,
  // IState,
  // CliMessageTypes,
  // OpenBookmarkType,
  EditBookmarkTypes,
  // dropClasses,
  CliMessageTypes,
  PayloadAction,
} from './types';
// import { cbToResolve } from './utils';
import { makeLeaf, makeNode } from './html';
import {
  pipe, prop, propEq, propNe,
} from './utils';

export const mapStateToResponse = {
  // [xr.CliMessageTypes.initialize]: ({ state }: ReduxHandlers) => ({
  //   options: state.options,
  //   html: state.html,
  //   clState: state.clientState,
  // }),
  [CliMessageTypes.saveState]: ({ payload }: PayloadAction<IClientState>) => payload,
  // ({ dispatch }: ReduxHandlers, { payload }: PayloadAction<bx.IClientState>) => {
  //   dispatch(clientState.actions.update(payload));
  // },
  [CliMessageTypes.saveOptions]: () => true,
  // ({ dispatch }: ReduxHandlers, { payload }: PayloadAction<bx.IOptions>) => {
  //   dispatch(sliceOptions.actions.update(payload));
  // },
  [CliMessageTypes.openBookmark]: () => {},
  //   async ({ state }: ReduxHandlers, { payload }: PayloadAction<bx.OpenBookmarkTypes>) => {
  //     const url = state.bookmarks.entities[payload.id]?.url;
  //     switch (payload.openType) {
  //       case bx.OpenBookmarkType.tab: {
  //         const tab = await F.getCurrentTab();
  //         chrome.tabs.create({
  //           index: tab.index + 1,
  //           windowId: tab.windowId,
  //           url,
  //         });
  //         break;
  //       }
  //       case bx.OpenBookmarkType.window: {
  //         chrome.windows.create({ url });
  //         break;
  //       }
  //       case bx.OpenBookmarkType.incognito: {
  //         chrome.windows.create({ url, incognito: true });
  //         break;
  //       }
  //       default:
  //     }
  //   },
  [CliMessageTypes.addBookmark]: () => {},
  // async ({ subscribe }: ReduxHandlers, { payload }: PayloadAction<string>) => {
  //   const { title, url } = await F.getCurrentTab();
  //   const index = (payload === '1') ? 0 : undefined;
  //   const creator = F.curry(chrome.bookmarks.create)({
  //     title,
  //     url,
  //     parentId: payload,
  //     index,
  //   });
  //   const { id } = await F.cbToResolve(creator);
  //   const [html, exists] = await new Promise<[string | undefined, boolean]>((resolve) => {
  //     const test = !!document.getElementById(id);
  //     if (test) {
  //       return resolve(['', test]);
  //     }
  // return subscribe(() => resolve([$(F.cssid(id))?.outerHTML, test]), ['html', 'created'], true);
  //   });
  //   return { id, html, exists };
  // },
  [CliMessageTypes.removeBookmark]: () => {},
  // async ({ subscribe }: ReduxHandlers, { payload }: PayloadAction<string>) => {
  //   F.cbToResolve(F.curry(chrome.bookmarks.remove)(payload));
  //   const succeed = await new Promise<boolean>((resolve) => {
  //     subscribe(() => resolve(true), ['html', 'created'], true);
  //   });
  //   return succeed;
  // },
  // [xr.CliMessageTypes.getUrl]:
  //   ({ state }: ReduxHandlers, { payload }: PayloadAction<string>) => (
  //     state.bookmarks.entities[Number(payload)]?.url
  //   ),
  [CliMessageTypes.editBookmark]: ({ payload }: PayloadAction<EditBookmarkTypes>) => payload,
  // async ({ subscribe }: ReduxHandlers, { payload }: PayloadAction<bx.EditBookmarkTypes>) => {
  //   const changes = { [payload.editType]: payload.value };
  //   const succeed = await new Promise<{ title: string, style: string }>((resolve) => {
  //     subscribe(() => {
  //       const anchor = $(`#${CSS.escape(payload.id)} > a`);
  //       resolve({
  //         title: anchor?.getAttribute('title')!,
  //         style: anchor?.getAttribute('style')!,
  //       });
  //     }, ['html', 'created'], true);
  //     F.cbToResolve(F.curry3(chrome.bookmarks.update)(payload.id)(changes));
  //   });
  //   return succeed;
  // },
  [CliMessageTypes.editFolder]: () => {},
  // async (
  //   { subscribe }: ReduxHandlers,
  //   { payload: { id, title } }: PayloadAction<{ id: string, title:string }>,
  // ) => {
  //   F.cbToResolve(F.curry3(chrome.bookmarks.update)(id)({ title }));
  //   const succeed = await new Promise<boolean>((resolve) => {
  //     subscribe(() => resolve(true), ['html', 'created'], true);
  //   });
  //   return succeed;
  // },
  [CliMessageTypes.addFolder]: () => {},
  // async (
  //   { subscribe }: ReduxHandlers,
  //   { payload: { parentId, title } }: PayloadAction<{ parentId: string, title:string }>,
  // ) => {
  //   const index = (parentId === '1') ? 0 : undefined;
  //   const { id } = await F.cbToResolve(F.curry(chrome.bookmarks.create)({
  //     parentId,
  //     title,
  //     index,
  //   }));
  //   const [html, exists] = await new Promise<[string | undefined, boolean]>((resolve) => {
  //     const test = !!document.getElementById(id);
  //     if (test) {
  //       return resolve(['', test]);
  //     }
  //  return subscribe(() => resolve([$(F.cssid(id))?.outerHTML, test]), ['html', 'created'], true);
  //   });
  //   return { id, html, exists };
  // },
  [CliMessageTypes.removeFolder]: () => {},
  // async ({ subscribe }: ReduxHandlers, { payload }: PayloadAction<string>) => {
  //   F.cbToResolve(F.curry(chrome.bookmarks.removeTree)(payload));
  //   const succeed = await new Promise<boolean>((resolve) => {
  //     subscribe(() => resolve(true), ['html', 'created'], true);
  //   });
  //   return succeed;
  // },
  [CliMessageTypes.moveItem]: () => {},
  // async (
  //   { state, subscribe }: ReduxHandlers,
  //   { payload: { id, targetId, dropClass } }: PayloadAction<bx.PayloadMoveItem>,
  // ) => {
  //   const tree = state.bookmarks.entities[targetId]!;
  //   const [parentId, index] = (() => {
  //     if (dropClass === 'drop-folder') {
  //       return [targetId, tree.childIds?.length || 0] as const;
  //     }
  //     const { childIds } = state.bookmarks.entities[tree.parentId!]!;
  //     const findIndex = childIds?.findIndex((childId) => childId === targetId);
  //     if (findIndex == null || findIndex === -1) {
  //       return ['', null] as const;
  //     }
  //     return [tree.parentId, findIndex + (dropClass === 'drop-bottom' ? 1 : 0)] as const;
  //   })();
  //   if (parentId == null || index == null) {
  //     return {
  //       parentId: null,
  //       index: null,
  //     };
  //   }
  //   const lastState = await new Promise<State>((resolve) => {
  //     subscribe((state2: State) => resolve(state2), ['html', 'created'], true);
  //     chrome.bookmarks.move(id, { parentId, index });
  //   });
  //   if (parentId === '1' || !!state.bookmarks.entities[id]!.url) {
  //     return { parentId, index };
  //   }
  //   if (lastState) {
  //     const { childIds } = lastState.bookmarks.entities[parentId]!;
  //     const findIndex = childIds?.findIndex((childId) => childId === id);
  //     const nextChildren = childIds?.slice(findIndex! + 1);
  //     const nextFolderId = nextChildren?.find((childId) => (
  //       !lastState.bookmarks.entities[childId]?.url
  //     ));
  //     return { parentId, index, nextFolderId };
  //   }
  //   return {
  //     parentId: null,
  //     index: null,
  //   };
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
    const html: IHtml = { leafs, folders };
    chrome.storage.local.set({ html });
  });
}

const bookmarksEvents = [
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onImportEnded,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onRemoved,
];

bookmarksEvents.forEach((listener) => listener.addListener(makeHtmlBookmarks));

const settings = initialSettings;
const clientState = {};
chrome.storage.local.set({ settings, clientState });

makeHtmlBookmarks();
