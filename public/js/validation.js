import { MONTHLY_LIMIT_WITH_CREDIT } from './state.js';

const PIONEERS_WITH_CREDIT = ['Regular', 'Special'];

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  return Number(String(value).replace(',', '.'));
}

export function itemErrors(item) {
  if (item.status !== 'send') return [];
  const errors = [];
  const hours = toNumber(item.hours);
  const credit = toNumber(item.credit);
  const studies = toNumber(item.studies);

  if (!item.id) errors.push({ code: 'choose_publisher' });
  if ([hours, credit, studies].some(value => value !== null && (Number.isNaN(value) || value < 0))) errors.push({ code: 'non_numeric_values' });
  if (item.pioneer && hours === null) errors.push({ code: 'pioneer_without_hours' });
  if (hours !== null && !Number.isInteger(hours)) errors.push({ code: 'whole_hours' });
  if (!item.pioneer && item.participated !== true && item.participated !== false) errors.push({ code: 'participated_required' });
  if (credit && !PIONEERS_WITH_CREDIT.includes(item.pioneer)) errors.push({ code: 'credit_regular_only' });
  if (credit && (hours ?? 0) + credit > MONTHLY_LIMIT_WITH_CREDIT) errors.push({ code: 'credit_over_limit', params: { hours, credit, limit: MONTHLY_LIMIT_WITH_CREDIT } });
  return errors;
}

export function invalidFields(item) {
  const hours = toNumber(item.hours);
  const credit = toNumber(item.credit);
  return {
    hours: hours !== null && (Number.isNaN(hours) || !Number.isInteger(hours)),
    credit: Boolean(credit) && ((hours ?? 0) + credit > MONTHLY_LIMIT_WITH_CREDIT || !PIONEERS_WITH_CREDIT.includes(item.pioneer)),
  };
}
