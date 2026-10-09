'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const spreadsheetModule = require('../lib/spreadsheet');
const { createMatcher, loadAliases } = require('../lib/matching');
const { generateTemplate, templateColumns } = require('../lib/template');
const { createTranslator } = require('../lib/i18n');
const { PUBLISHERS, FORMS_TITLES, spreadsheet, formsSpreadsheet, temporaryFolder } = require('./support');

const titlesOf = (content, mapping, field) => mapping[field].map(index => content.titles[index]);
const TEMPLATE_FIELDS = ['name', 'participated', 'studies', 'auxiliaryPioneer', 'hours', 'credit', 'notes'];

test('Forms export has every column detected, including the double ones', () => {
  const content = spreadsheetModule.openSpreadsheet(formsSpreadsheet());
  const mapping = spreadsheetModule.suggestMapping(content.titles);
  assert.deepEqual(spreadsheetModule.validateMapping(mapping), []);
  assert.deepEqual(titlesOf(content, mapping, 'name'), ['Escreva seu nome completo']);
  assert.deepEqual(titlesOf(content, mapping, 'type'), ['Você é:']);
  assert.equal(mapping.studies.length, 2);
  assert.equal(mapping.conducted.length, 2);
  assert.deepEqual(titlesOf(content, mapping, 'hours'), ['Digite a quantidade de horas?']);
});

for (const language of ['en', 'pt-BR', 'es']) {
  test(`template in ${language} is recognized without adjustments`, () => {
    const t = createTranslator(language);
    const content = spreadsheetModule.openSpreadsheet(generateTemplate(t));
    const mapping = spreadsheetModule.suggestMapping(content.titles);
    assert.deepEqual(content.titles, templateColumns(t));
    for (const field of TEMPLATE_FIELDS) assert.equal(mapping[field].length, 1, `${language}: ${field}`);
    assert.deepEqual(xlsx.read(generateTemplate(t)).SheetNames, [t('template.sheet.reports'), t('template.sheet.instructions')]);
  });
}

test('non-standard spreadsheet: different titles, shuffled order and no type column', () => {
  const content = spreadsheetModule.openSpreadsheet(spreadsheet([
    ['Obs', 'Credits', 'Hours worked', 'Grp', 'Publisher', 'Studies'],
    ['', '', 12, 'G1', 'Ana Clara Example', 1],
  ]));
  const mapping = spreadsheetModule.suggestMapping(content.titles);
  assert.deepEqual(titlesOf(content, mapping, 'name'), ['Publisher']);
  assert.deepEqual(titlesOf(content, mapping, 'hours'), ['Hours worked']);
  assert.deepEqual(titlesOf(content, mapping, 'credit'), ['Credits']);
  assert.deepEqual(titlesOf(content, mapping, 'notes'), ['Obs']);
  assert.deepEqual(mapping.type, []);
});

test('mapping without Name or without Hours/Participated is rejected', () => {
  assert.deepEqual(spreadsheetModule.validateMapping({ name: [], hours: [1] }), ['name']);
  assert.deepEqual(spreadsheetModule.validateMapping({ name: [0], hours: [], participated: [] }), ['hoursOrParticipated']);
});

test('remembered format is reapplied by its titles', () => {
  const file = path.join(temporaryFolder(), 'mappings.json');
  const content = spreadsheetModule.openSpreadsheet(formsSpreadsheet());
  const mapping = { ...spreadsheetModule.suggestMapping(content.titles), notes: [7] };
  assert.equal(spreadsheetModule.rememberedMapping(file, content.titles), null);
  spreadsheetModule.rememberMapping(file, content.titles, mapping);
  assert.deepEqual(spreadsheetModule.rememberedMapping(file, content.titles).notes, [7]);
  assert.equal(spreadsheetModule.rememberedMapping(file, [...FORMS_TITLES, 'New column']), null);
});

test('answers use the first filled column', () => {
  const content = spreadsheetModule.openSpreadsheet(formsSpreadsheet());
  const answers = spreadsheetModule.readAnswers(content, spreadsheetModule.suggestMapping(content.titles));
  const bruno = answers.find(answer => answer.name === 'Bruno Test Fictional');
  assert.equal(bruno.studies, 'Dois estudos');
  assert.equal(bruno.conducted, 'Sim');
  assert.equal(answers.length, 11);
});

test('name matching: exact, alias, similar siblings, typo and duplicated registry', () => {
  const folder = temporaryFolder();
  fs.writeFileSync(path.join(folder, 'aliases.json'), JSON.stringify({ Dani: 1004 }));
  const match = createMatcher(PUBLISHERS, loadAliases(path.join(folder, 'aliases.json')));
  assert.equal(match('Ana Clara Example').publisher.id, 1001);
  assert.equal(match('Dani').publisher.id, 1004);
  assert.equal(match('Giovana Rocha').publisher.id, 1007);
  assert.equal(match('Giordana Rocha').publisher.id, 1008);
  assert.equal(match('Brunno Test Fictional').publisher.id, 1002);
  assert.equal(match('Unknown Person').publisher, null);
});
