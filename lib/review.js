'use strict';

const xlsx = require('xlsx');
const { PIONEER, MONTHLY_LIMIT_WITH_CREDIT } = require('./interpret');
const { normalize, isBlank, parseYesNo } = require('./text');
const { allTranslations } = require('./i18n');
const { renderAlert } = require('./alerts');

const STATUS = { send: 'send', review: 'review', alreadySent: 'already_sent', notFound: 'not_found', ignore: 'ignore' };
const STATUS_CODES = Object.values(STATUS);
const PIONEER_CODES = Object.values(PIONEER);
const DATA_COLUMN = '_data';

const COLUMNS = [
  ['status', 16], ['row', 7], ['formName', 34], ['formType', 20], ['id', 12], ['hourglassName', 34], ['registry', 24],
  ['match', 15], ['participated', 10], ['hours', 8], ['credit', 8], ['studies', 8], ['pioneer', 10], ['notes', 30],
  ['rawHours', 30], ['alerts', 70],
];

function labelFor(t, key, value) {
  if (isBlank(value)) return '';
  switch (key) {
    case 'status': return t(`status.${value}`);
    case 'participated': return value === true ? t('common.yes') : value === false ? t('common.no') : '';
    case 'pioneer': return t(`pioneer.${value}`);
    case 'registry': return t(`registry.${value}`);
    case 'match': return t(`match.${value}`);
    case 'alerts': return value.map(item => renderAlert(t, item)).join(' | ');
    default: return value;
  }
}

function writeReview(file, items, t) {
  const header = [...COLUMNS.map(([key]) => t(`review.column.${key}`)), DATA_COLUMN];
  const rows = items.map(item => [
    ...COLUMNS.map(([key]) => labelFor(t, key, item[key] ?? '')),
    JSON.stringify({ alerts: item.alerts ?? [], registry: item.registry ?? '', match: item.match ?? '', aliasSaved: Boolean(item.aliasSaved) }),
  ]);
  const sheet = xlsx.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = [...COLUMNS.map(([, width]) => ({ wch: width })), { hidden: true }];
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, t('review.sheet'));
  xlsx.writeFile(book, file);
}

const codeFromLabel = (prefix, codes) => {
  const byLabel = new Map();
  codes.forEach(code => allTranslations(`${prefix}.${code}`).forEach(label => byLabel.set(normalize(label), code)));
  return value => {
    if (isBlank(value)) return '';
    if (codes.includes(value)) return value;
    return byLabel.get(normalize(value)) ?? null;
  };
};
const statusFromLabel = codeFromLabel('status', STATUS_CODES);
const pioneerFromLabel = codeFromLabel('pioneer', PIONEER_CODES);

function columnIndexes(header) {
  const normalized = header.map(normalize);
  const indexes = Object.fromEntries(COLUMNS.map(([key]) => {
    const titles = allTranslations(`review.column.${key}`).map(normalize);
    return [key, normalized.findIndex(title => titles.includes(title))];
  }));
  indexes[DATA_COLUMN] = header.indexOf(DATA_COLUMN);
  return indexes;
}

function parseData(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function itemFromRow(row, indexes) {
  const cell = key => (indexes[key] >= 0 ? row[indexes[key]] : null);
  const data = parseData(cell(DATA_COLUMN));
  const legacyAlerts = String(cell('alerts') ?? '').split(' | ').filter(Boolean).map(text => ({ code: 'text', params: { text } }));
  const pioneer = pioneerFromLabel(cell('pioneer'));
  return {
    status: statusFromLabel(cell('status')) ?? cell('status'),
    row: cell('row'),
    formName: cell('formName') ?? '',
    formType: cell('formType') ?? '',
    id: cell('id') === '' ? null : cell('id'),
    hourglassName: cell('hourglassName') ?? '',
    registry: data.registry ?? cell('registry') ?? '',
    match: data.match ?? cell('match') ?? '',
    participated: parseYesNo(cell('participated')),
    hours: cell('hours'),
    credit: cell('credit'),
    studies: cell('studies'),
    pioneer: pioneer === null ? cell('pioneer') : pioneer,
    notes: cell('notes') ?? '',
    rawHours: cell('rawHours') ?? '',
    alerts: data.alerts ?? legacyAlerts,
    aliasSaved: Boolean(data.aliasSaved),
  };
}

function readReview(file) {
  const book = xlsx.readFile(file);
  const rows = xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: null });
  const indexes = columnIndexes(rows[0].map(title => String(title ?? '')));
  return rows.slice(1).filter(row => row.some(value => !isBlank(value))).map(row => itemFromRow(row, indexes));
}

function numberOrNull(value) {
  if (isBlank(value)) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isNaN(number) ? NaN : number;
}

function validMinutes(minutes) {
  return minutes === 0 || minutes === 1 || [15, 30, 45].includes(minutes) || (minutes % 60 === 0 && minutes / 60 <= 500);
}

function buildReport(item, year, month) {
  const errors = [];
  const id = numberOrNull(item.id);
  const pioneer = isBlank(item.pioneer) ? null : (PIONEER_CODES.includes(item.pioneer) ? item.pioneer : undefined);
  const hours = numberOrNull(item.hours);
  const credit = numberOrNull(item.credit);
  const studies = numberOrNull(item.studies);
  const participated = parseYesNo(item.participated);
  const creditAllowed = pioneer === PIONEER.Regular || pioneer === PIONEER.Special;

  if (!id) errors.push({ code: 'missing_publisher_id' });
  if (pioneer === undefined) errors.push({ code: 'invalid_pioneer', params: { value: item.pioneer } });
  if ([hours, credit, studies].some(Number.isNaN)) errors.push({ code: 'non_numeric_values' });
  if (pioneer && hours === null) errors.push({ code: 'pioneer_without_hours' });
  if (!pioneer && participated === null) errors.push({ code: 'participated_required' });
  if (credit && !creditAllowed) errors.push({ code: 'credit_regular_only' });
  if (credit && (hours ?? 0) + credit > MONTHLY_LIMIT_WITH_CREDIT) errors.push({ code: 'credit_over_limit', params: { hours, credit, limit: MONTHLY_LIMIT_WITH_CREDIT } });

  const minutes = pioneer ? Math.round((hours ?? 0) * 60) : (participated ? 1 : 0);
  if (!validMinutes(minutes)) errors.push({ code: 'invalid_hours', params: { hours } });

  const report = {
    id: 0,
    user: { id },
    month,
    year,
    minutes,
    studies: studies || null,
    credithours: credit || null,
    pioneer: pioneer ?? null,
    remarks: isBlank(item.notes) ? null : String(item.notes).trim(),
  };
  return { report, errors };
}

module.exports = { STATUS, STATUS_CODES, PIONEER_CODES, writeReview, readReview, buildReport };
