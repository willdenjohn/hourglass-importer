'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const spreadsheet = require('./lib/spreadsheet');
const { generateTemplate } = require('./lib/template');
const { fullName } = require('./lib/matching');
const { createClient: createRealClient } = require('./lib/api');
const { writeReview, readReview } = require('./lib/review');
const { loadSession, saveSession, normalizeSession, isSessionFilled, expiration } = require('./lib/session');
const { collectMissing, saveMissing, shareMessage } = require('./lib/missing');
const { createTranslator, LANGUAGES } = require('./lib/i18n');
const { renderError } = require('./lib/alerts');
const { migrateLegacyFiles } = require('./lib/migration');
const {
  paths, summarize, prepareReview, validateSubmission, sendReports, describeReport, saveAlias, markSent, withLock, createLog,
} = require('./lib/service');

const PORT = Number(process.env.PORT) || 3434;
const PUBLIC_FOLDER = path.join(__dirname, 'public');
const LOCALES_FOLDER = path.join(__dirname, 'locales');
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_SPREADSHEETS = 5;
const EXAMPLES_PER_COLUMN = 3;
const MAX_BODY_SIZE = 10 * 1024 * 1024;
const CACHE_TTL = 5 * 60 * 1000;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

class HttpError extends Error {
  constructor(status, code, params) {
    super(code);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', part => {
      size += part.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new HttpError(413, 'body_too_large'));
        return;
      }
      parts.push(part);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_data');
  }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendXlsx(res, content, name) {
  res.writeHead(200, { 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="${name}"` });
  res.end(content);
}

function sendFile(res, file, name) {
  if (!fs.existsSync(file)) throw new HttpError(404, 'file_not_found');
  sendXlsx(res, fs.readFileSync(file), name);
}

function serveStatic(res, route) {
  const fromLocales = route.startsWith('/locales/');
  const base = fromLocales ? LOCALES_FOLDER : PUBLIC_FOLDER;
  const relative = route === '/' ? 'index.html' : route.slice(fromLocales ? '/locales/'.length : 1);
  const file = path.normalize(path.join(base, relative));
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) throw new HttpError(404, 'page_not_found');
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function isOriginAllowed(req) {
  if (!LOCAL_HOST.test(req.headers.host ?? '')) return false;
  const origin = req.headers.origin;
  if (!origin || req.method === 'GET') return true;
  if (origin.startsWith('chrome-extension://')) return true;
  return origin === `http://${req.headers.host}`;
}

function requestLanguage(req, url) {
  return url.searchParams.get('lang') || req.headers['x-language'] || (req.headers['accept-language'] ?? '').split(',')[0];
}

function period(url) {
  const month = Number(url.searchParams.get('month'));
  const year = Number(url.searchParams.get('year'));
  if (!(month >= 1 && month <= 12) || !(year >= 2020 && year <= 2100)) throw new HttpError(400, 'invalid_period');
  return { month, year };
}

function columnExamples({ titles, rows }) {
  return titles.map((_, index) => [...new Set(rows.map(row => row[index]).filter(value => value !== null && String(value).trim() !== '').map(String))].slice(0, EXAMPLES_PER_COLUMN));
}

function normalizeMapping(mapping, columnCount) {
  return Object.fromEntries(spreadsheet.FIELDS.map(({ key }) => {
    const indexes = [mapping?.[key] ?? []].flat().map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < columnCount);
    return [key, [...new Set(indexes)]];
  }));
}

function publisherSummary(publisher) {
  return { id: publisher.id, name: fullName(publisher), status: publisher.status, group: publisher.group_id };
}

function createApp({ folder = __dirname, createClient = createRealClient } = {}) {
  const files = paths(folder);
  const spreadsheets = new Map();
  let cached = null;

  function storeSpreadsheet(content) {
    const id = Math.random().toString(36).slice(2, 10);
    spreadsheets.set(id, content);
    if (spreadsheets.size > MAX_SPREADSHEETS) spreadsheets.delete(spreadsheets.keys().next().value);
    return id;
  }

  function storedSpreadsheet(id) {
    const content = spreadsheets.get(id);
    if (!content) throw new HttpError(404, 'spreadsheet_not_found');
    return content;
  }

  function clientFor(session) {
    const valid = cached && cached.token === session.hglogin && Date.now() - cached.createdAt < CACHE_TTL;
    if (!valid) cached = { token: session.hglogin, createdAt: Date.now(), client: createClient(session) };
    return cached.client;
  }

  function client() {
    const session = loadSession(folder);
    if (!session) throw new HttpError(401, 'session_not_configured');
    return clientFor(session);
  }

  async function sessionState() {
    const session = loadSession(folder);
    if (!session) return { configured: false };
    const expires = expiration(session.hglogin);
    try {
      const account = await clientFor(session).account();
      return { configured: true, valid: true, expires, publishers: account.publishers, account };
    } catch (error) {
      cached = null;
      return { configured: true, valid: false, expires, error: error.code ?? 'session_invalid' };
    }
  }

  const routes = {
    'GET /api/session': async ({ res }) => sendJson(res, await sessionState()),

    'POST /api/session': async ({ req, res }) => {
      const session = normalizeSession(await readJson(req));
      if (!isSessionFilled(session)) throw new HttpError(400, 'session_incomplete');
      await createClient(session).publishers().catch(error => { throw new HttpError(401, error.code ?? 'session_invalid'); });
      saveSession(folder, session);
      sendJson(res, await sessionState());
    },

    'GET /api/publishers': async ({ res }) => {
      const publishers = await client().publishers();
      sendJson(res, publishers.map(publisherSummary).sort((a, b) => a.name.localeCompare(b.name)));
    },

    'GET /api/template.xlsx': async ({ res, t }) => sendXlsx(res, generateTemplate(t), `${t('template.fileName')}.xlsx`),

    'POST /api/spreadsheet': async ({ req, res }) => {
      let content;
      try {
        content = spreadsheet.openSpreadsheet(await readBody(req));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, 'spreadsheet_unreadable');
      }
      if (!content.titles.length || !content.rows.length) throw new HttpError(400, 'spreadsheet_empty');
      const remembered = spreadsheet.rememberedMapping(files.mappings, content.titles);
      const mapping = remembered ?? spreadsheet.suggestMapping(content.titles);
      sendJson(res, {
        id: storeSpreadsheet(content),
        fields: spreadsheet.FIELDS,
        titles: content.titles,
        examples: columnExamples(content),
        rowCount: content.rows.length,
        remembered: Boolean(remembered),
        mapping,
        missing: spreadsheet.validateMapping(mapping),
        sample: spreadsheet.sample(content, mapping),
      });
    },

    'POST /api/spreadsheet/sample': async ({ req, res }) => {
      const { id, mapping } = await readJson(req);
      const content = storedSpreadsheet(id);
      const normalized = normalizeMapping(mapping, content.titles.length);
      sendJson(res, { missing: spreadsheet.validateMapping(normalized), sample: spreadsheet.sample(content, normalized) });
    },

    'POST /api/prepare': async ({ req, res, url, t }) => {
      const { month, year } = period(url);
      const { id, mapping, remember } = await readJson(req);
      const content = storedSpreadsheet(id);
      const normalized = normalizeMapping(mapping, content.titles.length);
      const missing = spreadsheet.validateMapping(normalized);
      if (missing.length) throw new HttpError(422, 'columns_missing', { fields: missing });
      if (remember) spreadsheet.rememberMapping(files.mappings, content.titles, normalized);
      const answers = spreadsheet.readAnswers(content, normalized);
      const result = await prepareReview(client(), answers, month, year, files.aliases);
      fs.mkdirSync(files.reviews, { recursive: true });
      writeReview(files.review(month, year), result.items, t);
      sendJson(res, {
        items: result.items,
        summary: summarize(result.items),
        withoutAnswer: result.withoutAnswer.map(publisherSummary),
        alreadySentCount: result.alreadySentCount,
      });
    },

    'GET /api/review': async ({ res, url }) => {
      const { month, year } = period(url);
      const file = files.review(month, year);
      if (!fs.existsSync(file)) throw new HttpError(404, 'review_not_found');
      const items = readReview(file);
      sendJson(res, { items, summary: summarize(items) });
    },

    'PUT /api/review': async ({ req, res, url, t }) => {
      const { month, year } = period(url);
      const { items } = await readJson(req);
      fs.mkdirSync(files.reviews, { recursive: true });
      writeReview(files.review(month, year), items, t);
      sendJson(res, { saved: true, summary: summarize(items) });
    },

    'GET /api/review.xlsx': async ({ res, url, t }) => {
      const { month, year } = period(url);
      const file = files.review(month, year);
      if (!fs.existsSync(file)) throw new HttpError(404, 'file_not_found');
      writeReview(file, readReview(file), t);
      sendFile(res, file, path.basename(file));
    },

    'POST /api/simulate': async ({ req, res, url, t }) => {
      const { month, year } = period(url);
      const { items } = await readJson(req);
      const { withErrors, pending, existing } = await validateSubmission(client(), items, month, year);
      sendJson(res, {
        errors: withErrors.map(entry => ({ row: entry.item.row, name: entry.item.hourglassName || entry.item.formName, errors: entry.errors })),
        existing: existing.map(entry => entry.item.hourglassName),
        pending: pending.map(entry => ({ row: entry.item.row, name: entry.item.hourglassName, detail: describeReport(t, entry) })),
      });
    },

    'POST /api/send': async ({ req, res, url, t }) => {
      const { month, year } = period(url);
      const { items, confirmation } = await readJson(req);
      if (confirmation !== 'SEND') throw new HttpError(400, 'confirmation_missing');
      const api = client();
      if (!(await api.account()).permissions.submitReports) throw new HttpError(403, 'no_submit_permission');
      await withLock(folder, async () => {
        const { withErrors, pending, existing } = await validateSubmission(api, items, month, year);
        if (withErrors.length) throw new HttpError(422, 'rows_with_errors');

        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
        const write = data => res.write(JSON.stringify(data) + '\n');
        write({ type: 'start', total: pending.length });
        const log = createLog(files.log(month, year), 'interface');
        const results = await sendReports(api, pending, (result, done, total) => write({ type: 'progress', done, total, ...result }), log);
        const alreadyInHourglass = existing.map(entry => ({ id: entry.report.user.id, ok: true }));
        writeReview(files.review(month, year), markSent(items, [...results, ...alreadyInHourglass]), t);
        write({
          type: 'end',
          sent: results.filter(result => result.ok && !result.existed).length,
          existed: results.filter(result => result.existed).length,
          failed: results.filter(result => !result.ok).length,
        });
        res.end();
      });
    },

    'POST /api/aliases': async ({ req, res }) => {
      const { name, id } = await readJson(req);
      if (!name || !Number(id)) throw new HttpError(400, 'alias_incomplete');
      saveAlias(files.aliases, name, id);
      sendJson(res, { saved: true });
    },

    'GET /api/missing': async ({ res, t }) => {
      const result = await collectMissing(client());
      fs.mkdirSync(files.reviews, { recursive: true });
      saveMissing(files.missing(result.month), t, result);
      sendJson(res, { ...result, message: shareMessage(t, result) });
    },

    'GET /api/missing.xlsx': async ({ res, url, t }) => {
      const label = url.searchParams.get('label') ?? '';
      if (!/^\d{4}-\d{2}$/.test(label)) throw new HttpError(400, 'invalid_period');
      const file = files.missing(label);
      if (!fs.existsSync(file)) throw new HttpError(404, 'file_not_found');
      sendFile(res, file, `${t('missing.fileName')}-${label}.xlsx`);
    },

    'GET /api/languages': async ({ res }) => sendJson(res, LANGUAGES),
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const t = createTranslator(requestLanguage(req, url));
    const route = routes[`${req.method} ${url.pathname}`];
    try {
      if (!isOriginAllowed(req)) throw new HttpError(403, 'origin_not_allowed');
      if (route) return await route({ req, res, url, t });
      if (req.method === 'GET') return serveStatic(res, url.pathname);
      throw new HttpError(404, 'route_not_found');
    } catch (error) {
      if (error.status === 401) cached = null;
      if (res.headersSent) return res.end();
      const code = error.code ?? 'internal_error';
      const params = error.params ?? (error.code ? undefined : { detail: error.message });
      sendJson(res, { error: code, params, message: renderError(t, { code, params }) }, error.status ?? 500);
    }
  };
}

function openBrowser(address) {
  const commands = { win32: ['cmd', ['/c', 'start', '', address]], darwin: ['open', [address]] };
  const [program, args] = commands[process.platform] ?? ['xdg-open', [address]];
  spawn(program, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

function start(options = {}) {
  const port = options.port ?? PORT;
  const address = `http://localhost:${port}`;
  const t = createTranslator(options.language ?? Intl.DateTimeFormat().resolvedOptions().locale);
  const folder = options.folder ?? __dirname;
  const migrated = migrateLegacyFiles(folder);
  if (migrated.length) process.stdout.write(`${t('server.migrated', { files: migrated.join(', ') })}\n`);
  const server = http.createServer(createApp(options));
  server.on('error', error => {
    if (error.code !== 'EADDRINUSE') throw error;
    process.stdout.write(`${t('server.portInUse', { address, port })}\n`);
    if (options.open) openBrowser(address);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`${t('server.running', { address })}\n${t('server.howToStop')}\n`);
    if (options.open) openBrowser(address);
  });
  return server;
}

if (require.main === module) start({ open: process.argv.includes('--open') });

module.exports = { createApp, start };
