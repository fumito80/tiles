import { getImageData } from './draw-svg';

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type === 'getImageData') {
    getImageData(message.svg)
      .then(({ data, width }) => ({ data, width }))
      .then(sendResponse);
    return true;
  }
  return false;
});
