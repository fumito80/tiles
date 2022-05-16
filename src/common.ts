/* eslint-disable no-redeclare */

import {
  PayloadAction,
  MapMessagesPtoB,
  MapMessagesBtoP,
  MessageTypePayloadAction,
  State,
  SplitterClasses,
  MyHistoryItem,
  Model,
} from './types';

export const aDayMSec = 1000 * 60 * 60 * 24;

type AnyFunction = (...p: any[]) => any;

// DOM operation

export function $<T extends HTMLElement>(
  selector: string | null = null,
  parent: HTMLElement | DocumentFragment | Document | Element = document,
) {
  return parent.querySelector<T>(selector!);
}

export function $$<T extends HTMLElement>(
  selector: string,
  parent: HTMLElement | DocumentFragment | Document = document,
) {
  return [...parent.querySelectorAll(selector)] as Array<T>;
}

export function $byClass<T extends HTMLElement>(
  className: string | null,
  parent: HTMLElement | Document = document,
) {
  return parent.getElementsByClassName(className!)[0] as T;
}

export function $byId<T extends HTMLElement>(
  id: string,
) {
  return document.getElementById(id) as T;
}

export function $$byClass<T extends HTMLElement>(
  className: string,
  parent: HTMLElement | Document = document,
) {
  return [...parent.getElementsByClassName(className)] as Array<T>;
}

export function $byTag<T extends HTMLElement>(
  tagName: string,
  parent: HTMLElement | Document = document,
) {
  return parent.getElementsByTagName(tagName)[0] as T;
}

export function $$byTag<T extends HTMLElement>(
  tagName: string,
  parent: HTMLElement | Document = document,
) {
  return [...parent.getElementsByTagName(tagName)] as Array<T>;
}

export function addChild<T extends Element | null>($child: T) {
  return <U extends Element | null>($parent: U) => {
    if ($parent && $child) {
      $parent.appendChild($child);
    }
    return $child;
  };
}

export function addStyle(styleName: string, value: string) {
  return <T extends Element | null>($el: T) => {
    ($el as unknown as HTMLElement)?.style?.setProperty(styleName, value);
    return $el;
  };
}

export function rmStyle(styleName: string) {
  return <T extends Element | null>($el: T) => {
    ($el as unknown as HTMLElement)?.style?.removeProperty(styleName);
    return $el;
  };
}

export function addAttr(attrName: string, value: string) {
  return <T extends Element | null>($el: T) => {
    $el?.setAttribute(attrName, value);
    return $el;
  };
}

export function rmAttr(attrName: string) {
  return <T extends Element | null>($el: T) => {
    $el?.removeAttribute(attrName);
    return $el;
  };
}

export function addClass(...classNames: string[]) {
  return <T extends Element | null>($el: T) => {
    $el?.classList.add(...classNames);
    return $el;
  };
}

export function rmClass(...classNames: string[]) {
  return <T extends Element | null>($el: T) => {
    $el?.classList.remove(...classNames);
    return $el;
  };
}

export function setHTML(html: string) {
  return <T extends Element | null>($el: T) => {
    if ($el) {
      // eslint-disable-next-line no-param-reassign
      $el.innerHTML = html;
    }
    return $el;
  };
}

export function setText(text: string | null) {
  return <T extends Element | null>($el: T) => {
    if ($el) {
      // eslint-disable-next-line no-param-reassign
      $el.textContent = text;
    }
    return $el;
  };
}

