import { currentLanguage, renderError } from './i18n.js';

let renewSession = null;

export function setSessionRenewal(handler) {
  renewSession = handler;
}

function apiError(data, status) {
  const code = data?.error ?? 'internal_error';
  return Object.assign(new Error(renderError({ code, params: data?.params }) || `Error ${status}`), { code, status });
}

function withLanguage(options = {}) {
  return { ...options, headers: { ...(options.headers ?? {}), 'X-Language': currentLanguage() } };
}

async function request(route, options = {}, attempt = 1) {
  const response = await fetch(route, withLanguage(options));
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;
  const canRenew = response.status === 401 && route !== '/api/session' && attempt === 1 && renewSession;
  if (canRenew && await renewSession()) return request(route, options, 2);
  if (!response.ok) throw apiError(data, response.status);
  return data;
}

function json(method, data) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

const query = ({ month, year }) => `month=${month}&year=${year}&lang=${encodeURIComponent(currentLanguage())}`;

export const api = {
  session: () => request('/api/session'),
  saveSession: data => request('/api/session', json('POST', data)),
  publishers: () => request('/api/publishers'),
  uploadSpreadsheet: file => request('/api/spreadsheet', { method: 'POST', body: file }),
  spreadsheetSample: (id, mapping) => request('/api/spreadsheet/sample', json('POST', { id, mapping })),
  prepare: (period, data) => request(`/api/prepare?${query(period)}`, json('POST', data)),
  review: period => request(`/api/review?${query(period)}`),
  saveReview: (period, items) => request(`/api/review?${query(period)}`, json('PUT', { items })),
  simulate: (period, items) => request(`/api/simulate?${query(period)}`, json('POST', { items })),
  saveAlias: (name, id) => request('/api/aliases', json('POST', { name, id })),
  missing: () => request('/api/missing'),
  reviewXlsxUrl: period => `/api/review.xlsx?${query(period)}`,
  missingXlsxUrl: label => `/api/missing.xlsx?label=${label}&lang=${encodeURIComponent(currentLanguage())}`,
  templateUrl: () => `/api/template.xlsx?lang=${encodeURIComponent(currentLanguage())}`,

  async send(period, items, onEvent) {
    const response = await fetch(`/api/send?${query(period)}`, withLanguage(json('POST', { items, confirmation: 'SEND' })));
    if (!response.ok) throw apiError(await response.json().catch(() => ({})), response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop();
      lines.filter(Boolean).forEach(line => onEvent(JSON.parse(line)));
    }
  },
};
