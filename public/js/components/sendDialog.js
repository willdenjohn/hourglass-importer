import { h, replace } from '../dom.js';
import { t, renderError } from '../i18n.js';

function openDialog(content, footer) {
  const body = h('div', { class: 'dialog__body' }, content);
  const footerArea = h('div', { class: 'dialog__footer' }, footer);
  const dialog = h('dialog', { class: 'dialog' }, body, footerArea);
  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('close', close);
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, footerArea, close };
}

function pendingList(pending) {
  return h('ul', { class: 'plain-list' }, pending.map(entry => h('li', {}, h('strong', {}, entry.name), ` — ${entry.detail}`)));
}

export function showSimulation(result, label, onConfirm) {
  const { errors, pending, existing } = result;
  const word = t('send.confirmWord');
  const close = h('button', { class: 'button' }, t('common.close'));
  const confirmation = h('input', { class: 'input input--auto', id: 'send-confirmation', placeholder: t('send.typeWord', { word }), autocomplete: 'off' });
  const send = h('button', { class: 'button button--danger', id: 'confirm-send-button', disabled: true }, t('send.sendCount', { count: pending.length }));

  const content = errors.length
    ? [h('h2', { class: 'card__title' }, t('send.fixFirst')),
      h('ul', { class: 'plain-list' }, errors.map(entry => h('li', {}, `${t('send.row', { row: entry.row })} — ${entry.name}: ${entry.errors.map(renderError).join('; ')}`)))]
    : [h('h2', { class: 'card__title' }, t('send.simulationTitle', { period: label })),
      h('div', { class: `notice ${pending.length ? 'notice--success' : ''}` }, t('send.ready', { count: pending.length })),
      existing.length ? h('div', { class: 'notice notice--warning' }, t('send.existing', { count: existing.length, names: existing.join(', ') })) : null,
      pendingList(pending)];

  const canSend = !errors.length && pending.length > 0;
  const footer = canSend ? [h('span', { class: 'muted' }, t('send.confirmHint', { word })), confirmation, close, send] : [close];
  const opened = openDialog(content, footer);

  close.addEventListener('click', opened.close);
  confirmation.addEventListener('input', () => { send.disabled = confirmation.value.trim().toUpperCase() !== word.toUpperCase(); });
  send.addEventListener('click', () => onConfirm(opened));
}

export function showProgress({ dialog, body, footerArea }) {
  dialog.addEventListener('cancel', event => event.preventDefault());
  const bar = h('div', { class: 'progress__bar' });
  const counter = h('div', { class: 'muted', id: 'progress-counter' }, t('send.starting'));
  const log = h('ul', { class: 'plain-list', id: 'progress-log' });
  replace(body, h('h2', { class: 'card__title' }, t('send.sendingTitle')), h('div', { class: 'progress' }, bar), counter, log);
  replace(footerArea, h('span', { class: 'muted' }, t('send.keepOpen')));

  return {
    progress({ done, total, name, ok, error, errorParams, existed }) {
      bar.style.width = `${Math.round((done / total) * 100)}%`;
      counter.textContent = t('send.counter', { done, total });
      const text = existed ? `↺ ${t('send.existedLine', { name })}` : ok ? `✔ ${name}` : `✖ ${name}: ${renderError({ code: error, params: errorParams })}`;
      log.prepend(h('li', { class: ok ? '' : 'cell-alerts__item--error' }, text));
    },
    finish({ sent, failed, existed }, onClose) {
      bar.style.width = '100%';
      counter.textContent = [t('send.finished', { count: sent }), existed ? t('send.finishedExisted', { count: existed }) : null, failed ? t('send.finishedFailed', { count: failed }) : null].filter(Boolean).join(' ');
      const button = h('button', { class: 'button button--primary', id: 'view-missing-button' }, t('send.viewMissing'));
      button.addEventListener('click', onClose);
      replace(footerArea, button);
    },
  };
}
