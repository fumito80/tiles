/* eslint-disable no-redeclare */

import {
  PayloadAction,
  MapMessagesPtoB,
  MapMessagesBtoP,
  MessageTypePayloadAction,
  State,
  MyHistoryItem,
  Options,
  ColorPalette,
  HTMLElementEventType,
  pastMSec,
  EventListenerOptions,
} from './types';

import {
  getColorPaletteHTML,
  recombiPalette,
  addColorSpec,
  recombiPaletteDark,
} from './settings-colors';

export const aDayMSec = 1000 * 60 * 60 * 24;

export const delayMultiSelect = 400;

type AnyFunction = (...p: any[]) => any;

type EventListener<K extends keyof HTMLElementEventType, T extends HTMLElement> = (
  this: T,
  ev: HTMLElementEventType[K]
) => any;

type EventListenerMap<T extends HTMLElement = HTMLElement> = {
  [K in keyof Partial<HTMLElementEventType>]: EventListener<K, T>
}

type EventListeners<
  K extends keyof HTMLElementEventType,
  T extends HTMLElement
> = [K, EventListener<K, T>];

export function setEvents<T extends HTMLElement>(
  htmlElements: Array<T>,
  eventListeners: EventListenerMap<T>,
  options?: EventListenerOptions,
  thisArg?: any,
) {
  const itrEventListeners = Object.entries(eventListeners) as
    EventListeners<keyof typeof eventListeners, T>[];
  itrEventListeners.forEach(([eventType, listener]) => {
    if (!listener) {
      return;
    }
    htmlElements.forEach((htmlElement) => {
      htmlElement.addEventListener(eventType, listener.bind(thisArg ?? htmlElement), options);
    });
  });
}

export function addListener<T extends keyof HTMLElementEventType>(
  type: T,
  ev: (e: HTMLElementEventType[T]) => any,
  options?: EventListenerOptions,
) {
  return <U extends Element | undefined>(element: U) => {
    (element as unknown as HTMLElement)?.addEventListener(type, ev, options);
    return element;
  };
}

// Others

function whenGetter<T extends any | AnyFunction>(
  valueOrFunction: T,
): T extends AnyFunction ? ReturnType<T> : T;
function whenGetter(valueOrFunction: any) {
  if (typeof valueOrFunction === 'function') {
    return valueOrFunction();
  }
  return valueOrFunction;
}

function thenConst<T>(a: T) {
  return {
    get: () => whenGetter<T>(a),
    // eslint-disable-next-line no-use-before-define
    then: () => whenConst<T>(a),
    else: () => whenGetter<T>(a),
  };
}

function whenConst<T>(a: T) {
  return {
    when: () => thenConst<T>(a),
    else: () => whenGetter<T>(a),
  };
}

export function when(test: boolean) {
  return {
    get: <T extends AnyFunction | any>(valueOrFunction: T) => {
      if (!test) {
        return null;
      }
      return whenGetter<T>(valueOrFunction);
    },
    then: <T extends AnyFunction | any>(valueOrFunction: T) => ({
      else: <U extends AnyFunction | any>(elseValueOrFunction: U) => {
        if (test) {
          return whenGetter<T>(valueOrFunction);
        }
        return whenGetter<U>(elseValueOrFunction);
      },
      when: (testNext: boolean) => {
        if (test) {
          return thenConst<T>(valueOrFunction);
        }
        return when(testNext);
      },
    }),
  };
}

function swichesConst<T>(a: T) {
  return {
    // eslint-disable-next-line no-use-before-define
    case: () => caseThenConst<T>(a),
    else: () => whenGetter<T>(a),
  };
}

function caseThenConst<T>(a: T) {
  return {
    then: () => swichesConst<T>(a),
  };
}

export function switches<T>(value: T) {
  return {
    case: (testValue: T) => ({
      then: <U>(thenValue: U) => ({
        case: (testValueNext: T) => {
          if (value === testValue) {
            return caseThenConst<U>(thenValue);
          }
          return switches<T>(value).case(testValueNext);
        },
        else: <V>(elseValue: V) => {
          if (value === testValue) {
            return whenGetter<U>(thenValue);
          }
          return whenGetter<V>(elseValue);
        },
      }),
    }),
  };
}

