'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretAnswer } = require('../lib/interpret');
const { buildReport } = require('../lib/review');

const publisher = { status: 'Baptized Publisher' };
const regular = { status: 'Regular Pioneer' };
const continuousAuxiliary = { status: 'Continuous Auxiliary Pioneer' };
const codes = alerts => alerts.map(alert => alert.code);

test('publisher who participated and wrote the number of studies in words', () => {
  const result = interpretAnswer({ type: 'Publicador', participated: 'Sim', studies: 'Dois estudos' }, publisher);
  assert.equal(result.pioneer, null);
  assert.equal(result.participated, true);
  assert.equal(result.studies, 2);
  assert.deepEqual(result.alerts, []);
});

test('answers in English and Spanish are understood', () => {
  assert.equal(interpretAnswer({ type: 'Publisher', participated: 'Yes', studies: 'two' }, publisher).studies, 2);
  assert.equal(interpretAnswer({ participated: 'Sí', studies: 'dos cursos' }, publisher).participated, true);
  assert.equal(interpretAnswer({ type: 'Precursor auxiliar', hours: 30 }, publisher).pioneer, 'Auxiliary');
});

test('publisher who did not participate', () => {
  assert.equal(interpretAnswer({ type: 'Publicador', participated: 'Não' }, publisher).participated, false);
});

test('regular pioneer comes from the registry and plain hours raise no alert', () => {
  const result = interpretAnswer({ type: 'Pioneiro(a) Regular', hours: '45h' }, regular);
  assert.equal(result.pioneer, 'Regular');
  assert.equal(result.hours, 45);
  assert.deepEqual(result.alerts, []);
});

test('credit mentioned in the hours text is suggested and capped at 55h', () => {
  const result = interpretAnswer({ type: 'Pioneiro(a) Regular', hours: '40 horas + 20 crédito construção' }, regular);
  assert.equal(result.hours, 40);
  assert.equal(result.credit, 15);
  assert.deepEqual(result.alerts.find(alert => alert.code === 'credit_capped').params, { value: 20, maximum: 15, limit: 55 });
});

test('credit in its own column within the limit raises no alert', () => {
  const result = interpretAnswer({ hours: 40, credit: 15 }, regular);
  assert.equal(result.credit, 15);
  assert.deepEqual(result.alerts, []);
});

test('credit from an auxiliary pioneer is dropped', () => {
  const result = interpretAnswer({ type: 'Pioneiro(a) Auxiliar', hours: 30, credit: 5 }, publisher);
  assert.equal(result.pioneer, 'Auxiliary');
  assert.equal(result.credit, null);
  assert.ok(codes(result.alerts).includes('credit_not_applicable'));
});

test('without a type column the registry and the auxiliary pioneer column decide', () => {
  assert.equal(interpretAnswer({ hours: 30 }, continuousAuxiliary).pioneer, 'Auxiliary');
  assert.equal(interpretAnswer({ auxiliaryPioneer: 'Sim', hours: 25 }, publisher).pioneer, 'Auxiliary');
  assert.equal(interpretAnswer({ participated: 'Sim' }, publisher).pioneer, null);
});

test('without a participated column, studies count as participation', () => {
  assert.equal(interpretAnswer({ studies: 1 }, publisher).participated, true);
});

test('form says publisher but registry says regular pioneer', () => {
  const result = interpretAnswer({ type: 'Publicador', participated: 'Sim' }, regular);
  assert.deepEqual(result.alerts.find(alert => alert.code === 'registry_is_regular').params, { type: 'publisher' });
});

test('fractional hours are rounded down with an alert', () => {
  const result = interpretAnswer({ type: 'Pioneiro(a) Regular', hours: '30,5' }, regular);
  assert.equal(result.hours, 30);
  assert.ok(codes(result.alerts).includes('hours_rounded'));
});

test('return visits written instead of studies are not counted', () => {
  const result = interpretAnswer({ type: 'Publicador', participated: 'Sim', studies: 'Só 6 revisitas' }, publisher);
  assert.equal(result.studies, null);
  assert.ok(codes(result.alerts).includes('studies_unclear'));
});

test('report payload follows the Hourglass format', () => {
  const { report, errors } = buildReport({ id: 1002, hours: 40, credit: 15, studies: 2, pioneer: 'Regular', participated: true }, 2026, 9);
  assert.deepEqual(errors, []);
  assert.deepEqual(report, { id: 0, user: { id: 1002 }, month: 9, year: 2026, minutes: 2400, studies: 2, credithours: 15, pioneer: 'Regular', remarks: null });
  assert.equal(buildReport({ id: 1, participated: true }, 2026, 9).report.minutes, 1);
  assert.equal(buildReport({ id: 1, participated: false }, 2026, 9).report.minutes, 0);
});

test('report building blocks values Hourglass does not accept', () => {
  const errorCodes = item => buildReport(item, 2026, 9).errors.map(error => error.code);
  assert.ok(errorCodes({ id: 1, hours: 30.5, pioneer: 'Regular' }).includes('invalid_hours'));
  assert.ok(errorCodes({ id: 1, hours: 50, credit: 10, pioneer: 'Regular' }).includes('credit_over_limit'));
  assert.ok(errorCodes({ id: 1, hours: 30, credit: 5, pioneer: 'Auxiliary' }).includes('credit_regular_only'));
  assert.ok(errorCodes({ participated: true }).includes('missing_publisher_id'));
  assert.ok(errorCodes({ id: 1, pioneer: 'Auxiliar' }).includes('invalid_pioneer'));
});
