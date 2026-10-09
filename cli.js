'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { readForm } = require('./lib/spreadsheet');
const { generateTemplate } = require('./lib/template');
const { fullName } = require('./lib/matching');
const { createClient } = require('./lib/api');
const { writeReview, readReview } = require('./lib/review');
const { loadSession } = require('./lib/session');
const { collectMissing, printMissing, saveMissing } = require('./lib/missing');
const { createTranslator } = require('./lib/i18n');
const { renderError } = require('./lib/alerts');
const { migrateLegacyFiles } = require('./lib/migration');
const { paths, summarize, prepareReview, validateSubmission, sendReports, describeReport, withLock, createLog, markSent } = require('./lib/service');

const FILES = paths(__dirname);
const write = text => process.stdout.write(`${text}\n`);

function ask(question) {
  const reader = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => reader.question(question, answer => { reader.close(); resolve(answer.trim()); }));
}

function clientFromSession() {
  const session = loadSession(__dirname);
  if (!session) throw Object.assign(new Error('session_not_configured'), { code: 'session_not_configured' });
  return createClient(session);
}

function statusLine(t, summary) {
  return Object.entries(summary).map(([status, count]) => `${t(`status.${status}`)}: ${count}`).join(' | ');
}

async function prepare(t, file, month, year) {
  const answers = readForm(file, FILES.mappings);
  write(`\n${t('cli.formAnswers', { count: answers.length, month: String(month).padStart(2, '0'), year })}`);
  const { items, withoutAnswer, publishers, alreadySentCount } = await prepareReview(clientFromSession(), answers, month, year, FILES.aliases);
  write(t('cli.hourglassSummary', { publishers: publishers.length, sent: alreadySentCount }));

  fs.mkdirSync(FILES.reviews, { recursive: true });
  const destination = FILES.review(month, year);
  writeReview(destination, items, t);

  write(`\n${statusLine(t, summarize(items))}`);
  write(`\n${t('cli.withoutAnswer', { count: withoutAnswer.length })}`);
  withoutAnswer.forEach(publisher => write(`  - ${fullName(publisher)}`));
  write(`\n${t('cli.reviewCreated', { file: destination })}`);
  write(`${t('cli.reviewHint')}\n`);
}

function periodFromFile(file) {
  const found = path.basename(file).match(/(\d{4})-(\d{2})/);
  if (!found) throw Object.assign(new Error('review_name_invalid'), { code: 'review_name_invalid' });
  return { year: Number(found[1]), month: Number(found[2]) };
}

async function send(t, file, execute, limit) {
  const { year, month } = periodFromFile(file);
  const client = clientFromSession();
  const items = readReview(file);
  const { withErrors, pending, existing } = await validateSubmission(client, items, month, year, limit);

  withErrors.forEach(entry => write(`  [${t('cli.error')}] ${t('cli.row', { row: entry.item.row })} ${entry.item.formName}: ${entry.errors.map(error => renderError(t, error)).join('; ')}`));
  if (withErrors.length) return write(`\n${t('cli.fixErrors')}\n`);
  existing.forEach(entry => write(`  [${t('cli.exists')}] ${entry.item.hourglassName}`));
  pending.forEach(entry => write(`  [${execute ? t('cli.toSend') : t('cli.simulation')}] ${entry.item.hourglassName} — ${describeReport(t, entry)}`));

  if (!execute) return write(`\n${t('cli.simulationSummary', { count: pending.length })}\n`);
  const confirmation = await ask(`\n${t('cli.confirm', { count: pending.length, word: t('cli.confirmWord') })} `);
  if (confirmation.toUpperCase() !== t('cli.confirmWord').toUpperCase()) return write(`${t('cli.cancelled')}\n`);

  const show = result => write(result.existed
    ? `  [${t('cli.existed')}] ${result.name}`
    : result.ok ? `  [OK] ${result.name}` : `  [${t('cli.failed')}] ${result.name}: ${renderError(t, { code: result.error, params: result.errorParams })}`);
  const log = createLog(FILES.log(month, year), 'command line');
  const results = await withLock(__dirname, () => sendReports(client, pending, show, log));
  const alreadyInHourglass = existing.map(entry => ({ id: entry.report.user.id, ok: true }));
  writeReview(file, markSent(readReview(file), [...results, ...alreadyInHourglass]), t);
  write(`\n${t('cli.sentSummary', { sent: results.filter(result => result.ok && !result.existed).length, total: pending.length })}`);
  await reportMissing(t, client);
}

async function reportMissing(t, client) {
  const result = await collectMissing(client);
  printMissing(t, result, write);
  fs.mkdirSync(FILES.reviews, { recursive: true });
  const destination = FILES.missing(result.month);
  saveMissing(destination, t, result);
  write(`\n${t('cli.spreadsheet', { file: destination })}\n`);
}

function optionValue(args, name) {
  return args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = rest.filter(arg => !arg.startsWith('--'));
  const t = createTranslator(optionValue(rest, 'lang') ?? process.env.LANG ?? Intl.DateTimeFormat().resolvedOptions().locale);
  const migrated = migrateLegacyFiles(__dirname);
  if (migrated.length) write(t('server.migrated', { files: migrated.join(', ') }));

  try {
    if (command === 'prepare' && args.length === 3) return await prepare(t, args[0], Number(args[1]), Number(args[2]));
    if (command === 'send' && args.length === 1) return await send(t, args[0], rest.includes('--execute'), Number(optionValue(rest, 'limit')) || undefined);
    if (command === 'missing') return await reportMissing(t, clientFromSession());
    if (command === 'template') {
      const file = `${t('template.fileName')}.xlsx`;
      fs.writeFileSync(file, generateTemplate(t));
      return write(t('cli.templateCreated', { file }));
    }
    write(t('cli.usage'));
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`\n${t('cli.error')}: ${renderError(t, { code: error.code ?? 'internal_error', params: error.params ?? { detail: error.message } })}\n\n`);
    process.exitCode = 1;
  }
}

main();