export function decode<T, U, V extends T, W extends U | undefined>(
  testValue: T,
  ...testers: Array<[V, U] | W>
) {
  let result = undefined as U | W;
  for (let i = 0; i < testers.length; i += 1) {
    const tester = testers[i];
    if (!Array.isArray(tester)) {
      result = tester;
      break;
    }
    if (testValue === tester[0]) {
      [, result] = tester;
      break;
    }
  }
  return result;
}

export function eq<T>(a: T) {
  return (b: T) => a === b;
}

// export type Map<T extends Array<any>, U, V> = U extends T
//   ? (f: (element: U[number], index: number, self: U) => V) => (array: T) => V[]
//   : (f: (element: T[number], index: number, self: T) => V) => (array: T) => V[]

// export const map = <T, U, V>((f) => (array) => array.map(f)) as Map<T, U, V>;

export function map<T extends Array<any>, U>(
  f: (element: T[number], index: number, self: T[number][]) => U,
) {
  return (array: T) => array.map(f);
}

export function filter<T extends Array<any>>(
  f: (element: T[number], index: number, self: T[number][]) => boolean,
) {
  return (array: T) => array.filter(f) as T;
}

export function reduce<T extends Array<any>, U>(
  f: (acc: U, element: T[number], index?: number, self?: T[number][]) => U,
  _init: U,
) {
  return (array: T) => array.reduce(f, _init) as U;
}

export function find<T extends Array<any>>(
  f: (element: T[number], index?: number, self?: T[number][]) => boolean,
) {
  return (array: T) => array.find(f) as T[number];
}

export function tap<T>(f: (a: T) => any | PromiseLike<any> | never) {
  return (a: T) => {
    f(a);
    return a;
  };
}

export function forEach<T extends Array<any>>(
  f: (element: T[number], index: number, self: T[number][]) => void,
) {
  return (array: T) => array.forEach(f);
}

export function head<T>([a]: [T, ...any]) {
  return a;
}

export function second<T>([, a]: [any, T, ...any]) {
  return a;
}

export function third<T>([,, a]: [any, any, T, ...any]) {
  return a;
}

export function init<T extends Array<any>>(args: T) {
  return args.slice(0, -1);
}

export type Tail<T extends Array<any>> =
  ((...args: T) => any) extends (_head: any, ...rest: infer U) => any ? U : T;

export function tail<T extends Array<any>>([, ...rest]: readonly [any, ...T]) {
  return rest;
}

export function last<T>(args: T[]) {
  return args.at(-1);
}

// test
// const x: [
//   _a: string,
//   _b: number,
//   _c: string,
//   _d: number,
//   _e: Array<string>,
// ] = [
//   '1',
//   2,
//   '3',
//   4,
//   ['5', '6'],
// ];
// head(x);
// tail(x);
// init(x);
// last(x);

// export function curry<T1, T2, T3, T4, T5, U>(f: (p1: T1, ...p2: [T2, T3?, T4?, T5?]) => U) {
//   return (p1: T1) => (...p2: [T2, T3?, T4?, T5?]): U => f(p1, ...p2);
// }

export function curry<T1, T2, U>(f: (p1: T1, p2: T2) => U) {
  return (p1: T1) => (p2: T2): U => f(p1, p2);
}

export function curry3<T1, T2, T3, U>(f: (p1: T1, p2: T2, ...p3: Array<T3>) => U) {
  return (p1: T1) => (p2: T2) => (...p3: Array<T3>) => f(p1, p2, ...p3);
}

export function swap<T, U, V>(f: (a: T, b: U) => V) {
  return (b: U, a: T) => f(a, b) as V;
}

export async function cbToResolve<T>(
  f: (cb: (value: T | PromiseLike<T>) => void) => any,
): Promise<T>;
export async function cbToResolve(f: (cb: () => void) => any): Promise<void>;
export async function cbToResolve(f: (cb: (value?: any) => void) => any) {
  return new Promise((resolve) => {
    f(resolve);
  });
}

const getClassName = Object.prototype.toString.call.bind(Object.prototype.toString);
const hasOwnProperty = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

