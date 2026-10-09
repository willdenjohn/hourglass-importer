'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UMA_HORA = 60 * 60 * 1000;

function token(expiraEm) {
  return 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ exp: Math.floor(expiraEm / 1000) })).toString('base64url') + '.x';
}

function carregarExtensao({ importador }) {
  const armazenamento = {};
  const cookies = {};
  const selo = {};
  let ouvinte;
  const chrome = {
    storage: { local: { get: async chaves => Object.fromEntries(chaves.filter(c => c in armazenamento).map(c => [c, armazenamento[c]])), set: async dados => Object.assign(armazenamento, dados) }, onChanged: { addListener() {} } },
    cookies: { get: async ({ name }) => (cookies[name] ? { value: cookies[name] } : null) },
    action: { setBadgeText: async ({ text }) => { selo.texto = text; }, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    runtime: { onMessage: { addListener: f => { ouvinte = f; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
  };
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'extensao', 'service-worker.js'), 'utf8');
  vm.runInNewContext(codigo, { chrome, fetch: importador, atob, Date, JSON, Promise, Boolean, Object, decodeURIComponent });
  const enviar = mensagem => new Promise(resolve => ouvinte(mensagem, {}, resolve));
  return { enviar, cookies, selo };
}

function importadorFalso({ valida = false, rodando = true } = {}) {
  const recebidos = [];
  const fetchFalso = async (url, opcoes = {}) => {
    if (!rodando) throw new Error('recusado');
    if (opcoes.method === 'POST') {
      recebidos.push(JSON.parse(opcoes.body));
      valida = true;
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify({ configurada: true, valida }), { status: 200 });
  };
  return { fetchFalso, recebidos };
}

test('sem login no Hourglass pede para entrar', async () => {
  const { fetchFalso } = importadorFalso();
  const ext = carregarExtensao({ importador: fetchFalso });
  const r = await ext.enviar({ acao: 'sincronizar' });
  assert.equal(r.motivo, 'sem-login');
});

test('login expirado não é enviado', async () => {
  const { fetchFalso, recebidos } = importadorFalso();
  const ext = carregarExtensao({ importador: fetchFalso });
  Object.assign(ext.cookies, { hglogin: token(Date.now() - 1000), 'X-Hourglass-XSRF-Token': 'x' });
  assert.equal((await ext.enviar({ acao: 'sincronizar' })).motivo, 'expirada');
  assert.equal(recebidos.length, 0);
});

test('envia a sessão só quando o importador precisa', async () => {
  const { fetchFalso, recebidos } = importadorFalso();
  const ext = carregarExtensao({ importador: fetchFalso });
  Object.assign(ext.cookies, { hglogin: token(Date.now() + UMA_HORA), 'X-Hourglass-XSRF-Token': 'abc%3D' });
  assert.equal((await ext.enviar({ acao: 'sincronizar' })).motivo, 'enviada');
  assert.equal(recebidos[0].xsrf, 'abc=');
  assert.equal((await ext.enviar({ acao: 'sincronizar' })).motivo, 'ja-valida');
  assert.equal((await ext.enviar({ acao: 'sincronizar', forcar: true })).motivo, 'enviada');
  assert.equal(recebidos.length, 2);
});

test('desativada não lê cookies e mostra OFF', async () => {
  const { fetchFalso, recebidos } = importadorFalso();
  const ext = carregarExtensao({ importador: fetchFalso });
  Object.assign(ext.cookies, { hglogin: token(Date.now() + UMA_HORA), 'X-Hourglass-XSRF-Token': 'x' });
  await ext.enviar({ acao: 'definirAtiva', ativa: false });
  assert.equal(ext.selo.texto, 'OFF');
  assert.equal((await ext.enviar({ acao: 'sincronizar', forcar: true })).motivo, 'desativada');
  assert.equal(recebidos.length, 0);
  await ext.enviar({ acao: 'definirAtiva', ativa: true });
  assert.equal(ext.selo.texto, 'ON');
});

test('importador fechado é informado no diagnóstico', async () => {
  const { fetchFalso } = importadorFalso({ rodando: false });
  const ext = carregarExtensao({ importador: fetchFalso });
  assert.equal((await ext.enviar({ acao: 'sincronizar' })).motivo, 'importador');
  const diagnostico = await ext.enviar({ acao: 'diagnostico' });
  assert.equal(diagnostico.importadorRodando, false);
  assert.equal(diagnostico.hourglassLogado, false);
});
