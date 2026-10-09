import { h, replace, notify, formatTime } from '../dom.js';
import { api } from '../api.js';
import { state, update, STATUSES } from '../state.js';
import { itemErrors } from '../validation.js';
import { normalizeSearch } from '../text.js';
import { t } from '../i18n.js';
import { reviewRow } from './reviewRow.js';
import { showSimulation, showProgress } from './sendDialog.js';
import { periodLabel } from './import.js';
import { closedMonthNotice } from './closedMonthNotice.js';

const HEADER_KEYS = ['status', 'row', 'formName', 'hourglassName', 'participated', 'hours', 'credit', 'studies', 'pioneer', 'alerts'];
const SAVE_DELAY = 800;
const ALL = 'all';

export function createReviewView(panel, goTo) {
  let filter = ALL;
  let search = '';
  let timer = null;
  let saving = { state: 'idle', at: null };
  const rows = new WeakMap();
  const areas = {};

  function setSaving(next) {
    saving = next;
    if (areas.saving) replace(areas.saving, savingText());
  }

  function savingText() {
    if (saving.state === 'saving') return t('review.saving');
    if (saving.state === 'error') return h('span', { class: 'text-danger' }, t('review.saveFailed'));
    if (saving.state === 'saved') return t('review.savedAt', { time: saving.at });
    return t('review.autoSave');
  }

  function scheduleSave() {
    clearTimeout(timer);
    setSaving({ state: 'saving' });
    timer = setTimeout(async () => {
      try {
        await api.saveReview(state.period, state.items);
        setSaving({ state: 'saved', at: formatTime() });
      } catch (error) {
        setSaving({ state: 'error' });
        notify(t('review.saveFailedDetail', { detail: error.message }), 'error');
      }
    }, SAVE_DELAY);
  }

  function isVisible(item) {
    if (filter !== ALL && item.status !== filter) return false;
    if (!search) return true;
    return normalizeSearch(`${item.formName} ${item.hourglassName ?? ''}`).includes(search);
  }

  const handlers = () => ({ onChange: changeItem, onPublisherChange: changePublisher, onRemember: rememberAlias });

  function createRow(item) {
    const row = reviewRow(item, state.publishers, handlers());
    rows.set(item, row);
    return row;
  }

  function patchRow(row, item) {
    const fresh = reviewRow(item, state.publishers, handlers());
    row.dataset.status = fresh.dataset.status;
    [...fresh.children].forEach((freshCell, index) => {
      const cell = row.children[index];
      if (cell && !cell.contains(document.activeElement)) cell.replaceWith(freshCell);
    });
  }

  function redrawRow(item) {
    const row = rows.get(item);
    if (!row?.isConnected) return;
    setTimeout(() => patchRow(row, item), 0);
  }

  function changeItem(item, changes) {
    Object.assign(item, changes);
    scheduleSave();
    redrawRow(item);
    refreshSummary();
  }

  function changePublisher(item, id) {
    const publisher = state.publishers.find(candidate => candidate.id === id);
    changeItem(item, { id, hourglassName: publisher?.name ?? '', registry: publisher?.status ?? '', match: 'manual', aliasSaved: false });
  }

  async function rememberAlias(item) {
    try {
      await api.saveAlias(item.formName, item.id);
      item.aliasSaved = true;
      notify(t('review.aliasSaved', { formName: item.formName, hourglassName: item.hourglassName }));
      redrawRow(item);
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function counts() {
    const result = { [ALL]: state.items.length };
    STATUSES.forEach(status => { result[status] = state.items.filter(item => item.status === status).length; });
    return result;
  }

  function filterButtons() {
    const totals = counts();
    return [ALL, ...STATUSES].filter(status => status === ALL || totals[status] || status === filter).map(status =>
      h('button', {
        class: 'filter', 'aria-pressed': String(filter === status), dataset: { filter: status },
        onClick: () => { filter = status; refreshSummary(); redrawBody(); },
      }, `${status === ALL ? t('review.filterAll') : t(`status.${status}`)} (${totals[status] ?? 0})`));
  }

  function searchField() {
    return h('input', {
      class: 'input input--compact search-field', type: 'search', id: 'review-search',
      placeholder: t('review.searchPlaceholder'), value: search, 'aria-label': t('review.searchLabel'),
      onInput: event => { search = normalizeSearch(event.target.value); redrawBody(); },
    });
  }

  function redrawBody() {
    const visible = state.items.filter(isVisible);
    replace(areas.body, visible.length
      ? visible.map(createRow)
      : h('tr', {}, h('td', { colSpan: HEADER_KEYS.length, class: 'muted cell-empty' }, t('review.noRows'))));
  }

  async function simulate() {
    try {
      clearTimeout(timer);
      await api.saveReview(state.period, state.items);
      setSaving({ state: 'saved', at: formatTime() });
      const result = await api.simulate(state.period, state.items);
      showSimulation(result, periodLabel(state.period), send);
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function send(opened) {
    const view = showProgress(opened);
    try {
      await api.send(state.period, state.items, event => {
        if (event.type === 'progress') view.progress(event);
        if (event.type === 'end') view.finish(event, () => { opened.close(); goTo('missing'); });
      });
      const { items } = await api.review(state.period);
      update({ items });
    } catch (error) {
      notify(error.message, 'error');
      opened.close();
    }
  }

  function barContent() {
    const ready = state.items.filter(item => item.status === 'send');
    const withErrors = ready.filter(item => itemErrors(item).length).length;
    const noPermission = state.session?.account && !state.session.account.permissions.submitReports;
    areas.saving = h('div', { class: 'muted', id: 'save-status', 'aria-live': 'polite' }, savingText());
    return [
      h('div', {},
        h('strong', {}, t('review.readyCount', { count: ready.length })),
        withErrors ? h('span', { class: 'badge badge--danger space-left' }, t('review.errorCount', { count: withErrors })) : null,
        noPermission ? h('div', { class: 'badge badge--danger' }, t('error.no_submit_permission')) : null,
        areas.saving),
      h('div', { class: 'actions' },
        h('a', { class: 'button', href: api.reviewXlsxUrl(state.period), download: true }, t('common.downloadExcel')),
        h('button', { class: 'button button--primary', id: 'simulate-button', disabled: !ready.length, onClick: simulate }, t('review.simulate'))),
    ];
  }

  function refreshSummary() {
    replace(areas.filters, filterButtons());
    replace(areas.bar, barContent());
  }

  function withoutAnswer() {
    if (!state.withoutAnswer.length) return null;
    return h('details', { class: 'card' },
      h('summary', {}, t('review.withoutAnswer', { count: state.withoutAnswer.length })),
      h('ul', { class: 'plain-list' }, state.withoutAnswer.map(publisher => h('li', {}, publisher.name))));
  }

  function render() {
    if (!state.items.length) {
      replace(panel, h('div', { class: 'card' },
        h('h2', { class: 'card__title' }, t('review.emptyTitle')),
        h('p', { class: 'muted' }, t('review.emptyHint')),
        h('button', { class: 'button button--primary', onClick: () => goTo('import') }, t('review.goToImport'))));
      return;
    }
    const scroll = window.scrollY;
    areas.filters = h('div', { class: 'filters', role: 'group', 'aria-label': t('review.filterLabel') });
    areas.body = h('tbody');
    areas.bar = h('div', { class: 'send-bar' });
    replace(panel,
      h('div', { class: 'card' },
        h('h2', { class: 'card__title' }, t('review.title', { period: periodLabel(state.period) })),
        h('p', { class: 'muted' }, t('review.intro')),
        closedMonthNotice()),
      withoutAnswer(),
      h('div', { class: 'toolbar' }, areas.filters, searchField()),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'table', id: 'review-table' }, h('thead', {}, h('tr', {}, HEADER_KEYS.map(key => h('th', {}, t(`review.header.${key}`))))), areas.body)),
      areas.bar);
    refreshSummary();
    redrawBody();
    window.scrollTo(0, scroll);
  }

  return { render };
}

export async function loadPublishers() {
  try {
    update({ publishers: await api.publishers() });
  } catch (error) {
    notify(error.message, 'error');
  }
}
