import { h } from '../dom.js';
import { t } from '../i18n.js';

const SAMPLE_FIELDS = ['name', 'participated', 'studies', 'auxiliaryPioneer', 'hours', 'credit', 'type', 'notes'];

function columnLabel(titles, index) {
  return `${String.fromCharCode(65 + (index % 26))}${index >= 26 ? Math.floor(index / 26) : ''} · ${titles[index] || t('mapping.untitled')}`;
}

function columnSelect(titles, value, used, onChange, label, emptyLabel = t('mapping.notUsed')) {
  const choices = [h('option', { value: '' }, emptyLabel),
    ...titles.map((_, index) => h('option', { value: index, selected: index === value, disabled: used.has(index) && index !== value }, columnLabel(titles, index)))];
  return h('select', { class: 'input input--compact', 'aria-label': label, onChange: event => onChange(event.target.value === '' ? null : Number(event.target.value)) }, choices);
}

function examples(spreadsheet, indexes) {
  const values = indexes.flatMap(index => spreadsheet.examples[index] ?? []);
  return values.length ? values.slice(0, 3).map(value => `"${value}"`).join(', ') : '—';
}

function fieldRow(field, spreadsheet, mapping, used, onChange) {
  const label = t(`field.${field.key}`);
  const indexes = mapping[field.key] ?? [];
  const main = columnSelect(spreadsheet.titles, indexes[0] ?? null, used,
    value => onChange(field.key, value === null ? [] : [value, ...indexes.slice(1)]), label);
  const extras = indexes.slice(1).map(index => h('span', { class: 'badge badge--primary' }, `+ ${columnLabel(spreadsheet.titles, index)}`,
    h('button', { class: 'remove-button', type: 'button', 'aria-label': t('mapping.removeColumn'), onClick: () => onChange(field.key, indexes.filter(other => other !== index)) }, '×')));
  const add = field.multiple && indexes.length
    ? columnSelect(spreadsheet.titles, null, used, value => value !== null && onChange(field.key, [...indexes, value]), t('mapping.addColumnTo', { field: label }), t('mapping.addColumn'))
    : null;

  return h('tr', { dataset: { field: field.key } },
    h('td', {}, h('strong', {}, label), field.required ? h('span', { class: 'muted' }, ` (${t('mapping.required')})`) : null),
    h('td', {}, h('div', { class: 'actions' }, main, extras, add)),
    h('td', { class: 'muted' }, examples(spreadsheet, indexes)));
}

export function mappingTable(spreadsheet, mapping, onChange) {
  const used = new Set(Object.values(mapping).flat());
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'table', id: 'mapping-table' },
      h('thead', {}, h('tr', {}, [t('mapping.reportField'), t('mapping.yourColumn'), t('mapping.examples')].map(title => h('th', {}, title)))),
      h('tbody', {}, spreadsheet.fields.map(field => fieldRow(field, spreadsheet, mapping, used, onChange)))));
}

export function sampleTable(sample) {
  const empty = () => h('span', { class: 'muted' }, '—');
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'table', id: 'sample-table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('mapping.row')), SAMPLE_FIELDS.map(key => h('th', {}, t(`field.${key}`))))),
      h('tbody', {}, sample.map(row => h('tr', {}, h('td', { class: 'muted' }, row.row),
        SAMPLE_FIELDS.map(key => h('td', {}, row[key] === null || row[key] === undefined || row[key] === '' ? empty() : String(row[key]))))))));
}