export function objectEqaul(a: any, b: any, deep = false) {
  if (Object.is(a, b)) {
    return true;
  }
  const classNameA = getClassName(a);
  if (classNameA !== getClassName(b)) {
    return false;
  }
  if (classNameA === '[object Array]') {
    if (a.length !== b.length) {
      return false;
    }
    if (deep) {
      for (let i = 0; i < a.length; i += 1) {
        if (!objectEqaul(a[i], b[i], true)) {
          return false;
        }
      }
    } else {
      for (let i = 0; i < a.length; i += 1) {
        if (Object.is(a[i], b[i])) {
          return false;
        }
      }
    }
    return true;
  }
  if (classNameA === '[object Object]') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    if (deep) {
      for (let i = 0; i < keysA.length; i += 1) {
        if (
          !hasOwnProperty(b, keysA[i])
          || !objectEqaul(a[keysA[i]], b[keysA[i]], true)
        ) {
          return false;
        }
      }
    } else {
      for (let i = 0; i < keysA.length; i += 1) {
        if (
          !hasOwnProperty(b, keysA[i])
          || !Object.is(a[keysA[i]], b[keysA[i]])
        ) {
          return false;
        }
      }
    }
    return true;
  }
  return false;
}

export function pipe<T extends Array<any>, R1, R2>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
): (...a: T) => R2;
export function pipe<T extends Array<any>, R1, R2, R3>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
): (...a: T) => R3;
export function pipe<T extends Array<any>, R1, R2, R3, R4>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
): (...a: T) => R4;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
): (...a: T) => R5;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5, R6>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
): (...a: T) => R6;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5, R6, R7>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
): (...a: T) => R7;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5, R6, R7, R8>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
  fn8: (a: R7) => R8,
): (...a: T) => R8;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5, R6, R7, R8, R9>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
  fn8: (a: R7) => R8,
  fn9: (a: R8) => R9,
): (...a: T) => R9;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5, R6, R7, R8, R9, R10>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
  fn8: (a: R7) => R8,
  fn9: (a: R8) => R9,
  fn10: (a: R9) => R10,
): (...a: T) => R9;
export function pipe<T extends Array<any>, R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12>(
  fn1: (...a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
  fn8: (a: R7) => R8,
  fn9: (a: R8) => R9,
  fn10: (a: R9) => R10,
  fn11: (a: R10) => R11,
  fn12: (a: R11) => R12,
): (...a: T) => R12;

export function pipe(fn: any, ...fns: Array<any>) {
  return (...values: any) => fns.reduce(
    (prevValue, nextFn) => nextFn(prevValue),
    fn(...values),
  );
}

export function maybePipe<T extends Array<any>, R1, R2, R3>(
  fn1: (...a: T) => R1,
  fn2: (a: Exclude<R1, null>) => R2,
  fn3: (a: Exclude<R2, null>) => R3,
): (...a: T) => R3 | null;

export function maybePipe(fn: any, ...fns: Array<any>) {
  return (...values: any) => {
    let result = fn(...values);
    for (let i = 0; i < fns.length; i += 1) {
      if (result == null) {
        return null;
      }
      result = fns[i](result);
    }
    return result;
  };
}

export function pipeP<T, R1, R2>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
): (a: Promise<T>) => Promise<R2>;
export function pipeP<T, R1, R2, R3>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
): (a: Promise<T>) => Promise<R3>;
export function pipeP<T, R1, R2, R3, R4>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
): (a: Promise<T> | T) => Promise<R4>;
export function pipeP<T, R1, R2, R3, R4, R5>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
): (a: Promise<T>) => Promise<R5>;
export function pipeP<T, R1, R2, R3, R4, R5, R6>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
): (a: Promise<T>) => Promise<R6>;
export function pipeP<T, R1, R2, R3, R4, R5, R6, R7>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
): (a: Promise<T>) => Promise<R7>;
export function pipeP<T, R1, R2, R3, R4, R5, R6, R7, R8>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
  fn4: (a: R3) => R4,
  fn5: (a: R4) => R5,
  fn6: (a: R5) => R6,
  fn7: (a: R6) => R7,
  fn8: (a: R7) => R8,
): (a: Promise<T>) => Promise<R8>;

