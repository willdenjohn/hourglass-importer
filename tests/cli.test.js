'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { temporaryFolder, SESSION } = require('./support');
const { writeReview, readReview } = require('../lib/review');
const { createTranslator } = require('../lib/i18n');

const ROOT = path.join(__dirname, '..');
const FAKE = path.join(__dirname, 'fake-hourglass-http.js');
const environment = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };

function copy(source, destination) {
  if (!fs.statSync(source).isDirectory()) return fs.copyFileSync(source, destination);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name));
}

function projectCopy() {
  const folder = temporaryFolder();
  for (const item of ['cli.js', 'server.js', 'lib', 'public', 'locales']) copy(path.join(ROOT, item), path.join(folder, item));
  fs.writeFileSync(path.join(folder, 'session.json'), JSON.stringify(SESSION));
  return folder;
}

function run(folder, args, input = '') {
  return spawnSync(process.execPath, ['-r', FAKE, ...args], { cwd: folder, input, encoding: 'utf8', env: environment, timeout: 30000 });
}

function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => reject(new Error(`no output: ${text}`)), 10000);
    child.stdout.on('data', part => {
      text += part;
      if (pattern.test(text)) { clearTimeout(timeout); resolve(text); }
    });
  });
}

function writeSampleReview(folder) {
  fs.mkdirSync(path.join(folder, 'reviews'));
  const file = path.join(folder, 'reviews', 'review-2026-09.xlsx');
  writeReview(file, [
    { status: 'send', row: 2, id: 2001, formName: 'Ana', hourglassName: 'Ana Clara Example', participated: true, studies: 1, alerts: [] },
    { status: 'send', row: 3, id: 2002, formName: 'Bruno', hourglassName: 'Bruno Test Fictional', hours: 50, credit: 5, pioneer: 'Regular', alerts: [] },
  ], createTranslator('en'));
  return file;
}

test('command line: template, simulation, sending, log and review update', () => {
  const folder = projectCopy();
  assert.match(run(folder, ['cli.js', 'template', '--lang=en']).stdout, /Template created/);
  assert.ok(fs.existsSync(path.join(folder, 'report-template.xlsx')));
  assert.match(run(folder, ['cli.js', 'template', '--lang=es']).stdout, /Plantilla creada/);

  const review = writeSampleReview(folder);
  assert.match(run(folder, ['cli.js', 'send', 'reviews/review-2026-09.xlsx', '--lang=en']).stdout, /2 reports would be sent/);
  assert.match(run(folder, ['cli.js', 'send', 'reviews/review-2026-09.xlsx', '--execute', '--lang=en'], 'no\n').stdout, /Cancelled/);

  const sending = run(folder, ['cli.js', 'send', 'reviews/review-2026-09.xlsx', '--execute', '--lang=pt-BR'], 'ENVIAR\n');
  assert.match(sending.stdout, /conferência atualizada/);
  assert.ok(readReview(review).every(item => item.status === 'already_sent'));
  const log = fs.readFileSync(path.join(folder, 'reviews', 'submissions-2026-09.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(log.length, 2);
  assert.ok(log.every(entry => entry.origin === 'command line' && entry.result === 'sent'));
  assert.ok(!fs.existsSync(path.join(folder, '.send.lock')));
});

test('command line respects another submission lock', () => {
  const folder = projectCopy();
  writeSampleReview(folder);
  fs.writeFileSync(path.join(folder, '.send.lock'), '{}');
  const sending = run(folder, ['cli.js', 'send', 'reviews/review-2026-09.xlsx', '--execute', '--lang=en'], 'SEND\n');
  assert.match(sending.stderr + sending.stdout, /already in progress/);
});

test('server: address on start, port in use and 10 MB limit', async () => {
  const folder = projectCopy();
  const occupant = http.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => occupant.once('listening', resolve));
  const busyPort = occupant.address().port;
  const busy = spawnSync(process.execPath, ['server.js'], { cwd: folder, env: { ...environment, PORT: String(busyPort) }, encoding: 'utf8', timeout: 10000 });
  assert.match(busy.stdout, new RegExp(`localhost:${busyPort}`));
  assert.equal(busy.status, 1);
  occupant.close();

  const free = http.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => free.once('listening', resolve));
  const port = free.address().port;
  await new Promise(resolve => free.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: folder, env: { ...environment, PORT: String(port) } });
  try {
    assert.match(await waitForOutput(child, new RegExp(`localhost:${port}`)), new RegExp(`localhost:${port}`));
    const large = await fetch(`http://localhost:${port}/api/spreadsheet`, { method: 'POST', body: Buffer.alloc(11 * 1024 * 1024) })
      .then(response => response.status, () => 'connection closed');
    assert.ok(large === 413 || large === 'connection closed', `received: ${large}`);
    assert.equal((await fetch(`http://localhost:${port}/api/session`)).status, 200);
  } finally {
    child.kill();
  }
});
