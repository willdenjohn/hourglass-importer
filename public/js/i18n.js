export const LANGUAGES = [
  { code: 'pt-BR', name: 'Português' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
];
const STORAGE_KEY = 'language';
const FALLBACK = 'en';
const TRANSLATED_PARAMS = { registry: 'registry', type: 'formType' };

let language = FALLBACK;
let dictionary = {};
let fallback = {};

export function resolveLanguage(requested) {
  const value = String(requested ?? '');
  if (LANGUAGES.some(item => item.code === value)) return value;
  const prefix = value.toLowerCase().split(/[-_]/)[0];
  if (prefix === 'pt') return 'pt-BR';
  if (prefix === 'es') return 'es';
  return FALLBACK;
}

function savedLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberLanguage(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    return;
  }
}

async function loadDictionary(code) {
  const response = await fetch(`/locales/${code}.json`);
  return response.json();
}

export async function setLanguage(requested, { remember = false } = {}) {
  language = resolveLanguage(requested);
  [dictionary, fallback] = await Promise.all([loadDictionary(language), language === FALLBACK ? Promise.resolve(null) : loadDictionary(FALLBACK)]);
  fallback = fallback ?? dictionary;
  if (remember) rememberLanguage(language);
  document.documentElement.lang = language;
  return language;
}

export function initialLanguage() {
  return savedLanguage() ?? navigator.language;
}

export function currentLanguage() {
  return language;
}

export function currentLocale() {
  return language === 'en' ? 'en-US' : language;
}

function interpolate(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined || params[name] === null ? match : String(params[name])));
}

export function t(key, params) {
  return interpolate(dictionary[key] ?? fallback[key] ?? key, params);
}

export function renderMessage(prefix, message) {
  if (!message) return '';
  if (typeof message === 'string') return message;
  if (message.code === 'text') return message.params?.text ?? '';
  const params = { ...(message.params ?? {}) };
  for (const [name, translationPrefix] of Object.entries(TRANSLATED_PARAMS)) {
    if (params[name]) params[name] = t(`${translationPrefix}.${params[name]}`);
  }
  if (Array.isArray(params.fields)) params.fields = params.fields.map(field => t(`field.${field}`)).join(', ');
  return t(`${prefix}.${message.code}`, params);
}

export const renderAlert = alert => renderMessage('alert', alert);
export const renderError = error => renderMessage('error', error);

export function translateStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  document.title = t('app.title');
}
