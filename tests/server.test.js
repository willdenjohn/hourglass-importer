'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { startServer, formsSpreadsheet, parseNdjson } = require('./support');
const { generateTemplate } = require('../lib/template');
const { readReview } = require('../lib/review');
const { createTranslator } = require('../lib/i18n');

const PERIOD = 'month=9&year=2026';

async function prepareSeptember(app) {
  const uploaded = await app.call('/api/spreadsheet', 'POST', formsSpreadsheet());
  const prepared = await app.call(`/api/prepare?${PERIOD}`, 'POST', { id: uploaded.data.id, mapping: uploaded.data.mapping });
  return prepared.data.items;
}

const byName = (items, name) => items.find(item => item.formName === name);
const reviewFile = app => path.join(app.folder, 'reviews', 'review-2026-09.xlsx');

test('session, account and publishers', async () => {
  const app = await startServer();
  try {
    const session = await app.call('/api/session');
    assert.equal(session.data.valid, true);
    assert.equal(session.data.account.congregation.name, 'Example Congregation');
    assert.equal((await app.call('/api/session', 'POST', { hglogin: '', xsrf: '' })).status, 400);
    assert.equal((await app.call('/api/publishers')).data.length, 10);
  } finally {
    await app.close();
  }
});

test('importing the Forms export builds the expected review', async () => {
  const app = await startServer();
  try {
    const items = await prepareSeptember(app);
    assert.equal(items.length, 11);
    const ana = byName(items, 'Ana Clara Example');
    assert.equal(ana.id, 1001);
    assert.equal(ana.status, 'send');
    assert.equal(ana.participated, true);
    const bruno = byName(items, 'Bruno Test Fictional');
    assert.equal(bruno.status, 'review');
    assert.equal(bruno.credit, 15);
    assert.equal(bruno.studies, 2);
    assert.equal(byName(items, 'Carla Sample Silva').pioneer, 'Auxiliary');
    assert.equal(byName(items, 'Daniel Demo Costa').participated, false);
    assert.equal(byName(items, 'Unknown Person').status, 'not_found');
    assert.deepEqual(byName(items, 'Igor Inactive').alerts, [{ code: 'inactive_in_hourglass', params: { name: 'Igor Inactive' } }]);
    assert.equal(items.filter(item => item.formName === 'Fabio Example Lima' && item.status === 'ignore').length, 1);
    assert.ok(fs.existsSync(reviewFile(app)));
  } finally {
    await app.close();
  }
});

test('review spreadsheet is written in the chosen language and read back with codes', async () => {
  const app = await startServer({ language: 'pt-BR' });
  try {
    const items = await prepareSeptember(app);
    const sheet = xlsx.readFile(reviewFile(app));
    const rows = xlsx.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1 });
    assert.equal(rows[0][0], 'Situação');
    assert.ok(rows.some(row => row[0] === 'ENVIAR'));
    const back = readReview(reviewFile(app));
    assert.deepEqual(back.map(item => item.status), items.map(item => item.status));
    assert.deepEqual(byName(back, 'Bruno Test Fictional').alerts, byName(items, 'Bruno Test Fictional').alerts);
    assert.equal(byName(back, 'Carla Sample Silva').pioneer, 'Auxiliary');
  } finally {
    await app.close();
  }
});

test('mapping: required fields, remembered format and template', async () => {
  const app = await startServer();
  try {
    const uploaded = await app.call('/api/spreadsheet', 'POST', formsSpreadsheet());
    assert.equal(uploaded.data.remembered, false);
    const withoutName = await app.call(`/api/prepare?${PERIOD}`, 'POST', { id: uploaded.data.id, mapping: { ...uploaded.data.mapping, name: [] } });
    assert.equal(withoutName.status, 422);
    assert.equal(withoutName.data.error, 'columns_missing');
    await app.call(`/api/prepare?${PERIOD}`, 'POST', { id: uploaded.data.id, mapping: uploaded.data.mapping, remember: true });
    assert.equal((await app.call('/api/spreadsheet', 'POST', formsSpreadsheet())).data.remembered, true);
    const template = await app.call('/api/spreadsheet', 'POST', generateTemplate(createTranslator('es')));
    assert.deepEqual(template.data.missing, []);
    assert.equal((await app.call('/api/spreadsheet', 'POST', Buffer.from('not excel'))).status, 400);
    assert.equal((await app.call('/api/template.xlsx?lang=es')).status, 200);
  } finally {
    await app.close();
  }
});

