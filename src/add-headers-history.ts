import { MyHistoryItem } from './types';

export default function addHeadersHistory(
  [historyItems, sessions]: [chrome.history.HistoryItem[], chrome.sessions.Session[]],
) {
  const sessionsToHistories = sessions.reduce(
    (acc, { window, tab, lastModified }) => {
      if (window) {
        return [...acc, ...window.tabs?.map(({ url, title, sessionId }) => ({
          url, title, sessionId, lastVisitTime: lastModified * 1000, id: '',
        })) || []];
      }
      const { url, title, sessionId } = tab!;
      return [...acc, {
        url, sessionId, title, lastVisitTime: lastModified * 1000, id: '',
      }];
    },
    [] as (chrome.history.HistoryItem & { sessionId?: string | undefined })[],
  );
  const sorted = sessionsToHistories.concat(historyItems)
    .sort((a, b) => b.lastVisitTime! - a.lastVisitTime!);
  const histories = [] as MyHistoryItem[];
  for (let i = 0, prevLastVisitDate = ''; i < sorted.length; i += 1) {
    const { url, ...rest } = sorted[i];
    const item = { ...rest, url: url?.substring(0, 1024) };
    const lastVisitDate = (new Date(rest.lastVisitTime!)).toLocaleDateString();
    if (prevLastVisitDate === lastVisitDate || !prevLastVisitDate) {
      histories.push(item);
    } else {
      histories.push({ headerDate: true, lastVisitTime: rest.lastVisitTime }, item);
    }
    prevLastVisitDate = lastVisitDate;
  }
  return histories;
}
