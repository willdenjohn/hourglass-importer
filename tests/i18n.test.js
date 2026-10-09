'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { LANGUAGES, createTranslator, resolveLanguage, dictionary } = require('../lib/i18n');
const { renderAlert } = require('../lib/alerts');

const ROOT = path.join(__dirname, '..');
const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

function sourceFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return ['node_modules', 'tests', '.git'].includes(entry.name) ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('every language has exactly the same keys and placeholders', () => {
  const english = dictionary('en');
  for (const language of LANGUAGES) {
    const current = dictionary(language);
    assert.deepEqual(Object.keys(current).sort(), Object.keys(english).sort(), language);
    for (const key of Object.keys(english)) assert.deepEqual(placeholders(current[key]), placeholders(english[key]), `${language}: ${key}`);
  }
});

test('every static key used in the code exists', () => {
  const english = dictionary('en');
  const used = sourceFiles(ROOT).flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)].map(match => match[1]));
  const missing = [...new Set(used)].filter(key => !(key in english));
  assert.deepEqual(missing, []);
});

test('language resolution follows the system language with English as fallback', () => {
  assert.equal(resolveLanguage('pt-BR'), 'pt-BR');
  assert.equal(resolveLanguage('pt_PT'), 'pt-BR');
  assert.equal(resolveLanguage('es-MX'), 'es');
  assert.equal(resolveLanguage('fr-FR'), 'en');
  assert.equal(resolveLanguage(undefined), 'en');
});

test('interpolation, unknown keys and translated alert parameters', () => {
  const t = createTranslator('pt-BR');
  assert.equal(t('import.rows', { count: 5 }), '5 linhas');
  assert.equal(t('does.not.exist'), 'does.not.exist');
  assert.equal(renderAlert(t, { code: 'claims_regular', params: { registry: 'Baptized Publisher' } }), 'diz ser pioneiro regular, cadastro: Publicador batizado');
  assert.equal(renderAlert(createTranslator('es'), { code: 'registry_is_regular', params: { type: 'publisher' } }), 'el registro indica precursor regular; el formulario dice: publicador');
  assert.equal(renderAlert(t, { code: 'text', params: { text: 'free text' } }), 'free text');
});
