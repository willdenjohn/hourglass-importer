const HOURGLASS = 'https://app.hourglass-app.com';
const IMPORTER = 'http://localhost:3434';
const SESSION_COOKIE = 'hglogin';
const XSRF_COOKIE = 'X-Hourglass-XSRF-Token';
const DEFAULTS = { active: true, lastSync: null };

async function readSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function updateBadge() {
  const { active } = await readSettings();
  await chrome.action.setBadgeText({ text: active ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: active ? '#2b8a3e' : '#868e96' });
  await chrome.action.setTitle({ title: chrome.i18n.getMessage(active ? 'titleActive' : 'titleInactive') });
}

function expiration(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function readCookies() {
  const [session, xsrf] = await Promise.all([
    chrome.cookies.get({ url: HOURGLASS, name: SESSION_COOKIE }),
    chrome.cookies.get({ url: HOURGLASS, name: XSRF_COOKIE }),
  ]);
  if (!session?.value || !xsrf?.value) return null;
  return { hglogin: session.value, xsrf: decodeURIComponent(xsrf.value) };
}

async function importerState() {
  try {
    const response = await fetch(`${IMPORTER}/api/session`, { cache: 'no-store' });
    return { running: true, ...(await response.json()) };
  } catch {
    return { running: false };
  }
}

async function record(result) {
  await chrome.storage.local.set({ lastSync: { ...result, at: Date.now() } });
  return result;
}

async function sync({ force = false } = {}) {
  const { active } = await readSettings();
  if (!active) return { ok: false, reason: 'disabled' };

  const importer = await importerState();
  if (!importer.running) return record({ ok: false, reason: 'importer_offline' });
  if (importer.valid && !force) return record({ ok: true, reason: 'already_valid' });

  const cookies = await readCookies();
  if (!cookies) return record({ ok: false, reason: 'not_logged_in' });
  const expires = expiration(cookies.hglogin);
  if (expires && expires < Date.now()) return record({ ok: false, reason: 'expired' });

  try {
    const response = await fetch(`${IMPORTER}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cookies),
    });
    return record({ ok: response.ok, reason: response.ok ? 'sent' : 'rejected' });
  } catch {
    return record({ ok: false, reason: 'failed' });
  }
}

async function diagnostics() {
  const [settings, cookies, importer] = await Promise.all([readSettings(), readCookies(), importerState()]);
  return {
    ...settings,
    hourglassLoggedIn: Boolean(cookies),
    hourglassExpires: cookies ? expiration(cookies.hglogin) : null,
    importerRunning: importer.running,
    importerConnected: Boolean(importer.valid),
  };
}

async function setActive(active) {
  await chrome.storage.local.set({ active });
  await updateBadge();
  return diagnostics();
}

const ACTIONS = {
  sync: message => sync({ force: Boolean(message.force) }),
  diagnostics: () => diagnostics(),
  setActive: message => setActive(Boolean(message.active)),
  state: () => readSettings(),
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const action = ACTIONS[message?.action];
  if (!action) return false;
  action(message).then(respond, () => respond({ ok: false, reason: 'failed' }));
  return true;
});

chrome.storage.onChanged.addListener(changes => {
  if ('active' in changes) updateBadge();
});

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
