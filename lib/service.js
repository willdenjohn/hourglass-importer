'use strict';

const fs = require('fs');
const path = require('path');
const { interpretAnswer } = require('./interpret');
const { createMatcher, loadAliases, fullName } = require('./matching');
const { STATUS, buildReport } = require('./review');
const { normalize } = require('./text');

const RETRY_DELAY = 2000;
const STALE_LOCK = 30 * 60 * 1000;

function monthLabel(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function paths(folder) {
  const reviews = path.join(folder, 'reviews');
  return {
    aliases: path.join(folder, 'aliases.json'),
    mappings: path.join(folder, 'mappings.json'),
    lock: path.join(folder, '.send.lock'),
    reviews,
    review: (month, year) => path.join(reviews, `review-${monthLabel(month, year)}.xlsx`),
    missing: label => path.join(reviews, `missing-${label}.xlsx`),
    log: (month, year) => path.join(reviews, `submissions-${monthLabel(month, year)}.log`),
  };
}

const alert = (code, params) => (params ? { code, params } : { code });

function flagDuplicates(answers) {
  const lastRowByName = new Map(answers.map(answer => [normalize(answer.name), answer.row]));
  return answers.map(answer => ({ ...answer, duplicate: lastRowByName.get(normalize(answer.name)) !== answer.row }));
}

function buildItem(answer, match, matchInactive, alreadySent) {
  const base = { row: answer.row, formName: answer.name, formType: answer.type ?? '', rawHours: answer.hours ?? '', notes: answer.notes ?? '' };
  if (answer.duplicate) return { ...base, status: STATUS.ignore, alerts: [alert('duplicate_answer')] };

  const { publisher, confidence, tie } = match(answer.name);
  if (!publisher) {
    const inactive = matchInactive(answer.name).publisher;
    const reason = inactive ? alert('inactive_in_hourglass', { name: fullName(inactive) }) : alert('not_found');
    return { ...base, status: STATUS.notFound, match: 'none', alerts: [reason] };
  }

  const result = interpretAnswer(answer, publisher);
  const alerts = [...result.alerts];
  if (confidence === 'low') alerts.unshift(alert(tie ? 'ambiguous_name' : 'similar_name'));
  const sent = alreadySent.has(publisher.id);
  if (sent) alerts.unshift(alert('report_exists'));

  return {
    ...base,
    id: publisher.id,
    hourglassName: fullName(publisher),
    registry: publisher.status,
    status: sent ? STATUS.alreadySent : alerts.length ? STATUS.review : STATUS.send,
    match: confidence,
    participated: result.participated,
    hours: result.hours,
    credit: result.credit,
    studies: result.studies,
    pioneer: result.pioneer ?? '',
    alerts,
  };
}

function flagSharedTargets(items) {
  const count = new Map();
  items.filter(item => item.id && item.status !== STATUS.ignore).forEach(item => count.set(item.id, (count.get(item.id) || 0) + 1));
  for (const item of items) {
    if (count.get(item.id) > 1 && [STATUS.send, STATUS.review].includes(item.status)) {
      item.status = STATUS.review;
      item.alerts = [alert('shared_publisher'), ...(item.alerts ?? [])];
    }
  }
}

function summarize(items) {
  const byStatus = {};
  items.forEach(item => { byStatus[item.status] = (byStatus[item.status] || 0) + 1; });
  return byStatus;
}

async function prepareReview(client, rawAnswers, month, year, aliasesFile) {
  const answers = flagDuplicates(rawAnswers);
  const [publishers, inactive, reports] = await Promise.all([
    client.publishers(), client.inactivePublishers(), client.reportsOfMonth(year, month),
  ]);
  const match = createMatcher(publishers, loadAliases(aliasesFile));
  const matchInactive = createMatcher(inactive, new Map());
  const alreadySent = new Set(reports.map(report => report.user.id));

  const items = answers.map(answer => buildItem(answer, match, matchInactive, alreadySent));
  flagSharedTargets(items);

  const answered = new Set(items.map(item => item.id).filter(Boolean));
  const withoutAnswer = publishers.filter(publisher => publisher.group_id && !answered.has(publisher.id) && !alreadySent.has(publisher.id));
  return { items, withoutAnswer, publishers, alreadySentCount: reports.length };
}

async function validateSubmission(client, items, month, year, limit) {
  const prepared = items
    .filter(item => item.status === STATUS.send)
    .map(item => ({ item, ...buildReport(item, year, month) }));
  const perPublisher = new Map();
  prepared.forEach(entry => perPublisher.set(entry.report.user.id, (perPublisher.get(entry.report.user.id) || 0) + 1));
  prepared
    .filter(entry => entry.report.user.id && perPublisher.get(entry.report.user.id) > 1)
    .forEach(entry => entry.errors.push({ code: 'duplicate_publisher' }));
  const withErrors = prepared.filter(entry => entry.errors.length);
  const valid = prepared.filter(entry => !entry.errors.length);
  if (withErrors.length) return { withErrors, pending: [], existing: [] };

  const sent = new Set((await client.reportsOfMonth(year, month)).map(report => report.user.id));
  return {
    withErrors,
    existing: valid.filter(entry => sent.has(entry.report.user.id)),
    pending: valid.filter(entry => !sent.has(entry.report.user.id)).slice(0, limit),
  };
}

function acquireLock(file) {
  try {
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs > STALE_LOCK) fs.rmSync(file);
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
  return () => fs.rmSync(file, { force: true });
}

async function withLock(folder, task) {
  const release = acquireLock(paths(folder).lock);
  if (!release) throw Object.assign(new Error('send_in_progress'), { code: 'send_in_progress', status: 409 });
  try {
    return await task();
  } finally {
    release();
  }
}

async function isAlreadySent(client, report) {
  return Boolean(await client.reportOfPublisher(report.user.id, report.year, report.month));
}

async function sendOne(client, report) {
  if (await isAlreadySent(client, report)) return { ok: true, existed: true };
  try {
    await client.createReport(report);
    return { ok: true };
  } catch (error) {
    if (!error.temporary) throw error;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    if (await isAlreadySent(client, report)) return { ok: true };
    await client.createReport(report);
    return { ok: true };
  }
}

function createLog(file, origin) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return (result, report) => {
    const { id, user, ...values } = report;
    const outcome = result.existed ? 'already_existed' : result.ok ? 'sent' : 'failed';
    const line = { at: new Date().toISOString(), origin, publisher: user.id, name: result.name, ...values, result: outcome, error: result.error ?? null };
    fs.appendFileSync(file, JSON.stringify(line) + '\n');
  };
}

