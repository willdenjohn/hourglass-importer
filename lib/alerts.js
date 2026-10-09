'use strict';

const TRANSLATED_PARAMS = { registry: 'registry', type: 'formType' };

function renderMessage(t, prefix, message) {
  if (!message) return '';
  if (typeof message === 'string') return message;
  if (message.code === 'text') return message.params?.text ?? '';
  const params = { ...(message.params ?? {}) };
  for (const [name, translationPrefix] of Object.entries(TRANSLATED_PARAMS)) {
    if (params[name]) params[name] = t(`${translationPrefix}.${params[name]}`);
  }
  if (Array.isArray(params.fields)) params.fields = params.fields.map(field => t(`field.${field}`)).join(', ');
  return t(`${prefix}.${message.code}`, params);
}

const renderAlert = (t, alert) => renderMessage(t, 'alert', alert);
const renderError = (t, error) => renderMessage(t, 'error', error);

module.exports = { renderMessage, renderAlert, renderError };