// eslint-disable-next-line no-undef
export function insertHTML(position: InsertPosition, html: string) {
  return <T extends Element>($el: T) => {
    // eslint-disable-next-line no-param-reassign
    $el.insertAdjacentHTML(position, html);
    return $el;
  };
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

// eslint-disable-next-line no-undef
export function addListener<T extends keyof HTMLElementEventMap>(
  type: T,
  // eslint-disable-next-line no-undef
  ev: (e: HTMLElementEventMap[T]) => any,
  // eslint-disable-next-line no-undef
  options?: boolean | AddEventListenerOptions,
) {
  return <U extends Element | null>(element: U) => {
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

// export function decode<T, U>(
//   switchValue: T,
//   ...matchPairs: Array<[caseValue: T, returnValue: U]>
// ) {
//   const [, returnValue = null] =
// matchPairs.find(([caseValue]) => caseValue === switchValue) || [];
//   return returnValue;
// }

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

export function addRules(selector: string, ruleProps: [string, string][]) {
  const rules = ruleProps.map(([prop, value]) => `${prop}:${value};`).join('');
  const [sheet] = document.styleSheets;
  sheet.insertRule(`${selector} {${rules}}`, sheet.cssRules.length);
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

// for V3
// const faviconUrl = chrome.runtime.getURL('_favicon');

export function makeStyleIcon(url?: string) {
  return url ? `background-image: url('chrome://favicon/${url}');` : '';
  // return `background-image: url('${faviconUrl}/?page_url=${url}')`;
}

export function showMenu($target: HTMLElement, menuSelector: string) {
  const $menu = $(menuSelector)!;
  pipe(addStyle('top', ''), addStyle('left', ''))($menu);
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

export function getSync<T extends Array<keyof State>>(...keyNames: T) {
  return getStorage(chrome.storage.sync, ...keyNames);
}

export function getGridTemplateColumns() {
  const [pane3, pane2, pane1] = $$byClass('pane-body')
    .map((el) => el.style.getPropertyValue('width'))
    .map((n) => Number.parseInt(n, 10));
  return {
    pane1,
    pane2,
    pane3,
  };
}

async function checkSplitWidth(pane1: number, pane2: number, pane3: number) {
  if (document.body.offsetWidth >= (pane1 + pane2 + pane3 + 132)) {
    return true;
  }
  const width = 800;
  const paneWidth = { pane1: 200, pane2: 200, pane3: 200 };
  addRules('body', [['width', `${width}px`]]);
  // eslint-disable-next-line no-use-before-define
  setSplitWidth(paneWidth);
  const saved = await getLocal('settings');
  const settings = {
    ...saved.settings,
    width,
    paneWidth,
  };
  setLocal({ settings });
  return false;
}

export async function setSplitWidth(newPaneWidth: Partial<SplitterClasses>) {
  const { pane1, pane2, pane3 } = { ...getGridTemplateColumns(), ...newPaneWidth };
  if (!await checkSplitWidth(pane1, pane2, pane3)) {
    return;
  }
  const $bodies = $$byClass('pane-body');
  [pane3, pane2, pane1].forEach((width, i) => addStyle('width', `${width}px`)($bodies[i]));
}

export async function bootstrap<T extends Array<keyof State>>(...storageKeys: T) {
  const result = getLocal(...storageKeys);
  if (document.readyState === 'loading') {
    await cbToResolve(curry(document.addEventListener)('DOMContentLoaded'));
  }
  return result;
}

export function getKeys<T>(object: T) {
  return Object.keys(object) as unknown as Array<keyof T>;
}

export function extractUrl(faviconUrl?: string) {
  const [, url = ''] = /^url\("chrome:\/\/favicon\/(.*)"\)$/.exec(faviconUrl || '') || [];
  return url;
}

export function extractDomain(url?: string) {
  const [, domain = ''] = /^\w+?:\/\/([\s\S]+?)(\/|$)/.exec(url || '') || [];
  return domain;
}

export async function getHistoryById(historyId: string): Promise<MyHistoryItem> {
  const [, id] = historyId.split('-');
  const { histories } = await getLocal('histories');
  return histories.find(propEq('id', id))!;
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
  return (iMax - iMin) / iMax;
}

export const lightColorWhiteness = 0.6;

export function getColorWhiteness(colorCode: string) {
  const [r, g, b] = getRGB(colorCode);
  // return Math.max((r * g) / (0xFF * 0xFF), (g * b) / (0xFF * 0xFF));
  return Math.max(
    ((r || 1) * (g || 1) * (b || 1)) / (0xFF * 0xFF * 0xFF),
    (g * b) / (0xFF * 0xFF),
    (r * b) / (0xFF * 0xFF),
    (r * g) / (0xFF * 0xFF),
  );
  // return Math.max(r, g, b) / 0xFF;
}

const escapes = new Map();
escapes.set('&', '&amp;');
escapes.set('"', '&quot;');
escapes.set('<', '&lt;');
escapes.set('>', '&gt;');

export function htmlEscape(text: string) {
  return text!.replace(/[&"<>]/g, (e) => escapes.get(e));
}

export function removeUrlHistory(url: string, lastVisitTime: number = -1) {
  return (data: Pick<State, 'histories'> | State['histories']) => {
    const { histories } = Array.isArray(data) ? { histories: data } : data;
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

export function setMessageListener<T extends Model>(messageMap: T, once = false) {
  async function onMessage(
    message: { type: keyof T } & PayloadAction<any>,
    _: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) {
    // eslint-disable-next-line no-console
    // console.log(message);
    const responseState = await messageMap[message.type](message);
    sendResponse(responseState);
    if (once) {
      chrome.runtime.onMessage.removeListener(onMessage);
    }
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
