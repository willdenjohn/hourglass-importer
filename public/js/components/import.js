import { h, replace, notify } from '../dom.js';
import { api } from '../api.js';
import { state, update } from '../state.js';
import { t, currentLocale } from '../i18n.js';
import { mappingTable, sampleTable } from './mapping.js';
import { closedMonthNotice } from './closedMonthNotice.js';

const TEMPLATE_COLUMNS = ['name', 'participated', 'studies', 'auxiliaryPioneer', 'hours', 'credit', 'notes'];

export function periodLabel({ month, year }) {
  return new Date(year, month - 1, 1).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
}

function dropzone(fileName, onChoose) {
  const input = h('input', { type: 'file', accept: '.xlsx,.xls', class: 'visually-hidden', id: 'spreadsheet-file' });
  const zone = h('label', { class: 'dropzone', for: 'spreadsheet-file' },
    h('div', {}, t('import.dropTitle')),
    h('div', { class: 'muted' }, t('import.dropHint')),
    fileName ? h('div', { class: 'dropzone__name' }, fileName) : null,
    input);

  input.addEventListener('change', () => input.files[0] && onChoose(input.files[0]));
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dropzone--active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dropzone--active'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('dropzone--active');
    if (event.dataTransfer.files[0]) onChoose(event.dataTransfer.files[0]);
  });
  return zone;
}

function guidance() {
  return h('details', { class: 'card', id: 'spreadsheet-guidance' },
    h('summary', { class: 'card__title' }, t('import.guidanceTitle')),
    h('p', { class: 'muted' }, t('import.guidanceIntro')),
    h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, [t('import.templateColumn'), t('import.whatToFill'), ''].map(title => h('th', {}, title)))),
      h('tbody', {}, TEMPLATE_COLUMNS.map(key => h('tr', {},
        h('td', {}, h('strong', {}, t(`template.column.${key}`))),
        h('td', {}, t(`template.help.${key}`)),
        h('td', { class: 'muted' }, t(`template.required.${key}`))))))),
    h('p', { class: 'muted' }, t('import.guidanceFootnote')),
    h('a', { class: 'button', href: api.templateUrl(), download: true }, t('import.downloadTemplate')));
}

export function createImportView(panel, goTo) {
  let file = null;
  let spreadsheet = null;
  let mapping = {};
  let sample = [];
  let missing = [];
  let remember = true;
  let processing = false;

  async function upload(chosen) {
    file = chosen;
    spreadsheet = null;
    render();
    try {
      spreadsheet = await api.uploadSpreadsheet(file);
      ({ mapping, sample, missing } = spreadsheet);
    } catch (error) {
      notify(error.message, 'error');
    }
    render();
  }

  async function changeMapping(key, indexes) {
    mapping = { ...mapping, [key]: indexes };
    render();
    try {
      ({ sample, missing } = await api.spreadsheetSample(spreadsheet.id, mapping));
    } catch (error) {
      notify(error.message, 'error');
    }
    render();
  }

  async function process() {
    processing = true;
    render();
    try {
      const result = await api.prepare(state.period, { id: spreadsheet.id, mapping, remember });
      update({ items: result.items, withoutAnswer: result.withoutAnswer });
      notify(t('import.processed', { count: result.items.length }));
      goTo('review');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      processing = false;
      render();
    }
  }

  async function openSaved() {
    try {
      const { items } = await api.review(state.period);
      update({ items, withoutAnswer: [] });
      goTo('review');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function formatStatus() {
    if (spreadsheet.remembered) return h('div', { class: 'notice notice--success' }, t('import.formatKnown'));
    if (missing.length) return h('div', { class: 'notice notice--danger' }, t('import.chooseColumns', { fields: missing.map(key => t(`field.${key}`)).join(', ') }));
    return h('div', { class: 'notice notice--warning' }, t('import.formatDetected'));
  }

  function mappingStep() {
    if (!spreadsheet) return file ? h('div', { class: 'notice' }, t('import.reading')) : null;
    const canProcess = !missing.length && state.session?.valid && !processing;
    return [
      h('div', { class: 'card', id: 'mapping-card' },
        h('div', { class: 'group__header' },
          h('h3', { class: 'card__title' }, t('import.columnsTitle')),
          h('span', { class: 'badge' }, t('import.rows', { count: spreadsheet.rowCount }))),
        formatStatus(),
        mappingTable(spreadsheet, mapping, changeMapping)),
      h('div', { class: 'card' },
        h('h3', { class: 'card__title' }, t('import.sampleTitle')),
        h('p', { class: 'muted' }, t('import.sampleHint')),
        sampleTable(sample),
        h('div', { class: 'actions space-top' },
          h('label', { class: 'actions' },
            h('input', { type: 'checkbox', id: 'remember-format', checked: remember, onChange: event => { remember = event.target.checked; } }),
            t('import.rememberFormat')),
          h('button', { class: 'button button--primary', id: 'process-button', disabled: !canProcess, onClick: process }, processing ? t('import.processing') : t('import.process')))),
    ];
  }

  function render() {
    replace(panel,
      h('div', { class: 'card' },
        h('div', { class: 'group__header' },
          h('h2', { class: 'card__title' }, t('import.title', { period: periodLabel(state.period) })),
          h('a', { class: 'button', href: api.templateUrl(), download: true, id: 'download-template' }, t('import.downloadTemplate'))),
        h('p', { class: 'muted' }, t('import.intro')),
        closedMonthNotice(),
        dropzone(file?.name, upload),
        h('div', { class: 'actions' }, h('button', { class: 'button', onClick: openSaved }, t('import.openSaved'))),
        !state.session?.valid ? h('div', { class: 'notice notice--warning space-top' }, t('import.connectFirst')) : null),
      mappingStep(),
      guidance());
  }

  return { render };
}
