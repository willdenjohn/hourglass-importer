'use strict';

const BASE_URL = 'https://app.hourglass-app.com/api/v0.2';
const TIMEOUT = 30000;
const RETRY_DELAY = 1500;
const TEMPORARY_STATUSES = new Set([429, 502, 503, 504]);
const PERMISSION_SUBMIT = 'update reports';
const PERMISSION_SUMMARY = 'view summary';

function apiError(code, extras) {
  return Object.assign(new Error(code), { code, ...extras });
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function describeAccount({ whoami = {}, users = [], fsGroups = [], workingMonth, lastSubmittedMonth }) {
  const { user = {}, congregation = {}, permissions = [] } = whoami;
  return {
    user: {
      name: [user.firstname, user.lastname].filter(Boolean).join(' '),
      appointment: user.appt ?? null,
    },
    congregation: {
      name: congregation.name ?? '',
      number: congregation.number ?? null,
      country: congregation.country?.name ?? congregation.country ?? null,
      timezone: congregation.timezone?.name ?? null,
    },
    permissions: {
      submitReports: permissions.includes(PERMISSION_SUBMIT),
      viewSummary: permissions.includes(PERMISSION_SUMMARY),
    },
    openMonth: workingMonth ?? null,
    lastSubmittedMonth: lastSubmittedMonth ?? null,
    publishers: users.length,
    groups: fsGroups.map(group => group.name).sort(),
  };
}

function createClient({ hglogin, xsrf }) {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `hglogin=${hglogin}; X-Hourglass-XSRF-Token=${xsrf}`,
    'X-Hourglass-XSRF-Token': xsrf,
  };

  async function call(route, options) {
    let response;
    try {
      response = await fetch(`${BASE_URL}/${route}`, { headers, signal: AbortSignal.timeout(TIMEOUT), ...options });
    } catch (error) {
      throw apiError(error.name === 'TimeoutError' ? 'hourglass_timeout' : 'hourglass_unreachable', { temporary: true, status: 504 });
    }
    if (response.status === 401) throw apiError('session_expired', { status: 401 });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw apiError('hourglass_http', {
        status: response.status,
        temporary: TEMPORARY_STATUSES.has(response.status),
        params: { status: response.status, route, detail: body.slice(0, 200) },
      });
    }
    return response.json();
  }

  async function request(route, options = {}) {
    const isRead = !options.method || options.method === 'GET';
    try {
      return await call(route, options);
    } catch (error) {
      if (!isRead || !error.temporary) throw error;
      await wait(RETRY_DELAY);
      return call(route, options);
    }
  }

  let startup;
  const loadStartup = async () => (startup ??= await request('fsreport/startup'));

  return {
    async publishers() {
      return (await loadStartup()).users;
    },
    async groups() {
      return (await loadStartup()).fsGroups;
    },
    async account() {
      return describeAccount(await loadStartup());
    },
    async missingReports() {
      return request('fsreport/summary/missing');
    },
    async monthTotals() {
      return request('fsreport/summary/monthreporttotals');
    },
    async inactivePublishers() {
      const list = await request('fsreport/users/notpublishing');
      return list.map(user => ({ ...user, id: user.users_id }));
    },
    async reportsOfMonth(year, month) {
      const detail = await request(`fsreport/summary/monthdetail/${year}/${month}`);
      return detail.reports.filter(report => report.reported_at || report.id);
    },
    async reportOfPublisher(publisherId, year, month) {
      const { reports = [] } = await request(`fsreport/reports/${publisherId}`);
      return reports.find(report => report.year === year && report.month === month && (report.reported_at || report.id)) ?? null;
    },
    async createReport(report) {
      return request(`fsreport/reports/${report.user.id}`, { method: 'POST', body: JSON.stringify(report) });
    },
  };
}

module.exports = { createClient };
