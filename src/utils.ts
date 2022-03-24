/* eslint-disable no-redeclare */

import {
  PayloadAction,
  MapStateToResponse,
  MessageStateMapObject,
  State,
  MyHistoryItem,
  SplitterClasses,
} from './types';

export function $<T extends HTMLElement>(
  selector: string,
  parent: HTMLElement | DocumentFragment | Document = document,
) {
  return parent.querySelector(selector) as T | null;
}

export function $$<T extends HTMLElement>(
  selector: string,
  parent: HTMLElement | DocumentFragment | Document = document,
) {
  return [...parent.querySelectorAll(selector)] as Array<T>;
}

type AnyFunction = (...p: any[]) => any;

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
      else: (elseValueOrFunction: T) => {
        if (test) {
          return whenGetter<T>(valueOrFunction);
        }
        return whenGetter<T>(elseValueOrFunction);
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

function caseConst<T>(a: T) {
  return {
    case: () => thenConst<T>(a),
    else: () => a,
  };
}

function caseGetter<T, U>(value: T) {
  return {
    case: (testValue: T) => ({
      then: (thenValue: U) => {
        if (value === testValue) {
          return caseConst<U>(thenValue);
        }
        return caseGetter<T, U>(value);
      },
    }),
  };
}

export function cases<T, U>(value: T) {
  return caseGetter<T, U>(value);
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

export function tap<T>(f: (a: T) => any) {
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

type Last<T extends Array<any>> = T[Exclude<keyof T, keyof Tail<T>>];

export function last<T extends Array<any>>(args: T) {
  return args.at(-1) as Last<T>;
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

export async function cbToResolve<T>(f: (cb: (value: T | PromiseLike<T>) => void) => any) {
  return new Promise<T>((resolve) => {
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
): (...a: T) => R10;

export function pipe(fn: any, ...fns: Array<any>) {
  return (...values: any) => fns.reduce((prevValue, nextFn) => nextFn(prevValue), fn(...values));
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
): (a: Promise<T>) => Promise<R4>;
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

export function pipeP(...fns: Array<any>) {
  return (p1: Promise<any>) => {
    fns.reduce((prevPromise, nextFn) => prevPromise.then(nextFn), p1);
  };
}

export function pick<U extends Array<string>>(...props: U): <T>(target: T) =>
  Pick<T, U[number] extends keyof T ? U[number] : never[number]>;
export function pick(...props: any) {
  return (target: any) => props
    .reduce((acc: any, key: any) => ({ ...acc, [key]: target[key] }), {});
}

// eslint-disable-next-line no-undef
type EventListener<K extends keyof HTMLElementEventMap, T extends HTMLElement> = (
  this: T,
  // eslint-disable-next-line no-undef
  ev: HTMLElementEventMap[K]
) => any;

type EventListenerMap<T extends HTMLElement = HTMLElement> = {
  // eslint-disable-next-line no-undef
  [K in keyof Partial<HTMLElementEventMap>]: EventListener<K, T>
}

type EventListeners<
  // eslint-disable-next-line no-undef
  K extends keyof HTMLElementEventMap,
  T extends HTMLElement
> = [K, EventListener<K, T>];

export function setEvents<T extends HTMLElement>(
  htmlElements: Array<T>,
  eventListeners: EventListenerMap<T>,
  // eslint-disable-next-line no-undef
  options?: boolean | AddEventListenerOptions,
) {
  const itrEventListeners = Object.entries(eventListeners) as
    EventListeners<keyof typeof eventListeners, T>[];
  itrEventListeners.forEach(([eventType, listener]) => {
    htmlElements.forEach((htmlElement) => {
      htmlElement.addEventListener(eventType, listener, options);
    });
  });
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

export async function postMessage<T extends keyof MapStateToResponse>(
  msg: { type: T } & Partial<PayloadAction<MessageStateMapObject<MapStateToResponse>[T]>>,
): Promise<ReturnType<MapStateToResponse[T]>> {
  return cbToResolve(curry(sendMessage)(msg));
}

export function cssid(id: string | number) {
  return `#${CSS.escape(id as string)}`;
}

export function whichClass<T extends ReadonlyArray<string>>(classNames: T, element: HTMLElement) {
  return classNames.find((name) => element.classList.contains(name)) as T[number] | undefined;
}

export function addRules(selector: string, ruleProps: [string, string][]) {
  const rules = ruleProps.map(([prop, value]) => `${prop}:${value};`).join('');
  const [sheet] = document.styleSheets;
  sheet.insertRule(`${selector} {${rules}}`, sheet.cssRules.length);
}

export function prop<T, U extends keyof T>(name: U): (target: T) => T[U];
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

// for V3
// const faviconUrl = chrome.runtime.getURL('_favicon');

export function makeStyleIcon(url?: string) {
  return url ? `background-image: url('chrome://favicon/${url}');` : '';
  // return `background-image: url('${faviconUrl}/?page_url=${url}')`;
}

export function showMenu($target: HTMLElement, menuSelector: string) {
  const $menu = $(menuSelector)!;
  $menu.style.top = '';
  $menu.style.left = '';
  if ($target.parentElement !== $menu.parentElement) {
    $target.insertAdjacentElement('afterend', $menu);
  }
  const rect = $target.getBoundingClientRect();
  const { width, height } = $menu.getBoundingClientRect();
  $menu.style.left = `${rect.left - width + rect.width}px`;
  if ((rect.top + rect.height + height) >= (document.body.offsetHeight + 4)) {
    $menu.style.top = `${rect.top - height}px`;
  } else {
    $menu.style.top = `${rect.top + rect.height}px`;
  }
}

export function regsterChromeEvents(listener: Function) {
  return (events: chrome.events.Event<any>[]) => events.forEach((e) => e.addListener(listener));
}

const escapes = new Map();
escapes.set('&', '&amp;');
escapes.set('"', '&quot;');
escapes.set('<', '&lt;');
escapes.set('>', '&gt;');

export function htmlEscape(text: string) {
  return text!.replace(/[&"<>]/g, (e) => escapes.get(e));
}

export function makeHistoryRow({
  url, title, lastVisitTime, headerDate, lastVisitDate,
}: MyHistoryItem) {
  if (headerDate) {
    return `<div class="header-date">${lastVisitDate}</div>`;
  }
  const dt = lastVisitTime ? `\n${(new Date(lastVisitTime)).toLocaleString()}` : '';
  const style = makeStyleIcon(url!);
  const text = title || url;
  if (!text) {
    return '';
  }
  return `<div title="${title}${dt}" style="${style}">${htmlEscape(text)}</div>`;
}

export function setStorage(state: Partial<State>) {
  chrome.storage.local.set(state);
}

export async function getStorage<T extends Array<keyof State>>(...keyNames: T) {
  return new Promise<Pick<State, T[number]>>((resolve) => {
    chrome.storage.local.get(keyNames, (data) => resolve(data as Pick<State, T[number]>));
  });
}

export function getGridTemplateColumns(newPaneWidth: Partial<SplitterClasses>) {
  const $target = $('main')!;
  const { gridTemplateColumns } = $target.style;
  const [, ...widths] = /^.+?(\d+?)px.+?(\d+?)px.+?(\d+?)px/.exec(gridTemplateColumns) || [];
  const [pane3, pane2, pane1] = widths.map(Number);
  const paneWidths = { pane3, pane2, pane1 };
  const newPaneWidths = { ...paneWidths, ...newPaneWidth };
  const gridCols = [
    'min-content',
    `${newPaneWidths.pane3}px`,
    'min-content',
    `${newPaneWidths.pane2}px`,
    'min-content',
    `${newPaneWidths.pane1}px`,
    'min-content',
    '1fr',
  ];
  return {
    result: gridCols.join(' '),
    pane3,
    pane2,
    pane1,
  };
}

export function setSplitWidth(newPaneWidth: Partial<SplitterClasses>) {
  const $target = $('main')!;
  const { result } = getGridTemplateColumns(newPaneWidth);
  $target.style.setProperty('grid-template-columns', result);
}
