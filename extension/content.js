const PAGE_SOURCE = 'hourglass-importer';
const EXTENSION_SOURCE = 'hourglass-importer-extension';

function postToPage(type, data) {
  window.postMessage({ source: EXTENSION_SOURCE, type, ...data }, window.location.origin);
}

async function announceState() {
  const { active } = await chrome.runtime.sendMessage({ action: 'state' });
  postToPage('state', { active, version: chrome.runtime.getManifest().version });
}

window.addEventListener('message', async event => {
  if (event.source !== window || event.data?.source !== PAGE_SOURCE) return;
  if (event.data.type === 'ping') return announceState();
  if (event.data.type === 'sync') {
    const result = await chrome.runtime.sendMessage({ action: 'sync', force: Boolean(event.data.force) });
    postToPage('result', result);
  }
});

chrome.storage.onChanged.addListener(changes => {
  if ('active' in changes) postToPage('state', { active: changes.active.newValue, version: chrome.runtime.getManifest().version });
});

announceState();
