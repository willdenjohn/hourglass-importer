import { h, replace, notify } from '../dom.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const NO_GROUP = '__none__';

function formatLabel(label) {
  const [year, month] = label.split('-');
  return `${month}/${year}`;
}

const groupName = group => (group === NO_GROUP ? t('missing.noGroup') : group);

function totals({ totals: values }) {
  const statCard = (label, value) => h('div', { class: 'card' }, h('div', { class: 'muted' }, label), h('div', { class: 'stat' }, value));
  return h('div', { class: 'grid' },
    statCard(t('missing.stat.active'), values.active),
    statCard(t('missing.stat.submitted'), values.submitted),
    statCard(t('missing.stat.missing'), values.missing),
    statCard(t('missing.stat.inactive'), values.inactive));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    notify(t('missing.copied'));
  } catch {
    notify(t('missing.copyFailed'), 'error');
  }
}

function messageCard(text) {
  return h('div', { class: 'card' },
    h('h3', { class: 'card__title' }, t('missing.messageTitle')),
    h('p', { class: 'muted' }, t('missing.messageHint')),
    h('textarea', { class: 'input message-box', id: 'missing-message', readonly: true, 'aria-label': t('missing.messageTitle') }, text),
    h('div', { class: 'actions' }, h('button', { class: 'button button--primary', id: 'copy-message-button', onClick: () => copy(text) }, t('missing.copy'))));
}

function groupCard(group, members) {
  return h('div', { class: 'card', dataset: { group } },
    h('div', { class: 'group__header' },
      h('h3', { class: 'card__title' }, groupName(group)),
      h('span', { class: 'badge badge--warning' }, t('missing.groupCount', { count: members.length }))),
    members[0].overseer ? h('div', { class: 'muted' }, t('missing.overseer', { name: members[0].overseer })) : null,
    members.map(member => h('div', { class: 'group__member' },
      h('span', {}, member.name, h('span', { class: 'muted' }, ` · ${member.status ? t(`registry.${member.status}`) : ''}`),
        member.monthsMissing > 1 ? h('span', { class: 'badge badge--danger' }, t('missing.months', { count: member.monthsMissing })) : null),
      h('span', { class: 'muted' }, member.phone || '—'))));
}

function byGroup(missing) {
  const groups = new Map();
  missing.forEach(row => groups.set(row.group, [...(groups.get(row.group) || []), row]));
  return [...groups.entries()];
}

export function createMissingView(panel) {
  let data = null;
  let loading = false;

  async function load() {
    loading = true;
    render();
    try {
      data = await api.missing();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      loading = false;
      render();
    }
  }

  function content() {
    if (loading) return h('div', { class: 'notice' }, t('missing.loading'));
    if (!data) return h('div', { class: 'notice' }, t('missing.empty'));
    return [
      totals(data),
      data.missing.length ? messageCard(data.message) : null,
      h('div', { class: 'grid grid--wide' }, byGroup(data.missing).map(([group, members]) => groupCard(group, members))),
      data.inactive.length ? h('details', { class: 'card' },
        h('summary', {}, t('missing.inactiveSummary', { count: data.inactive.length })),
        h('ul', { class: 'plain-list' }, data.inactive.map(row => h('li', {}, `${row.name} — ${groupName(row.group)}`)))) : null,
    ];
  }

  function render() {
    replace(panel,
      h('div', { class: 'card' },
        h('div', { class: 'group__header' },
          h('h2', { class: 'card__title' }, data ? t('missing.titleWithMonth', { month: formatLabel(data.month) }) : t('missing.pageTitle')),
          h('div', { class: 'actions' },
            data ? h('a', { class: 'button', href: api.missingXlsxUrl(data.month), download: true }, t('common.downloadExcel')) : null,
            h('button', { class: 'button button--primary', id: 'refresh-missing-button', disabled: loading, onClick: load }, t('missing.refresh')))),
        h('p', { class: 'muted' }, t('missing.intro'))),
      content());
  }

  return { render, load };
}
