import addHeadersHistory from './add-headers-history';

onmessage = (e) => postMessage(addHeadersHistory(e.data));
