import { MyHistoryItem } from './types';
import {
  pipe, getLocaleDate, htmlEscape, preFaviconUrl, cssEscape,
} from './common';
import {
  $, addStyle, addAttr, setHTML, rmClass, setText, rmStyle, addClass, rmAttr, toggleClass,
} from './client';

const invisible = { transform: 'translateY(-10000px)' };

export function rowSetterHistory(isShowFixedHeader: boolean) {
  const today = getLocaleDate();
  const $currentDate = $('.histories .current-date')!;
  addStyle(invisible)($currentDate);
  return (
    data: MyHistoryItem[],
    rowTop: number,
    dataTop: number,
  ) => ($row: HTMLElement, index: number) => {
    if (index === 0) {
      if (isShowFixedHeader) {
        rmStyle('transform')($currentDate);
      }
      return;
    }
    const item = data[dataTop + index - 1];
    if (!item) {
      addStyle(invisible)($row);
      return;
    }
    const {
      url, title, lastVisitTime, headerDate, id, selected, isSession, sessionWindow,
    } = item;
    if (index === 1) {
      const lastVisitDate = getLocaleDate(lastVisitTime);
      const currentDate = today === lastVisitDate ? '' : lastVisitDate!;
      setText(currentDate)($currentDate);
      addAttr('data-value', currentDate)($currentDate);
      if (headerDate && rowTop !== 0 && isShowFixedHeader) {
        addStyle(invisible)($row);
        return;
      }
    }
    const transform = `translateY(${rowTop}px)`;
    addStyle({ transform })($row);
    if (headerDate) {
      if (index === 2 && isShowFixedHeader) {
        addStyle({ transform })($currentDate);
      }
      pipe(
        rmClass('selected', 'session'),
        setHTML(getLocaleDate(lastVisitTime)!),
        rmStyle('background-image'),
        addClass('header-date'),
        rmAttr('title'),
        rmAttr('id'),
      )($row);
      return;
    }
    // const elementId = isSession ? `session-${id}` : `hst-${id}`;
    // const text = title || url;
    const pageUrl = (!url || url.startsWith('data')) ? 'none' : cssEscape(url);
    const backgroundImageUrl = `url(${preFaviconUrl}${pageUrl})`;
    const {
      elementId, text, isSessionWindow, isSessionTab, backgroundImage,
    } = isSession
      ? {
        elementId: `session-${id}`,
        text: `${sessionWindow ? `${sessionWindow.length} tabs` : title || url}`,
        isSessionWindow: !!sessionWindow,
        isSessionTab: !sessionWindow,
        backgroundImage: sessionWindow ? 'none' : backgroundImageUrl,
      }
      : {
        elementId: `hst-${id}`,
        text: title || url,
        isSessionWindow: false,
        isSessionTab: false,
        backgroundImage: backgroundImageUrl,
      };
    const tooltip = `${text}\n${(new Date(lastVisitTime!)).toLocaleString()}\n${url}`;
    pipe(
      toggleClass('session-window', isSessionWindow),
      toggleClass('session-tab', isSessionTab),
      toggleClass('selected', !!selected),
      rmClass('hilite-fast', 'header-date'),
      setHTML(`<div class="history-title">${htmlEscape(text!)}</div><i class="icon-x"></i>`),
      addStyle('background-image', backgroundImage),
      addAttr('title', htmlEscape(tooltip)),
      addAttr('id', elementId),
    )($row);
  };
}

export type VScrollRowSetter = typeof rowSetterHistory;
