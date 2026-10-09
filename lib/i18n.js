'use strict';

const fs = require('fs');
const path = require('path');

const LANGUAGES = ['en', 'pt-BR', 'es'];
const DEFAULT_LANGUAGE = 'en';
const LOCALES_FOLDER = path.join(__dirname, '..', 'locales');
const dictionaries = new Map();

function resolveLanguage(requested) {
  const value = String(requested ?? '').trim();
  if (LANGUAGES.includes(value)) return value;
  const prefix = value.toLowerCase().split(/[-_]/)[0];
  if (prefix === 'pt') return 'pt-BR';
  if (prefix === 'es') return 'es';
  return DEFAULT_LANGUAGE;
}

function dictionary(language) {
  if (!dictionaries.has(language)) {
    dictionaries.set(language, JSON.parse(fs.readFileSync(path.join(LOCALES_FOLDER, `${language}.json`), 'utf8')));
  }
  return dictionaries.get(language);
}

function interpolate(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined || params[name] === null ? match : String(params[name])));
}

function createTranslator(requested) {
  const language = resolveLanguage(requested);
  const primary = dictionary(language);
  const fallback = dictionary(DEFAULT_LANGUAGE);
  const t = (key, params) => interpolate(primary[key] ?? fallback[key] ?? key, params);
  t.language = language;
  return t;
}

function allTranslations(key) {
  return LANGUAGES.map(language => dictionary(language)[key]).filter(Boolean);
}

module.exports = { LANGUAGES, DEFAULT_LANGUAGE, resolveLanguage, createTranslator, allTranslations, dictionary };