export function pipeP(...fns: Array<any>) {
  return (p1: Promise<any>) => {
    fns.reduce((prevPromise, nextFn) => prevPromise.then(nextFn), p1);
  };
}

export function maybePipeP<T, R1, R2>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
): (a: Promise<T>) => Promise<R2 | null>;
export function maybePipeP<T, R1, R2, R3>(
  fn1: (a: T) => R1,
  fn2: (a: R1) => R2,
  fn3: (a: R2) => R3,
): (a: Promise<T>) => Promise<R3 | null>;
export function maybePipeP<T>(
  ...fn1: any[]
): (a: Promise<T>) => any;

export function maybePipeP(fn: any, ...fns: any[]) {
  return async (...values: any[]) => {
    const result = await fn(...values);
    if (result == null || result === false) {
      return null;
    }
    if (fns.length === 0) {
      return result;
    }
    return maybePipeP(...fns)(result);
  };
}

export function pick<U extends Array<string>>(...props: U): <T>(target: T) =>
  Pick<T, U[number] extends keyof T ? U[number] : never[number]>;
export function pick(...props: any) {
  return (target: any) => props
    .reduce((acc: any, key: any) => ({ ...acc, [key]: target[key] }), {});
}

export async function getCurrentTab() {
  return new Promise<chrome.tabs.Tab>((resolve) => {
    chrome.tabs.query({
      active: true,
      currentWindow: true,
    }, ([tab]) => resolve(tab));
  });
}

export function getParentElement(el: HTMLElement, level: number): HTMLElement | null {
  if (level <= 0 || !el || !el.parentElement) {
    return el;
  }
  return getParentElement(el.parentElement, level - 1);
}

const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime) as
  (message: any, responseCallback: (response: any) => void) => void;

type MapMessages = MapMessagesPtoB & MapMessagesBtoP;

export async function postMessage<T extends keyof MapMessages>(
  msg: { type: T } & Partial<PayloadAction<MessageTypePayloadAction<MapMessages>[T]>>,
) {
  return new Promise<ReturnType<MapMessages[T]>>((resolve) => {
    sendMessage(msg, (resp) => {
      if (!chrome.runtime.lastError) {
        resolve(resp);
      }
      return true;
    });
  });
}

export function cssid(id: string | number) {
  return `#${CSS.escape(id as string)}`;
}

export function whichClass<T extends ReadonlyArray<string>>(
  classNames: T,
  element?: HTMLElement | null,
): T[number] | undefined {
  return classNames.find((name) => element?.classList.contains(name));
}

export function prop<T, U extends keyof T>(name: U): (target: T) => T[U];
export function prop<T extends Element, U extends keyof T>(name: U): (target: T | null) => T[U];
export function prop(name: any) {
  return (target: any) => target[name];
}

export function propEq<T, U extends keyof T, V extends T[U]>(name: U, value: V): (target: T)
  => boolean;
export function propEq(name: any, value: any) {
  return (target: any) => target[name] === value;
}

export function propNe<T, U extends keyof T, V extends T[U]>(name: U, value: V): (target: T)
  => boolean;
export function propNe(name: string, value: any) {
  return (target: any) => target[name] !== value;
}

