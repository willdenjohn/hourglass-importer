'use strict';

const fs = require('fs');
const xlsx = require('xlsx');
const { normalize, isBlank } = require('./text');
const { allTranslations } = require('./i18n');

const titlePatterns = key => allTranslations(`template.column.${key}`).map(title => new RegExp(`^${normalize(title)}$`));

const FIELDS = [
  { key: 'name', required: true, patterns: [/nome completo|full name|nombre completo/, ...titlePatterns('name'), /^nome( do publicador)?$|^name$|^nombre$/, /^publicador$|^publisher$/, /nome|name|nombre/] },
  { key: 'participated', patterns: [...titlePatterns('participated'), /participou|participated|participo/, /participacao|participation|participacion/] },
  { key: 'studies', multiple: true, patterns: [...titlePatterns('studies'), /quantos estudos|how many (bible )?studies|cuantos (cursos|estudios)/, /estudos? biblicos?|bible stud|cursos? biblicos?|estudios? biblicos?/, /^estudos?$|^studies$|^cursos$|^estudios$/] },
  { key: 'auxiliaryPioneer', patterns: [...titlePatterns('auxiliaryPioneer'), /pioneiro auxiliar|auxiliary pioneer|precursor auxiliar/, /^auxiliar$|^auxiliary$/] },
  { key: 'hours', patterns: [...titlePatterns('hours'), /quantidade de horas|number of hours|cantidad de horas/, /^horas( de campo| no ministerio| en el ministerio)?$|^hours( in (the )?ministry)?$/, /^horas?$|^hours?$/, /^(?!.*(credito|credit)).*(horas|hours)/] },
  { key: 'credit', patterns: [...titlePatterns('credit'), /credito|credit/, /ldc|construcao|construction|construccion/] },
  { key: 'notes', patterns: [...titlePatterns('notes'), /observa|remark|notes?$|comentario|comment/, /^obs\b/] },
  { key: 'type', patterns: [/^voce e\s*:?$|^you are\s*:?$|^usted es\s*:?$|^eres\s*:?$/, /^tipo|^type/, /^situacao$|categoria|category/] },
  { key: 'conducted', multiple: true, patterns: [/^dirigiu|^conducted|^dirigio|^did you conduct/] },
];
const DETECTION_ORDER = ['credit', 'auxiliaryPioneer', 'name', 'type', 'participated', 'studies', 'conducted', 'hours', 'notes'];
const SAMPLE_ROWS = 5;

function openSpreadsheet(source) {
  const book = Buffer.isBuffer(source) ? xlsx.read(source, { type: 'buffer' }) : xlsx.readFile(source);
  const rows = xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: null });
  const titles = (rows[0] ?? []).map(title => String(title ?? '').replace(/\s+/g, ' ').trim());
  const data = rows.slice(1).filter(row => row.some(cell => !isBlank(cell)));
  return { titles, rows: data };
}

function candidates(field, titles, used) {
  for (const pattern of field.patterns) {
    const found = titles
      .map((title, index) => ({ title: normalize(title), index }))
      .filter(({ title, index }) => title && !used.has(index) && pattern.test(title))
      .map(({ index }) => index);
    if (found.length) return field.multiple ? found : [found[0]];
  }
  return [];
}

function suggestMapping(titles) {
  const used = new Set();
  const mapping = {};
  for (const key of DETECTION_ORDER) {
    const indexes = candidates(FIELDS.find(field => field.key === key), titles, used);
    indexes.forEach(index => used.add(index));
    mapping[key] = indexes;
  }
  return mapping;
}

function signature(titles) {
  return titles.map(normalize).join('|');
}

function loadMappings(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function rememberedMapping(file, titles) {
  const saved = loadMappings(file)[signature(titles)];
  if (!saved) return null;
  const normalized = titles.map(normalize);
  return Object.fromEntries(FIELDS.map(({ key }) => [key, (saved[key] ?? []).map(title => normalized.indexOf(title)).filter(index => index >= 0)]));
}

function rememberMapping(file, titles, mapping) {
  const all = loadMappings(file);
  all[signature(titles)] = Object.fromEntries(Object.entries(mapping).map(([key, indexes]) => [key, indexes.map(index => normalize(titles[index]))]));
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
}

function validateMapping(mapping) {
  const missing = [];
  if (!mapping.name?.length) missing.push('name');
  if (!mapping.hours?.length && !mapping.participated?.length) missing.push('hoursOrParticipated');
  return missing;
}

function firstFilled(row, indexes = []) {
  const index = indexes.find(i => !isBlank(row[i]));
  return index === undefined ? null : row[index];
}

function readAnswers({ rows }, mapping) {
  return rows
    .map((row, index) => {
      const values = Object.fromEntries(FIELDS.map(({ key }) => [key, firstFilled(row, mapping[key])]));
      return { row: index + 2, ...values, name: String(values.name ?? '').trim() };
    })
    .filter(answer => answer.name);
}

function sample(spreadsheet, mapping) {
  return readAnswers({ rows: spreadsheet.rows.slice(0, SAMPLE_ROWS) }, mapping);
}

function readForm(source, mappingsFile) {
  const spreadsheet = openSpreadsheet(source);
  const mapping = (mappingsFile && rememberedMapping(mappingsFile, spreadsheet.titles)) || suggestMapping(spreadsheet.titles);
  const missing = validateMapping(mapping);
  if (missing.length) throw Object.assign(new Error('columns_missing'), { code: 'columns_missing', params: { fields: missing, titles: spreadsheet.titles.join(' | ') } });
  return readAnswers(spreadsheet, mapping);
}

const FIELD_DESCRIPTIONS = FIELDS.map(({ key, required, multiple }) => ({ key, required: Boolean(required), multiple: Boolean(multiple) }));

module.exports = {
  FIELDS: FIELD_DESCRIPTIONS,
  openSpreadsheet, suggestMapping, rememberedMapping, rememberMapping, validateMapping, readAnswers, sample, readForm, signature,
};
