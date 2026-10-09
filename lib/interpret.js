'use strict';

const { normalize, isBlank, numbersIn, numberFromWords, parseYesNo } = require('./text');

const PIONEER = { Regular: 'Regular', Auxiliary: 'Auxiliary', Special: 'Special' };
const PIONEER_BY_STATUS = {
  'Regular Pioneer': PIONEER.Regular,
  'Continuous Auxiliary Pioneer': PIONEER.Auxiliary,
  'Special Pioneer': PIONEER.Special,
  'Field Missionary': PIONEER.Special,
};
const SUSPICIOUS_HOURS = 120;
const MONTHLY_LIMIT_WITH_CREDIT = 55;
const PLAIN_HOURS_TEXT = /^\s*(horas?\s*|hours?\s*)?\d+(?:[.,]\d+)?\s*(h|hs|hrs|ho|horas?|hours?)?\.?\s*$/i;
const CREDIT_WORDS = /volunt|ldc|constru|reforma|cozinha|kitchen|salao|salão|hall|credito|crédito|credit|betel|bethel|assembl/i;

const alert = (code, params) => (params ? { code, params } : { code });

function typeFromText(value) {
  const text = normalize(value);
  if (/regular|especial|special/.test(text)) return 'regular';
  if (/auxiliar|auxiliary/.test(text)) return 'auxiliary';
  if (/publicador|publisher/.test(text)) return 'publisher';
  return null;
}

function typeOfAnswer(answer, alerts) {
  if (!isBlank(answer.type)) {
    const type = typeFromText(answer.type);
    if (!type) alerts.push(alert('type_unrecognized', { value: answer.type }));
    return type;
  }
  return parseYesNo(answer.auxiliaryPioneer) === true ? 'auxiliary' : null;
}

function parseHours(value, alerts) {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return value;
  const numbers = numbersIn(value);
  if (numbers.length === 0) {
    alerts.push(alert('hours_without_number', { value }));
    return numberFromWords(value);
  }
  if (numbers.length > 1) alerts.push(alert('hours_multiple_numbers', { value }));
  else if (!PLAIN_HOURS_TEXT.test(String(value)) && !/\(\s*\d+\s*\)/.test(String(value))) alerts.push(alert('hours_text', { value }));
  return numbers[0];
}

function creditFromHoursText(value) {
  const numbers = numbersIn(value);
  return numbers.length > 1 && CREDIT_WORDS.test(String(value ?? '')) ? numbers[1] : null;
}

function parseStudies(conducted, studies, alerts) {
  if (!isBlank(studies)) {
    if (/revisit|return visit|revisita/i.test(String(studies))) {
      alerts.push(alert('studies_unclear', { value: studies }));
      return null;
    }
    const number = typeof studies === 'number' ? studies : (numbersIn(studies)[0] ?? numberFromWords(studies));
    if (number === null || number === undefined) alerts.push(alert('studies_not_understood', { value: studies }));
    return number ?? null;
  }
  if (parseYesNo(conducted) === true) {
    alerts.push(alert('studies_assumed_one'));
    return 1;
  }
  return null;
}

function publisherParticipation(answer, studies, alerts) {
  const informed = parseYesNo(answer.participated);
  if (informed !== null) return informed;
  const hours = numbersIn(answer.hours)[0];
  if (hours > 0 || studies > 0) return true;
  alerts.push(isBlank(answer.participated) ? alert('participation_missing') : alert('participation_not_understood', { value: answer.participated }));
  return null;
}

function roundHours(hours, alerts) {
  if (hours === null || Number.isInteger(hours)) return hours;
  alerts.push(alert('hours_rounded', { value: hours }));
  return Math.floor(hours);
}

function pioneerOfReport(type, publisher, alerts) {
  const fromRegistry = PIONEER_BY_STATUS[publisher?.status] ?? null;
  const isRegular = fromRegistry === PIONEER.Regular || fromRegistry === PIONEER.Special;
  if (type === 'regular' && !isRegular) alerts.push(alert('claims_regular', { registry: publisher?.status ?? '' }));
  if (type && type !== 'regular' && fromRegistry === PIONEER.Regular) alerts.push(alert('registry_is_regular', { type }));
  if (type === 'auxiliary' && fromRegistry !== PIONEER.Regular) return PIONEER.Auxiliary;
  return fromRegistry;
}

function pioneerHoursAndCredit(answer, pioneer, alerts) {
  const hours = roundHours(parseHours(answer.hours, alerts), alerts);
  if (hours === null) alerts.push(alert('pioneer_without_hours'));
  if (hours > SUSPICIOUS_HOURS) alerts.push(alert('hours_too_high', { value: hours }));

  const creditFromColumn = !isBlank(answer.credit);
  let credit = creditFromColumn ? parseHours(answer.credit, alerts) : creditFromHoursText(answer.hours);
  if (credit === null) return { hours, credit };
  if (pioneer === PIONEER.Auxiliary) {
    alerts.push(alert('credit_not_applicable', { value: credit }));
    return { hours, credit: null };
  }
  const maximum = Math.max(0, MONTHLY_LIMIT_WITH_CREDIT - (hours ?? 0));
  if (credit > maximum) alerts.push(alert('credit_capped', { value: credit, maximum, limit: MONTHLY_LIMIT_WITH_CREDIT }));
  else if (!creditFromColumn) alerts.push(alert('credit_suggested', { value: credit }));
  credit = Math.min(credit, maximum) || null;
  return { hours, credit };
}

function interpretAnswer(answer, publisher) {
  const alerts = [];
  const type = typeOfAnswer(answer, alerts);
  const pioneer = pioneerOfReport(type, publisher, alerts);
  const studies = parseStudies(answer.conducted, answer.studies, alerts);
  const isPioneer = pioneer !== null;
  const participated = isPioneer ? true : publisherParticipation(answer, studies, alerts);
  const { hours, credit } = isPioneer ? pioneerHoursAndCredit(answer, pioneer, alerts) : { hours: null, credit: null };
  return { type, pioneer, participated, hours, credit, studies, alerts };
}

module.exports = { interpretAnswer, PIONEER, MONTHLY_LIMIT_WITH_CREDIT };