export function cssEscape(text: string) {
  return encodeURIComponent(text).replace(/[()']/g, (e) => `\\${e}`);
}

export const preFaviconUrl = chrome.runtime.getURL('_favicon/?pageUrl=');
const chromeSvg = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48IS0tISBGb250IEF3ZXNvbWUgUHJvIDYuMi4wIGJ5IEBmb250YXdlc29tZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tIExpY2Vuc2UgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbS9saWNlbnNlIChDb21tZXJjaWFsIExpY2Vuc2UpIENvcHlyaWdodCAyMDIyIEZvbnRpY29ucywgSW5jLiAtLT48cGF0aCBmaWxsPSIjNDA0NDQ3IiBkPSJNMCAyNTZDMCAyMDkuNCAxMi40NyAxNjUuNiAzNC4yNyAxMjcuMUwxNDQuMSAzMTguM0MxNjYgMzU3LjUgMjA3LjkgMzg0IDI1NiAzODRDMjcwLjMgMzg0IDI4My4xIDM4MS43IDI5Ni44IDM3Ny40TDIyMC41IDUwOS42Qzk1LjkgNDkyLjMgMCAzODUuMyAwIDI1NnpNMzY1LjEgMzIxLjZDMzc3LjQgMzAyLjQgMzg0IDI3OS4xIDM4NCAyNTZDMzg0IDIxNy44IDM2Ny4yIDE4My41IDM0MC43IDE2MEg0OTMuNEM1MDUuNCAxODkuNiA1MTIgMjIyLjEgNTEyIDI1NkM1MTIgMzk3LjQgMzk3LjQgNTExLjEgMjU2IDUxMkwzNjUuMSAzMjEuNnpNNDc3LjggMTI4SDI1NkMxOTMuMSAxMjggMTQyLjMgMTcyLjEgMTMwLjUgMjMwLjdMNTQuMTkgOTguNDdDMTAxIDM4LjUzIDE3NCAwIDI1NiAwQzM1MC44IDAgNDMzLjUgNTEuNDggNDc3LjggMTI4VjEyOHpNMTY4IDI1NkMxNjggMjA3LjQgMjA3LjQgMTY4IDI1NiAxNjhDMzA0LjYgMTY4IDM0NCAyMDcuNCAzNDQgMjU2QzM0NCAzMDQuNiAzMDQuNiAzNDQgMjU2IDM0NEMyMDcuNCAzNDQgMTY4IDMwNC42IDE2OCAyNTZ6Ii8+PC9zdmc+';

export function makeStyleIcon(url?: string) {
  if (url === 'chrome://newtab/') {
    return `background-image: url(data:image/svg+xml;base64,${chromeSvg}); background-size: 15px;`;
  }
  const pageUrl = (!url || url.startsWith('data')) ? 'none' : cssEscape(url);
  return `background-image: url(${preFaviconUrl}${pageUrl});`;
}

export function setFavicon(url?: string) {
  return ($el: HTMLElement) => $el.setAttribute('style', makeStyleIcon(url));
}

export function regsterChromeEvents(listener: Function) {
  return (events: chrome.events.Event<any>[]) => events.forEach((e) => e.addListener(listener));
}

export async function setLocal<T extends Partial<State>>(state: T) {
  return new Promise<T>((resolve) => {
    chrome.storage.local.set(state, () => {
      if (chrome.runtime.lastError) {
        // eslint-disable-next-line no-console
        console.log(chrome.runtime.lastError.message);
      }
      resolve(state);
    });
  });
}

export function setSync(state: Partial<State>) {
  chrome.storage.sync.set(state);
  return state;
}

async function getStorage<T extends Array<keyof State>>(
  storageArea: chrome.storage.LocalStorageArea | chrome.storage.SyncStorageArea,
  ...keyNames: T
) {
  return new Promise<Pick<State, T[number]>>((resolve) => {
    storageArea.get(keyNames, (data) => resolve(data as Pick<State, T[number]>));
  });
}

export function getLocal<T extends Array<keyof State>>(...keyNames: T) {
  return getStorage(chrome.storage.local, ...keyNames);
}

export async function updateSettings<T extends Partial<State['settings']>>(setting: T) {
  return getLocal('settings').then(({ settings }) => setLocal({ settings: { ...settings, ...setting } }));
}

export function getSync<T extends Array<keyof State>>(...keyNames: T) {
  return getStorage(chrome.storage.sync, ...keyNames);
}

export async function bootstrap<T extends Array<keyof State>>(...storageKeys: T) {
  const result = getLocal(...storageKeys);
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  return result;
}

export function getKeys<T extends Object>(object: T) {
  return Object.keys(object) as unknown as Array<keyof T>;
}

export function extractUrl(faviconUrl?: string) {
  const [, url = ''] = /\?pageUrl=(.*)"\)$/.exec(faviconUrl || '') || [];
  return decodeURIComponent(url);
}

export function extractDomain(url?: string) {
  const [, scheme = '', domain = ''] = /^([\w-]+?:\/\/)([\s\S]+?)(\/|$)/.exec(url || '') || [];
  return [scheme, domain];
}

export function base64Encode(...parts: string[]) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = (reader.result as string)!.split(',');
      resolve(base64);
    };
    reader.readAsDataURL(new Blob(parts));
  });
}

