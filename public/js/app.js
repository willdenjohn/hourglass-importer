import { api, setSessionRenewal } from './api.js';
import { state, update, observe } from './state.js';
import { formatDate, notify, options } from './dom.js';
import { t, LANGUAGES, setLanguage, initialLanguage, currentLanguage, translateStatic } from './i18n.js';
import { createSessionView } from './components/session.js';
import { createImportView } from './components/import.js';
import { createReviewView, loadPublishers } from './components/review.js';
import { createMissingView } from './components/missing.js';
import { createMonthPicker } from './components/monthPicker.js';
import { detectExtension, requestSession } from './extension.js';

const tabs = [...document.querySelectorAll('.tab')];
const panel = name => document.getElementById(`panel-${name}`);
const sessionBadge = document.getElementById('session-badge');
const subtitle = document.getElementById('subtitle');
const languageSelect = document.getElementById('language-select');
const TAB_KEYS = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
let periodChosen = false;
let currentTab = 'session';

const views = {
  session: createSessionView(panel('session'), connectThroughExtension),
  import: createImportView(panel('import'), goTo),
  review: createReviewView(panel('review'), goTo),
  missing: createMissingView(panel('missing')),
};

const monthPicker = createMonthPicker(document.getElementById('month-picker'), period => {
  periodChosen = true;
  update({ period, items: [], withoutAnswer: [] });
  if (state.session?.valid) openSavedReview().then(found => found && views[currentTab].render());
});

function goTo(name) {
  currentTab = name;
  tabs.forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  Object.keys(views).forEach(key => { panel(key).hidden = key !== name; });
  views[name].render();
  if (name === 'missing') views.missing.load();
  window.scrollTo(0, 0);
}

function renderSessionBadge(session) {
  if (!session) return;
  sessionBadge.className = `badge ${session.valid ? 'badge--success' : 'badge--danger'}`;
  sessionBadge.textContent = session.valid
    ? `${t('header.connected')}${session.expires ? ` · ${t('header.until', { date: formatDate(session.expires) })}` : ''}`
    : t('header.disconnected');
}

function renderSubtitle() {
  subtitle.textContent = [t('app.subtitle'), state.session?.account?.congregation?.name].filter(Boolean).join(' · ');
}

function applyAccount(account) {
  renderSubtitle();
  if (!account) return;
  monthPicker.setOpenMonth(account.openMonth);
  monthPicker.setLastSubmitted(account.lastSubmittedMonth);
  if (periodChosen || !account.openMonth) return;
  const [year, month] = account.openMonth.split('-').map(Number);
  monthPicker.set({ month, year });
  update({ period: { month, year } });
}

async function openSavedReview() {
  try {
    const { items } = await api.review(state.period);
    update({ items, withoutAnswer: [] });
    return items.length > 0;
  } catch {
    return false;
  }
}

async function checkSession() {
  try {
    const session = await api.session();
    update({ session });
    return session;
  } catch (error) {
    update({ session: { configured: false, error: error.code } });
    return null;
  }
}

async function connectThroughExtension(force = false) {
  update({ syncingExtension: true });
  const result = await requestSession({ force });
  update({ syncingExtension: false, extensionResult: result });
  if (result.ok) await checkSession();
  return result;
}

async function changeLanguage(code) {
  await setLanguage(code, { remember: true });
  translateStatic();
  renderSessionBadge(state.session);
  renderSubtitle();
  monthPicker.render();
  views[currentTab].render();
  if (currentTab === 'missing') views.missing.load();
}

function setupLanguageSelect() {
  languageSelect.replaceChildren(...options(LANGUAGES.map(language => [language.code, language.name]), currentLanguage()));
  languageSelect.addEventListener('change', () => changeLanguage(languageSelect.value));
}

function setupTabs() {
  tabs.forEach(tab => tab.addEventListener('click', () => goTo(tab.dataset.tab)));
  document.querySelector('[role="tablist"]').addEventListener('keydown', event => {
    const step = TAB_KEYS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = tabs.findIndex(tab => tab.dataset.tab === currentTab);
    const target = step === 'first' ? 0 : step === 'last' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
    goTo(tabs[target].dataset.tab);
    tabs[target].focus();
  });
}

observe((next, changed) => {
  if ('session' in changed) {
    renderSessionBadge(next.session);
    applyAccount(next.session?.account);
    if (next.session?.valid && !next.publishers.length) loadPublishers();
  }
  if (['session', 'period', 'publishers', 'extension', 'syncingExtension', 'extensionResult'].some(key => key in changed)) views[currentTab].render();
});

setSessionRenewal(async () => {
  if (state.syncingExtension || !state.extension.active) {
    await checkSession();
    return false;
  }
  const result = await connectThroughExtension();
  notify(result.ok ? t('extension.renewed') : t(`extension.reason.${result.reason}`), result.ok ? 'info' : 'error');
  return result.ok;
});

async function start() {
  await setLanguage(initialLanguage());
  translateStatic();
  setupLanguageSelect();
  setupTabs();
  monthPicker.set(state.period);
  renderSubtitle();
  goTo('session');
  const [session] = await Promise.all([checkSession(), detectExtension()]);
  if (!session?.valid && state.extension.active) await connectThroughExtension();
  if (!state.session?.valid) return;
  goTo(await openSavedReview() ? 'review' : 'import');
}

start();

