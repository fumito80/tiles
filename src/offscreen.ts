import { getImageData } from './draw-svg';

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type !== 'getImageData') {
    return false;
  }
  getImageData(message.svg)
    .then(({ data, width }) => ({ data: Array.from(data), width }))
    .then(sendResponse);
  return true;
});
