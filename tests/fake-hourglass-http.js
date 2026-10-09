'use strict';

const reports = [];
const users = [
  { id: 2001, firstname: 'Ana', middlename: 'Clara', lastname: 'Example', status: 'Baptized Publisher', group_id: 1 },
  { id: 2002, firstname: 'Bruno', middlename: 'Test', lastname: 'Fictional', status: 'Regular Pioneer', group_id: 1 },
];
const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const originalFetch = global.fetch;

global.fetch = async (url, options = {}) => {
  if (!String(url).startsWith('https://app.hourglass-app.com')) return originalFetch(url, options);
  const route = String(url).replace('https://app.hourglass-app.com/api/v0.2/', '');
  if (route === 'fsreport/startup') {
    return respond({ whoami: { user: {}, congregation: {}, permissions: ['update reports'] }, users, fsGroups: [{ id: 1, name: 'GROUP 1' }], workingMonth: '2026-09' });
  }
  if (route.startsWith('fsreport/summary/monthdetail/')) return respond({ reports });
  if (route === 'fsreport/users/notpublishing') return respond([]);
  if (route.startsWith('fsreport/reports/') && options.method === 'POST') {
    const body = JSON.parse(options.body);
    reports.push({ ...body, id: reports.length + 1, reported_at: 'now' });
    return respond(body);
  }
  if (route.startsWith('fsreport/reports/')) {
    const id = Number(route.split('/').pop());
    return respond({ reports: reports.filter(report => report.user.id === id) });
  }
  if (route === 'fsreport/summary/missing') return respond({ missing: [] });
  if (route === 'fsreport/summary/monthreporttotals') {
    return respond({ month: '2026-09', userCount: 2, missingUserIds: [], enteredByAdminUserIds: [], enteredBySelfUserIds: [], inactiveUserIds: [] });
  }
  return respond({ error: `route not simulated: ${route}` }, 404);
};
