const message = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);

const elements = {
  badge: document.getElementById('badge'),
  hourglass: document.getElementById('hourglass-state'),
  importer: document.getElementById('importer-state'),
  lastSync: document.getElementById('last-sync'),
  sync: document.getElementById('sync-button'),
  toggle: document.getElementById('toggle-button'),
};

function translatePage() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = message(element.dataset.i18n); });
}

function formatTime(milliseconds) {
  return new Date(milliseconds).toLocaleString(chrome.i18n.getUILanguage(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function write(element, text, className = '') {
  element.textContent = text;
  element.className = className;
}

function hourglassText(state) {
  if (!state.hourglassLoggedIn) return [message('notLoggedIn'), 'error'];
  if (state.hourglassExpires && state.hourglassExpires < Date.now()) return [message('loginExpired'), 'error'];
  return [state.hourglassExpires ? message('loggedInUntil', [formatTime(state.hourglassExpires)]) : message('loggedIn'), 'ok'];
}

function importerText(state) {
  if (!state.importerRunning) return [message('importerClosed'), 'error'];
  return state.importerConnected ? [message('importerConnected'), 'ok'] : [message('importerWaiting'), 'error'];
}

function lastSyncText(lastSync) {
  if (!lastSync) return [message('neverSynced'), ''];
  return [`${formatTime(lastSync.at)} — ${message(`reason_${lastSync.reason}`)}`, lastSync.ok ? 'ok' : 'error'];
}

function render(state) {
  elements.badge.textContent = message(state.active ? 'badgeActive' : 'badgeInactive');
  elements.badge.className = `badge ${state.active ? 'badge--active' : 'badge--inactive'}`;
  write(elements.hourglass, ...hourglassText(state));
  write(elements.importer, ...importerText(state));
  write(elements.lastSync, ...lastSyncText(state.lastSync));
  elements.toggle.textContent = message(state.active ? 'turnOff' : 'turnOn');
  elements.toggle.className = `button${state.active ? ' button--danger' : ''}`;
  elements.sync.disabled = !state.active;
}

async function refresh() {
  render(await chrome.runtime.sendMessage({ action: 'diagnostics' }));
}

elements.sync.addEventListener('click', async () => {
  elements.sync.disabled = true;
  elements.sync.textContent = message('syncing');
  await chrome.runtime.sendMessage({ action: 'sync', force: true });
  elements.sync.textContent = message('syncNow');
  await refresh();
});

elements.toggle.addEventListener('click', async () => {
  const { active } = await chrome.runtime.sendMessage({ action: 'state' });
  render(await chrome.runtime.sendMessage({ action: 'setActive', active: !active }));
});

translatePage();
refresh();