test('errors come as codes and are translated to the requested language', async () => {
  const app = await startServer({ language: 'es' });
  try {
    const response = await app.call('/api/review?month=13&year=2026');
    assert.equal(response.status, 400);
    assert.equal(response.data.error, 'invalid_period');
    assert.equal(response.data.message, 'Mes o año no válido.');
  } finally {
    await app.close();
  }
});

test('simulation and sending with confirmation, log and review update', async () => {
  const app = await startServer();
  try {
    const items = await prepareSeptember(app);
    const simulation = await app.call(`/api/simulate?${PERIOD}`, 'POST', { items });
    assert.deepEqual(simulation.data.errors, []);
    const ready = simulation.data.pending.length;
    assert.ok(ready > 0);

    assert.equal((await app.call(`/api/send?${PERIOD}`, 'POST', { items })).status, 400);
    const sending = await app.call(`/api/send?${PERIOD}`, 'POST', { items, confirmation: 'SEND' });
    const end = parseNdjson(sending.data).find(event => event.type === 'end');
    assert.equal(end.sent, ready);
    assert.equal(app.hourglass.state.created.length, ready);
    assert.deepEqual(app.hourglass.state.created.find(report => report.user.id === 1001), { id: 0, user: { id: 1001 }, month: 9, year: 2026, minutes: 1, studies: 1, credithours: null, pioneer: null, remarks: null });

    const log = fs.readFileSync(path.join(app.folder, 'reviews', 'submissions-2026-09.log'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(log.length, ready);
    assert.ok(log.every(entry => entry.origin === 'interface' && entry.result === 'sent'));
    assert.equal(readReview(reviewFile(app)).filter(item => item.status === 'already_sent').length, ready);

    const again = parseNdjson((await app.call(`/api/send?${PERIOD}`, 'POST', { items, confirmation: 'SEND' })).data);
    assert.equal(again.find(event => event.type === 'end').sent, 0);
    assert.equal(app.hourglass.state.created.length, ready);
  } finally {
    await app.close();
  }
});

test('sending blocks validation errors and duplicate rows for the same publisher', async () => {
  const app = await startServer();
  try {
    const items = await prepareSeptember(app);
    const highCredit = items.map(item => (item.formName === 'Elisa Demo Souza' ? { ...item, credit: 10 } : item));
    const simulation = await app.call(`/api/simulate?${PERIOD}`, 'POST', { items: highCredit });
    assert.ok(simulation.data.errors.some(entry => entry.errors.some(error => error.code === 'credit_over_limit')));
    assert.equal((await app.call(`/api/send?${PERIOD}`, 'POST', { items: highCredit, confirmation: 'SEND' })).status, 422);

    const duplicated = items.map(item => (item.formName === 'Giovana Test Rocha' ? { ...item, id: 1008 } : item));
    const duplicatedSimulation = await app.call(`/api/simulate?${PERIOD}`, 'POST', { items: duplicated });
    assert.ok(duplicatedSimulation.data.errors.some(entry => entry.errors.some(error => error.code === 'duplicate_publisher')));
    assert.equal(app.hourglass.state.created.length, 0);
  } finally {
    await app.close();
  }
});

test('concurrent submissions do not duplicate reports', async () => {
  const app = await startServer();
  try {
    const items = await prepareSeptember(app);
    const body = { items, confirmation: 'SEND' };
    const [a, b] = await Promise.all([
      app.call(`/api/send?${PERIOD}`, 'POST', body),
      new Promise(resolve => setTimeout(resolve, 10)).then(() => app.call(`/api/send?${PERIOD}`, 'POST', body)),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const ids = app.hourglass.state.created.map(report => report.user.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(!fs.existsSync(path.join(app.folder, '.send.lock')));
  } finally {
    await app.close();
  }
});

test('lock from another process blocks and a stale lock is discarded', async () => {
  const app = await startServer();
  try {
    const items = await prepareSeptember(app);
    const lock = path.join(app.folder, '.send.lock');
    fs.writeFileSync(lock, '{}');
    assert.equal((await app.call(`/api/send?${PERIOD}`, 'POST', { items, confirmation: 'SEND' })).status, 409);
    const old = new Date(Date.now() - 31 * 60 * 1000);
    fs.utimesSync(lock, old, old);
    assert.equal((await app.call(`/api/send?${PERIOD}`, 'POST', { items, confirmation: 'SEND' })).status, 200);
    assert.ok(!fs.existsSync(lock));
  } finally {
    await app.close();
  }
});

test('temporary Hourglass failures are recovered without duplicates', async () => {
  const app = await startServer({ fake: { failures: { 1001: 'after-saving', 1006: 'before-saving', 1007: 'permanent' } } });
  try {
    const items = await prepareSeptember(app);
    const end = parseNdjson((await app.call(`/api/send?${PERIOD}`, 'POST', { items, confirmation: 'SEND' })).data).find(event => event.type === 'end');
    assert.equal(end.failed, 1);
    const ids = app.hourglass.state.created.map(report => report.user.id);
    assert.equal(ids.filter(id => id === 1001).length, 1);
    assert.equal(ids.filter(id => id === 1006).length, 1);
    assert.ok(!ids.includes(1007));
  } finally {
    await app.close();
  }
});

test('sending requires permission to submit reports', async () => {
  const app = await startServer({ fake: { permissions: ['view summary'] } });
  try {
    const items = await prepareSeptember(app);
    const response = await app.call(`/api/send?${PERIOD}`, 'POST', { items, confirmation: 'SEND' });
    assert.equal(response.status, 403);
    assert.equal(response.data.error, 'no_submit_permission');
  } finally {
    await app.close();
  }
});

test('missing reports and the share message follow the language', async () => {
  const app = await startServer({ language: 'pt-BR' });
  try {
    const missing = await app.call('/api/missing');
    assert.equal(missing.data.missing.length, 9);
    assert.match(missing.data.message, /^Olá!/);
    assert.match(missing.data.message, /09\/2026/);
    assert.match(missing.data.message, /\*GROUP 1\*/);
    assert.equal((await app.call('/api/missing.xlsx?label=2026-09')).status, 200);
    assert.equal((await app.call('/api/missing.xlsx?label=../x')).status, 400);
  } finally {
    await app.close();
  }
});

test('protections: origin, host, path, invalid JSON, cache and locales', async () => {
  const app = await startServer();
  try {
    assert.equal((await app.call('/api/aliases', 'POST', { name: 'X', id: 1 }, { Origin: 'https://strange-site.example' })).status, 403);
    assert.equal((await app.call('/api/aliases', 'POST', { name: 'X', id: 1 }, { Origin: 'chrome-extension://abc' })).status, 200);
    assert.equal((await app.call('/..%2f..%2fserver.js')).status, 404);
    assert.equal((await app.call('/locales/..%2fpackage.json')).status, 404);
    assert.equal((await app.call('/locales/es.json')).data['app.title'], 'Importador Hourglass');
    const broken = await fetch(`${app.base}/api/aliases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(broken.status, 400);
    await app.call('/api/session');
    const before = app.hourglass.state.clients;
    await app.call('/api/session');
    await app.call('/api/publishers');
    await app.call('/api/missing');
    assert.equal(app.hourglass.state.clients, before);
  } finally {
    await app.close();
  }
});
