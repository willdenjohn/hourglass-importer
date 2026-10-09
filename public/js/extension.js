import { update } from './state.js';

const PAGE_SOURCE = 'hourglass-importer';
const EXTENSION_SOURCE = 'hourglass-importer-extension';
const DETECTION_TIME = 600;
const RESPONSE_TIME = 10000;

let waitingForResult = null;

function post(type, data = {}) {
  window.postMessage({ source: PAGE_SOURCE, type, ...data }, window.location.origin);
}

window.addEventListener('message', event => {
  if (event.source !== window || event.data?.source !== EXTENSION_SOURCE) return;
  if (event.data.type === 'state') update({ extension: { present: true, active: event.data.active, version: event.data.version } });
  if (event.data.type === 'result' && waitingForResult) {
    waitingForResult(event.data);
    waitingForResult = null;
  }
});

export function detectExtension() {
  post('ping');
  return new Promise(resolve => setTimeout(resolve, DETECTION_TIME));
}

export function requestSession({ force = false } = {}) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      waitingForResult = null;
      resolve({ ok: false, reason: 'no_response' });
    }, RESPONSE_TIME);
    waitingForResult = result => {
      clearTimeout(timeout);
      resolve(result);
    };
    post('sync', { force });
  });
}
