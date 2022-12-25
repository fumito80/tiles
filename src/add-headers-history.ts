import { MyHistoryItem } from './types';

export default function addHeadersHistory(historyItems: chrome.history.HistoryItem[]) {
  const sorted = historyItems.sort((a, b) => b.lastVisitTime! - a.lastVisitTime!);
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
