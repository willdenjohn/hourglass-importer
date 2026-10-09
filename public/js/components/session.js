import { h, replace, notify, formatDate } from '../dom.js';
import { api } from '../api.js';
import { state, update } from '../state.js';
import { t, currentLocale } from '../i18n.js';

function sessionStatus(session) {
  if (!session) return h('div', { class: 'notice' }, t('session.checking'));
  if (!session.configured) return h('div', { class: 'notice notice--warning' }, t('session.notConfigured'));
  if (!session.valid) return h('div', { class: 'notice notice--danger' }, t(`error.${session.error ?? 'session_invalid'}`));
  return h('div', { class: 'notice notice--success' },
    t('session.connected', { count: session.publishers }),
    session.expires ? ` ${t('session.validUntil', { date: formatDate(session.expires) })}` : '');
}

function monthName(label) {
  if (!label) return '—';
  const [year, month] = label.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
}

function permissionBadge(granted, label) {
  return h('span', { class: `badge ${granted ? 'badge--success' : 'badge--danger'}` }, `${granted ? '✔' : '✖'} ${label}`);
}

function accountDetails(account) {
  if (!account) return null;
  const line = (label, value) => h('div', {}, h('div', { class: 'muted' }, label), h('strong', {}, value || '—'));
  const appointment = account.user.appointment ? t(`appointment.${account.user.appointment}`) : null;
  return h('div', { class: 'card', id: 'account-details' },
    h('h3', { class: 'card__title' }, t('account.title')),
    h('div', { class: 'grid' },
      line(t('account.user'), [account.user.name, appointment].filter(Boolean).join(' · ')),
      line(t('account.congregation'), account.congregation.name),
      line(t('account.number'), account.congregation.number),
      line(t('account.countryTimezone'), [account.congregation.country, account.congregation.timezone].filter(Boolean).join(' · ')),
      line(t('account.openMonth'), monthName(account.openMonth)),
      line(t('account.lastSubmittedMonth'), monthName(account.lastSubmittedMonth)),
      line(t('account.activePublishers'), account.publishers),
      line(t('account.groups'), account.groups.join(', '))),
    h('div', { class: 'actions' },
      permissionBadge(account.permissions.submitReports, t('account.permission.submit')),
      permissionBadge(account.permissions.viewSummary, t('account.permission.summary'))));
}

function extensionBadge(extension) {
  if (!extension.present) return [t('extension.notInstalled'), 'badge'];
  return extension.active ? [t('extension.active'), 'badge badge--success'] : [t('extension.inactive'), 'badge badge--warning'];
}

function extensionCard(connect) {
  const { extension, syncingExtension, extensionResult } = state;
  const [label, className] = extensionBadge(extension);
  const result = extensionResult && h('div', { class: `notice ${extensionResult.ok ? 'notice--success' : 'notice--warning'}` }, t(`extension.reason.${extensionResult.reason}`));
  const button = h('button', {
    class: 'button button--primary', id: 'connect-extension-button',
    disabled: !extension.active || syncingExtension,
    onClick: () => connect(true),
  }, syncingExtension ? t('extension.connecting') : t('extension.connect'));

  return h('div', { class: 'card', id: 'extension-card' },
    h('div', { class: 'group__header' },
      h('h3', { class: 'card__title' }, t('extension.title')),
      h('span', { class: className, id: 'extension-badge' }, label)),
    h('p', { class: 'muted' }, extension.present ? t('extension.descriptionInstalled') : t('extension.descriptionMissing')),
    result,
    extension.present ? h('div', { class: 'actions' }, button) : null);
}

function instructions() {
  return h('ol', { class: 'plain-list muted' },
    h('li', {}, t('session.step1')),
    h('li', {}, t('session.step2')),
    h('li', {}, t('session.step3')));
}

function sessionForm(onSave) {
  const hglogin = h('textarea', { class: 'input input--mono', id: 'hglogin-field', rows: 3, placeholder: t('session.hgloginPlaceholder'), spellcheck: false });
  const xsrf = h('input', { class: 'input input--mono', id: 'xsrf-field', placeholder: t('session.xsrfPlaceholder'), spellcheck: false });
  const button = h('button', { class: 'button button--primary', type: 'submit' }, t('session.save'));

  async function submit(event) {
    event.preventDefault();
    button.disabled = true;
    try {
      await onSave({ hglogin: hglogin.value, xsrf: xsrf.value });
      hglogin.value = '';
      xsrf.value = '';
    } finally {
      button.disabled = false;
    }
  }

  return h('form', { onSubmit: submit },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'hglogin'), hglogin),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'X-Hourglass-XSRF-Token'), xsrf),
    h('div', { class: 'actions' }, button));
}

export function createSessionView(panel, connectThroughExtension) {
  async function save(data) {
    try {
      const session = await api.saveSession(data);
      update({ session });
      notify(t('session.saved'));
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function render() {
    replace(panel,
      h('div', { class: 'card' },
        h('h2', { class: 'card__title' }, t('session.title')),
        sessionStatus(state.session)),
      accountDetails(state.session?.valid ? state.session.account : null),
      extensionCard(connectThroughExtension),
      h('details', { class: 'card', id: 'manual-card', open: !state.extension.present && !state.session?.valid },
        h('summary', { class: 'card__title' }, state.session?.valid ? t('session.changeManually') : t('session.connectManually')),
        instructions(),
        sessionForm(save),
        h('p', { class: 'muted' }, t('session.privacy'))));
  }

  return { render };
}
