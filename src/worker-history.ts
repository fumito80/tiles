import { MyHistoryItem } from './types';

export default function miningHistoryData(HistoryItems: chrome.history.HistoryItem[]) {
  const [histories] = HistoryItems
    .sort((a, b) => Math.sign(b.lastVisitTime! - a.lastVisitTime!))
    .reduce<[MyHistoryItem[], string | undefined]>(([data, prevLastVisitDate], item) => {
      const lastVisitDate = (new Date(item.lastVisitTime!)).toLocaleDateString();
      if (prevLastVisitDate === lastVisitDate || !prevLastVisitDate) {
        return [[...data, item], lastVisitDate];
      }
      return [
        [...data, { headerDate: true, lastVisitTime: item.lastVisitTime }, item],
        lastVisitDate,
      ];
    }, [[], undefined] as unknown as [MyHistoryItem[], string | undefined]);
  return histories;
}

onmessage = async (e) => {
  const histories = miningHistoryData(e.data);
  postMessage(histories);
};
