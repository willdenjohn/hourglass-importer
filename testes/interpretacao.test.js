'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretarResposta } = require('../lib/interpretar');
const { montarRelatorio } = require('../lib/conferencia');

const publicador = { status: 'Baptized Publisher' };
const regular = { status: 'Regular Pioneer' };
const auxiliarContinuo = { status: 'Continuous Auxiliary Pioneer' };

test('publicador que participou e dirigiu estudo escrito por extenso', () => {
  const r = interpretarResposta({ tipo: 'Publicador', participou: 'Sim', estudos: 'Dois estudos' }, publicador);
  assert.equal(r.pioneer, null);
  assert.equal(r.participou, true);
  assert.equal(r.estudos, 2);
  assert.deepEqual(r.avisos, []);
});

test('publicador que não participou', () => {
  const r = interpretarResposta({ tipo: 'Publicador', participou: 'Não' }, publicador);
  assert.equal(r.participou, false);
});

test('pioneiro regular vem do cadastro e horas em texto simples não geram alerta', () => {
  const r = interpretarResposta({ tipo: 'Pioneiro(a) Regular', horas: '45h' }, regular);
  assert.equal(r.pioneer, 'Regular');
  assert.equal(r.horas, 45);
  assert.deepEqual(r.avisos, []);
});

test('crédito citado no texto das horas é sugerido e limitado a 55h', () => {
  const r = interpretarResposta({ tipo: 'Pioneiro(a) Regular', horas: '40 horas + 20 crédito construção' }, regular);
  assert.equal(r.horas, 40);
  assert.equal(r.credito, 15);
  assert.ok(r.avisos.some(a => a.includes('limitado a 15h')));
});

test('crédito em coluna própria dentro do limite não gera alerta', () => {
  const r = interpretarResposta({ horas: 40, credito: 15 }, regular);
  assert.equal(r.credito, 15);
  assert.deepEqual(r.avisos, []);
});

test('crédito de pioneiro auxiliar é descartado', () => {
  const r = interpretarResposta({ tipo: 'Pioneiro(a) Auxiliar', horas: 30, credito: 5 }, publicador);
  assert.equal(r.pioneer, 'Auxiliary');
  assert.equal(r.credito, null);
});

test('sem coluna de tipo usa o cadastro e a coluna pioneiro auxiliar', () => {
  assert.equal(interpretarResposta({ horas: 30 }, auxiliarContinuo).pioneer, 'Auxiliary');
  assert.equal(interpretarResposta({ pioneiroAuxiliar: 'Sim', horas: 25 }, publicador).pioneer, 'Auxiliary');
  assert.equal(interpretarResposta({ participou: 'Sim' }, publicador).pioneer, null);
});

test('sem coluna participou conta como participou quem tem estudos', () => {
  const r = interpretarResposta({ estudos: 1 }, publicador);
  assert.equal(r.participou, true);
});

test('formulário diz publicador mas cadastro é pioneiro regular gera alerta', () => {
  const r = interpretarResposta({ tipo: 'Publicador', participou: 'Sim' }, regular);
  assert.ok(r.avisos.some(a => a.includes('cadastro é pioneiro regular')));
});

test('horas fracionadas são arredondadas para baixo com alerta', () => {
  const r = interpretarResposta({ tipo: 'Pioneiro(a) Regular', horas: '30,5' }, regular);
  assert.equal(r.horas, 30);
  assert.ok(r.avisos.some(a => a.includes('fracionadas')));
});

test('revisitas no lugar de estudos não viram estudos', () => {
  const r = interpretarResposta({ tipo: 'Publicador', participou: 'Sim', estudos: 'Só 6 revisitas' }, publicador);
  assert.equal(r.estudos, null);
});

test('relatório montado segue o formato do Hourglass', () => {
  const { relatorio, erros } = montarRelatorio({ id: 1002, horas: 40, credito: 15, estudos: 2, pioneiro: 'Regular', participou: 'SIM' }, 2026, 9);
  assert.deepEqual(erros, []);
  assert.deepEqual(relatorio, { id: 0, user: { id: 1002 }, month: 9, year: 2026, minutes: 2400, studies: 2, credithours: 15, pioneer: 'Regular', remarks: null });
  assert.equal(montarRelatorio({ id: 1, participou: 'SIM' }, 2026, 9).relatorio.minutes, 1);
  assert.equal(montarRelatorio({ id: 1, participou: 'NÃO' }, 2026, 9).relatorio.minutes, 0);
});

test('montagem barra valores que o Hourglass não aceita', () => {
  assert.ok(montarRelatorio({ id: 1, horas: 30.5, pioneiro: 'Regular' }, 2026, 9).erros.some(e => e.includes('horas inteiras')));
  assert.ok(montarRelatorio({ id: 1, horas: 50, credito: 10, pioneiro: 'Regular' }, 2026, 9).erros.some(e => e.includes('55h')));
  assert.ok(montarRelatorio({ id: 1, horas: 30, credito: 5, pioneiro: 'Auxiliar' }, 2026, 9).erros.some(e => e.includes('crédito só vale')));
  assert.ok(montarRelatorio({ participou: 'SIM' }, 2026, 9).erros.includes('sem ID Hourglass'));
});
