'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../lib/api');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('sends cookies and the XSRF header', async () => {
  let received;
  global.fetch = async (url, options) => { received = { url, options }; return json({ missing: [] }); };
  await createClient({ hglogin: 'abc', xsrf: 'xyz' }).missingReports();
  assert.equal(received.url, 'https://app.hourglass-app.com/api/v0.2/fsreport/summary/missing');
  assert.equal(received.options.headers.Cookie, 'hglogin=abc; X-Hourglass-XSRF-Token=xyz');
  assert.equal(received.options.headers['X-Hourglass-XSRF-Token'], 'xyz');
  assert.ok(received.options.signal);
});

test('a read that times out is retried once and reports a code', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
  await assert.rejects(createClient({ hglogin: 'a', xsrf: 'b' }).missingReports(), error => error.code === 'hourglass_timeout');
  assert.equal(calls, 2);
});

test('a read answered with 503 recovers on the second attempt', async () => {
  let calls = 0;
  global.fetch = async () => (++calls === 1 ? json({}, 503) : json({ missing: [1] }));
  assert.deepEqual((await createClient({ hglogin: 'a', xsrf: 'b' }).missingReports()).missing, [1]);
});

test('creating a report is never blindly retried', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return json({}, 503); };
  await assert.rejects(createClient({ hglogin: 'a', xsrf: 'b' }).createReport({ user: { id: 1 } }), error => error.temporary === true && error.code === 'hourglass_http');
  assert.equal(calls, 1);
});

test('401 becomes a session expired error', async () => {
  global.fetch = async () => json({}, 401);
  await assert.rejects(createClient({ hglogin: 'a', xsrf: 'b' }).missingReports(), error => error.status === 401 && error.code === 'session_expired');
});

test('account details come from the startup data', async () => {
  global.fetch = async () => json({
    whoami: { user: { firstname: 'Test', lastname: 'Example', appt: 'Elder' }, congregation: { name: 'Example Congregation', number: 1, country: { name: 'Brazil' } }, permissions: ['update reports'] },
    users: [{}, {}], fsGroups: [{ name: 'GROUP 2' }, { name: 'GROUP 1' }], workingMonth: '2026-09', lastSubmittedMonth: '2026-08',
  });
  const account = await createClient({ hglogin: 'a', xsrf: 'b' }).account();
  assert.equal(account.user.name, 'Test Example');
  assert.equal(account.user.appointment, 'Elder');
  assert.equal(account.permissions.submitReports, true);
  assert.equal(account.permissions.viewSummary, false);
  assert.deepEqual(account.groups, ['GROUP 1', 'GROUP 2']);
  assert.equal(account.lastSubmittedMonth, '2026-08');
});
