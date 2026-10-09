'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ONE_HOUR = 60 * 60 * 1000;
const EXTENSION = path.join(__dirname, '..', 'extension');

function token(expiresAt) {
  return 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ exp: Math.floor(expiresAt / 1000) })).toString('base64url') + '.x';
}

function loadExtension({ importer }) {
  const storage = {};
  const cookies = {};
  const badge = {};
  let listener;
  const chrome = {
    storage: { local: { get: async keys => Object.fromEntries(keys.filter(key => key in storage).map(key => [key, storage[key]])), set: async data => Object.assign(storage, data) }, onChanged: { addListener() {} } },
    cookies: { get: async ({ name }) => (cookies[name] ? { value: cookies[name] } : null) },
    action: { setBadgeText: async ({ text }) => { badge.text = text; }, setBadgeBackgroundColor: async () => {}, setTitle: async ({ title }) => { badge.title = title; } },
    runtime: { onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    i18n: { getMessage: key => key },
  };
  const code = fs.readFileSync(path.join(EXTENSION, 'service-worker.js'), 'utf8');
  vm.runInNewContext(code, { chrome, fetch: importer, atob, Date, JSON, Promise, Boolean, Object, decodeURIComponent });
  const send = message => new Promise(resolve => listener(message, {}, resolve));
  return { send, cookies, badge };
}

function fakeImporter({ valid = false, running = true } = {}) {
  const received = [];
  const fakeFetch = async (url, options = {}) => {
    if (!running) throw new Error('refused');
    if (options.method === 'POST') {
      received.push(JSON.parse(options.body));
      valid = true;
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify({ configured: true, valid }), { status: 200 });
  };
  return { fakeFetch, received };
}

test('without a Hourglass login it asks the user to log in', async () => {
  const { fakeFetch } = fakeImporter();
  const extension = loadExtension({ importer: fakeFetch });
  assert.equal((await extension.send({ action: 'sync' })).reason, 'not_logged_in');
});

test('an expired login is not sent', async () => {
  const { fakeFetch, received } = fakeImporter();
  const extension = loadExtension({ importer: fakeFetch });
  Object.assign(extension.cookies, { hglogin: token(Date.now() - 1000), 'X-Hourglass-XSRF-Token': 'x' });
  assert.equal((await extension.send({ action: 'sync' })).reason, 'expired');
  assert.equal(received.length, 0);
});

test('sends the session only when the importer needs it', async () => {
  const { fakeFetch, received } = fakeImporter();
  const extension = loadExtension({ importer: fakeFetch });
  Object.assign(extension.cookies, { hglogin: token(Date.now() + ONE_HOUR), 'X-Hourglass-XSRF-Token': 'abc%3D' });
  assert.equal((await extension.send({ action: 'sync' })).reason, 'sent');
  assert.equal(received[0].xsrf, 'abc=');
  assert.equal((await extension.send({ action: 'sync' })).reason, 'already_valid');
  assert.equal((await extension.send({ action: 'sync', force: true })).reason, 'sent');
  assert.equal(received.length, 2);
});

test('turned off it reads no cookies and shows OFF', async () => {
  const { fakeFetch, received } = fakeImporter();
  const extension = loadExtension({ importer: fakeFetch });
  Object.assign(extension.cookies, { hglogin: token(Date.now() + ONE_HOUR), 'X-Hourglass-XSRF-Token': 'x' });
  await extension.send({ action: 'setActive', active: false });
  assert.equal(extension.badge.text, 'OFF');
  assert.equal(extension.badge.title, 'titleInactive');
  assert.equal((await extension.send({ action: 'sync', force: true })).reason, 'disabled');
  assert.equal(received.length, 0);
  await extension.send({ action: 'setActive', active: true });
  assert.equal(extension.badge.text, 'ON');
});

test('a closed importer is reported in the diagnostics', async () => {
  const { fakeFetch } = fakeImporter({ running: false });
  const extension = loadExtension({ importer: fakeFetch });
  assert.equal((await extension.send({ action: 'sync' })).reason, 'importer_offline');
  const diagnostics = await extension.send({ action: 'diagnostics' });
  assert.equal(diagnostics.importerRunning, false);
  assert.equal(diagnostics.hourglassLoggedIn, false);
});

test('every reason and popup text exists in the three extension languages', () => {
  const read = language => JSON.parse(fs.readFileSync(path.join(EXTENSION, '_locales', language, 'messages.json'), 'utf8'));
  const english = Object.keys(read('en')).sort();
  for (const language of ['pt_BR', 'es']) assert.deepEqual(Object.keys(read(language)).sort(), english, language);
  const code = fs.readFileSync(path.join(EXTENSION, 'service-worker.js'), 'utf8');
  const reasons = [...code.matchAll(/reason: (?:response\.ok \? )?'(\w+)'(?: : '(\w+)')?/g)].flatMap(match => [match[1], match[2]]).filter(Boolean);
  for (const reason of reasons) assert.ok(english.includes(`reason_${reason}`), reason);
});