async function sendReports(client, pending, onProgress = () => {}, log = () => {}) {
  const results = [];
  for (const { item, report } of pending) {
    const base = { id: report.user.id, name: item.hourglassName };
    try {
      results.push({ ...base, ...(await sendOne(client, report)) });
    } catch (error) {
      results.push({ ...base, ok: false, error: error.code ?? error.message, errorParams: error.params });
    }
    const last = results[results.length - 1];
    log(last, report);
    onProgress(last, results.length, pending.length);
  }
  return results;
}

function describeReport(t, { report }) {
  const hours = report.pioneer
    ? t(report.credithours ? 'report.hoursWithCredit' : 'report.hours', { hours: report.minutes / 60, credit: report.credithours })
    : t(report.minutes ? 'report.participated' : 'report.didNotParticipate');
  const studies = report.studies ? t('report.studies', { count: report.studies }) : null;
  const pioneer = report.pioneer ? t(`pioneer.${report.pioneer}`) : null;
  return [hours, studies, pioneer].filter(Boolean).join(' — ');
}

function markSent(items, results) {
  const sent = new Set(results.filter(result => result.ok).map(result => result.id));
  return items.map(item => (item.status === STATUS.send && sent.has(Number(item.id))
    ? { ...item, status: STATUS.alreadySent, alerts: [alert('sent_by_importer'), ...(item.alerts ?? [])] }
    : item));
}

function saveAlias(file, name, id) {
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  current[name] = Number(id);
  fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n');
}

module.exports = {
  paths, monthLabel, summarize, prepareReview, validateSubmission, sendReports, describeReport, saveAlias, markSent, withLock, createLog,
};