export function getRGB(colorCode: string) {
  return [colorCode.substring(0, 2), colorCode.substring(2, 4), colorCode.substring(4, 6)]
    .map((hex) => parseInt(hex, 16));
}

export function getColorChroma(colorCode: string) {
  const [r, g, b] = getRGB(colorCode);
  const iMax = Math.max(r, g, b);
  const iMin = Math.min(r, g, b);
  return (iMax - iMin) / 255;
}

export const lightColorWhiteness = 0.6;

export function getColorWhiteness(colorCode: string) {
  const [r, g, b] = getRGB(colorCode);
  return Math.max(
    ((r || 1) * (g || 1) * (b || 1)) / (0xFF * 0xFF * 0xFF),
    (g * b) / (0xFF * 0xFF),
    (r * b) / (0xFF * 0xFF),
    (r * g) / (0xFF * 0xFF),
  );
  // const [r, g, b] = getRGB(colorCode).map((c) => c / 255);
  // const max = Math.max(r, g, b);
  // const min = Math.min(r, g, b);
  // return (max + min) / 2;
}

const escapes = new Map();
escapes.set('&', '&amp;');
escapes.set('"', '&quot;');
escapes.set('<', '&lt;');
escapes.set('>', '&gt;');

export function htmlEscape(text: string) {
  return text!.replace(/[&"<>]/g, (e) => escapes.get(e));
}

export function removeUrlHistory1(url: string, lastVisitTime: number = -1) {
  return (histories: MyHistoryItem[]) => {
    const findIndex = histories.findIndex(
      (history) => history.url === url || history.lastVisitTime === lastVisitTime,
    );
    if (findIndex === -1) {
      return histories;
    }
    let tails = histories.slice(findIndex + 1);
    const findIndex2 = tails.findIndex(
      (history) => history.url === url || history.lastVisitTime === lastVisitTime,
    );
    if (findIndex2 >= 0) {
      tails = [...tails.slice(0, findIndex2), ...tails.slice(findIndex2 + 1)];
    }
    if (histories[findIndex - 1]?.headerDate) {
      const nextItem = histories[findIndex + 1];
      if (!nextItem || nextItem.headerDate) {
        return [
          ...histories.slice(0, findIndex - 1),
          ...tails,
        ];
      }
    }
    if (tails[findIndex2 - 1]?.headerDate) {
      const nextItem = tails[findIndex2];
      if (!nextItem || nextItem.headerDate) {
        return [
          ...histories.slice(0, findIndex),
          ...tails.slice(0, findIndex2),
          ...tails.slice(findIndex2),
        ];
      }
    }
    return [
      ...histories.slice(0, findIndex),
      ...tails,
    ];
  };
}

export function getLocaleDate(dateOrSerial?: Date | number) {
  if (dateOrSerial == null) {
    return (new Date()).toLocaleDateString();
  }
  if (dateOrSerial < 1000) {
    return 'Undated';
  }
  return (new Date(dateOrSerial)).toLocaleDateString();
}

export function isDateEq(dateOrSerial1?: Date | number, dateOrSerial2?: Date | number) {
  const date1 = (new Date(dateOrSerial1!)).toLocaleDateString();
  const date2 = (new Date(dateOrSerial2!)).toLocaleDateString();
  if (date1 === 'Invalid Date' || date2 === 'Invalid Date') {
    return false;
  }
  return date1 === date2;
}

type Messages = {
  [key: string]: (message: any) => Promise<any>;
}

export function setMessageListener<T extends Messages>(messageMap: T, once = false) {
  function onMessage(
    message: { type: keyof T } & PayloadAction<any>,
    _: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) {
    const listener = messageMap[message?.type];
    if (typeof listener === 'function') {
      const maybePromise = listener(message);
      const isPromise = maybePromise instanceof Promise;
      if (isPromise) {
        maybePromise.then((result: any) => sendResponse(result));
      }
      if (once) {
        chrome.runtime.onMessage.removeListener(onMessage);
      }
      return isPromise;
    }
    return true;
  }
  chrome.runtime.onMessage.addListener(onMessage);
}

export function camelToSnake(value: string) {
  return value.split('').map((s) => [s, s.toLowerCase()]).map(([s, smallS]) => (s === smallS ? s : `-${smallS}`)).join('');
}

export function getGridColStart($target: HTMLElement) {
  let gridColStart = 0;
  for (let $prev = $target.previousElementSibling; $prev; $prev = $prev.previousElementSibling) {
    if (!$prev.classList.contains('pane-body')) {
      break;
    }
    gridColStart += 1;
  }
  return gridColStart;
}

export function getColorFromBg(colorPalette: ColorPalette) {
  const lightColor = '#efefef';
  const darkColor = '#222222';
  return colorPalette
    .map((code) => [`#${code}`, getColorWhiteness(code)])
    .map(([bgColor, whiteness]) => [bgColor, whiteness > lightColorWhiteness] as [string, boolean])
    .map(([bgColor, isLight]) => [bgColor, isLight ? darkColor : lightColor, isLight]);
}

export function makeThemeCss(colorPalette: ColorPalette) {
  const [
    [paneBg, paneColor],
    [frameBg, frameColor],
    [itemHoverBg, itemHoverColor],
    [searchingBg, searchingColor],
    [keyBg, keyColor],
  ] = getColorFromBg(colorPalette);
  return Object
    .entries({
      paneBg,
      paneColor,
      frameBg,
      frameColor,
      itemHoverBg,
      itemHoverColor,
      searchingBg,
      searchingColor,
      keyBg,
      keyColor,
    })
    .map(([key, value]) => `    --${camelToSnake(key)}: ${value};`)
    .join('\n');
}

export async function getPopup() {
  const url = chrome.runtime.getURL('popup.html*');
  const [popup] = await chrome.tabs.query({ url });
  return popup;
}

export function setPopupStyle({ css, colorPalette, windowMode }: Pick<Options, 'css' | 'colorPalette' | 'windowMode'>) {
  if (windowMode) {
    chrome.action.setPopup({ popup: '' });
    return;
  }
  getLocal('settings').then(({ settings }) => {
    const variables = makeThemeCss(colorPalette);
    const styleHeight = `body { height: ${settings.height}px; }`;
    const encoded = encodeURIComponent(`:root {\n${variables}\n}\n\n${styleHeight}\n\n${css}`);
    chrome.action.setPopup({ popup: `popup.html?css=${encoded}` });
    getPopup().then((popup) => {
      if (popup) {
        chrome.windows.remove(popup.windowId);
      }
    });
  });
}

export function setWindowMode() {
  chrome.action.onClicked.addListener(async (tab) => {
    const { settings, options } = await getLocal('settings', 'options');
    if (!options.windowMode) {
      return;
    }
    const popup = await getPopup();
    if (popup) {
      chrome.windows.update(popup.windowId, { focused: true });
      return;
    }
    const variables = makeThemeCss(options.colorPalette);
    const encoded = encodeURIComponent(`:root {\n${variables}\n}\n\n${options.css}`);
    chrome.windows.create({
      url: `popup.html?css=${encoded}`,
      type: 'popup',
      width: settings.windowWidth,
      height: settings.windowHeight,
      top: settings.windowTop,
      left: settings.windowLeft,
    });
    setLocal({ currentWindowId: tab.windowId });
  });
}

export async function makeColorPalette() {
  const palettes: ColorPalette[] = await fetch('./color-palette1.json').then((resp) => resp.json());
  const base = palettes
    .map(addColorSpec)
    .map((palette) => [...palette].sort((x, y) => x.vivid - y.vivid))
    .map(([a, b, c, d, e]) => [a, b, c, d].sort((x, y) => x.chroma - y.chroma).concat(e))
    .map(([p, cl, cm, cr, m]) => {
      if (cl.whiteness <= lightColorWhiteness) {
        return (cm.whiteness > lightColorWhiteness) ? [p, cm, cl, cr, m] : [p, cr, cl, cm, m];
      }
      return [p, cl, cm, cr, m];
    });

  const others = base.filter(
    ([paneBg, frameBg]) => (
      paneBg.whiteness <= lightColorWhiteness && frameBg.whiteness > lightColorWhiteness
    )
    || (
      paneBg.whiteness > lightColorWhiteness && frameBg.whiteness <= lightColorWhiteness
    ),
  );

  const mixThemes = recombiPalette(others, 100);
  const other = getColorPaletteHTML(mixThemes);

  const dark1 = base.filter(
    ([paneBg, frameBg]) => paneBg.whiteness <= lightColorWhiteness
      && frameBg.whiteness <= lightColorWhiteness,
  );

  const lightTheme = base
    .concat([...dark1, ...others].map(
      (palette) => palette.concat().sort((a, b) => b.whiteness - a.whiteness),
    ))
    .filter(([paneBg]) => paneBg.whiteness > lightColorWhiteness)
    .filter(([, frameBg]) => frameBg.whiteness > lightColorWhiteness);

  const darkOrVivid = [...others, ...lightTheme]
    .map((palette) => palette.concat().sort((a, b) => a.whiteness - b.whiteness))
    .filter(
      ([paneBg, frameBg]) => paneBg.whiteness <= lightColorWhiteness
      && frameBg.whiteness <= lightColorWhiteness,
    )
    .concat(dark1);

  const darkThemes = recombiPaletteDark(darkOrVivid, 100);
  const dark = getColorPaletteHTML(darkThemes);

  const lightThemesAndDefault = [
    addColorSpec(['FFFFFF', 'E8E8E9', 'CCE5FF', 'F6F6F6', '1DA1F2']),
    ...recombiPalette(lightTheme, 80),
  ];
  const light = getColorPaletteHTML(lightThemesAndDefault);

  return {
    html: { light, dark, other },
    palettes: { light: lightThemesAndDefault, dark: darkThemes, other: mixThemes },
  };
}

export function getChromeId(preId: number | string) {
  const [id] = /\d+/.exec(preId as string) || [];
  return Number(id);
}

type getRecentlyClosed = () => Promise<chrome.sessions.Session[]>;

export function getHistoryData(maxResults = 99999) {
  const startTime = Date.now() - pastMSec;
  const histories = chrome.history.search({ text: '', startTime, maxResults });
  const sessions = (chrome.sessions.getRecentlyClosed as getRecentlyClosed)();
  return [histories, sessions] as const;
}

export async function getHistoryDataByWorker() {
  const worker = new Worker('./worker-history.js');
  Promise.all(getHistoryData()).then(([histories, sessions]) => {
    worker.postMessage([histories, sessions]);
  });
  return new Promise<MyHistoryItem[]>((resolve) => {
    worker.onmessage = (event) => {
      resolve(event.data);
      worker.terminate();
    };
  });
}

export async function getTabInfo(preId: number | string) {
  return chrome.windows.getCurrent().then((currentWindow) => chrome.tabs.get(getChromeId(preId))
    .then((tab) => chrome.windows.get(tab.windowId, { populate: true })
      .then((win) => ({
        ...tab,
        isCurrentWindow: tab.windowId === currentWindow.id,
        incognito: win.incognito,
      }))));
}

const timeFormatter = new Intl.DateTimeFormat([], { timeStyle: 'short' });

export function getShortTime(dt: Date) {
  return timeFormatter.format(dt);
}

export const messages = {
  cantSelectMultiple: 'Can\'t select multiple recently closed tab.',
};

export function getNextIndex(length: number, currentIndex: number, isPrevious: boolean) {
  return when(isPrevious && currentIndex === 0)
    .then(length - 1)
    .when(!isPrevious && currentIndex === length - 1)
    .then(0)
    .else(isPrevious ? currentIndex - 1 : currentIndex + 1);
}

export function decodeUrl(url?: string) {
  try {
    return decodeURIComponent((url || '').substring(0, 1024));
  } catch {
    return (url || '').substring(0, 1024);
  }
}

export function addQueryHistory() {
  getLocal('lastSearchWord', 'queries').then(({ lastSearchWord, ...rest }) => {
    if (!lastSearchWord) {
      return;
    }
    const queries = [
      lastSearchWord,
      ...(rest.queries || [])
        .filter((el) => el.localeCompare(lastSearchWord, undefined, { sensitivity: 'accent' }) !== 0)
        .slice(0, 200),
    ];
    setLocal({ queries });
  });
}

export const chromeEventFilter = { windowTypes: ['normal', 'app'] } as chrome.windows.WindowEventFilter;
