import { h, options } from '../dom.js';
import { STATUSES, PIONEERS } from '../state.js';
import { itemErrors, invalidFields } from '../validation.js';
import { t, renderAlert, renderError } from '../i18n.js';

const ALERT_CATEGORIES = {
  send: ['report_exists', 'sent_by_importer', 'duplicate_answer'],
  name: ['similar_name', 'ambiguous_name', 'not_found', 'inactive_in_hourglass', 'shared_publisher'],
  credit: ['credit_capped', 'credit_suggested', 'credit_not_applicable'],
  hours: ['hours_without_number', 'hours_multiple_numbers', 'hours_text', 'hours_rounded', 'hours_too_high', 'pioneer_without_hours'],
  registry: ['claims_regular', 'registry_is_regular', 'type_unrecognized'],
  studies: ['studies_unclear', 'studies_not_understood', 'studies_assumed_one'],
};
const CATEGORY_BY_CODE = Object.fromEntries(Object.entries(ALERT_CATEGORIES).flatMap(([category, codes]) => codes.map(code => [code, category])));

function alertCategory(alert) {
  if (alert.code === 'text') return /^(ajustado|adjusted)/i.test(alert.params?.text ?? '') ? 'adjusted' : 'other';
  return CATEGORY_BY_CODE[alert.code] ?? 'other';
}

function select(value, list, onChange, label) {
  return h('select', { class: 'input input--compact', 'aria-label': label, onChange: event => onChange(event.target.value) }, options(list, value));
}

function numberField(value, onChange, label, invalid) {
  return h('input', {
    class: `input input--compact input--number${invalid ? ' input--invalid' : ''}`,
    type: 'number', min: 0, step: 1, value: value ?? '', 'aria-label': label,
    onChange: event => onChange(event.target.value === '' ? '' : Number(event.target.value)),
  });
}

function publisherSelect(item, publishers, onChange) {
  const list = [['', t('review.choosePublisher')], ...publishers.map(publisher => [publisher.id, publisher.name])];
  return select(item.id, list, value => onChange(value ? Number(value) : ''), t('review.column.hourglassName'));
}

function participatedSelect(item, onChange) {
  const value = item.participated === true ? 'yes' : item.participated === false ? 'no' : '';
  const list = [['', '—'], ['yes', t('common.yes')], ['no', t('common.no')]];
  return select(value, list, choice => onChange(choice === 'yes' ? true : choice === 'no' ? false : null), t('review.column.participated'));
}

function alertTag(alert) {
  const category = alertCategory(alert);
  const text = renderAlert(alert).replace(/^(ajustado|adjusted):\s*/i, '');
  return h('span', { class: 'alert' }, h('span', { class: `alert__tag alert__tag--${category}` }, t(`alertTag.${category}`)), text);
}

function alertsCell(item) {
  const errors = itemErrors(item);
  return h('td', { class: 'cell-alerts' },
    errors.map(error => h('span', { class: 'alert alert--error' }, h('span', { class: 'alert__tag alert__tag--error' }, t('alertTag.error')), renderError(error))),
    (item.alerts ?? []).map(alertTag),
    item.rawHours ? h('span', { class: 'alert alert--source' }, t('review.formValue', { value: item.rawHours })) : null);
}

function rememberButton(item, onRemember) {
  if (item.match !== 'manual' || !item.id || item.aliasSaved) return null;
  return h('button', { class: 'button button--small', onClick: () => onRemember(item) }, t('review.rememberName'));
}

export function reviewRow(item, publishers, { onChange, onPublisherChange, onRemember }) {
  const change = field => value => onChange(item, { [field]: value });
  const invalid = invalidFields(item);

  return h('tr', { dataset: { status: item.status, row: item.row } },
    h('td', {}, select(item.status, STATUSES.map(status => [status, t(`status.${status}`)]), change('status'), t('review.column.status'))),
    h('td', { class: 'muted' }, item.row),
    h('td', { class: 'cell-name' },
      h('div', {}, item.formName),
      h('div', { class: 'muted' }, item.formType || '')),
    h('td', { class: 'cell-name' },
      publisherSelect(item, publishers, id => onPublisherChange(item, id)),
      item.registry ? h('div', { class: 'muted' }, t(`registry.${item.registry}`)) : null,
      rememberButton(item, onRemember)),
    h('td', {}, participatedSelect(item, change('participated'))),
    h('td', {}, numberField(item.hours, change('hours'), t('review.column.hours'), invalid.hours)),
    h('td', {}, numberField(item.credit, change('credit'), t('review.column.credit'), invalid.credit)),
    h('td', {}, numberField(item.studies, change('studies'), t('review.column.studies'))),
    h('td', {}, select(item.pioneer, [['', '—'], ...PIONEERS.map(pioneer => [pioneer, t(`pioneer.${pioneer}`)])], change('pioneer'), t('review.column.pioneer'))),
    alertsCell(item));
}
