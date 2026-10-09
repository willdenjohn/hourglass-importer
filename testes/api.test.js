'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { criarCliente } = require('../lib/api');

const fetchOriginal = global.fetch;
afterEach(() => { global.fetch = fetchOriginal; });

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });

test('envia cookies e cabeçalho XSRF', async () => {
  let recebido;
  global.fetch = async (url, opcoes) => { recebido = { url, opcoes }; return json({ missing: [] }); };
  await criarCliente({ hglogin: 'abc', xsrf: 'xyz' }).faltantes();
  assert.equal(recebido.url, 'https://app.hourglass-app.com/api/v0.2/fsreport/summary/missing');
  assert.equal(recebido.opcoes.headers.Cookie, 'hglogin=abc; X-Hourglass-XSRF-Token=xyz');
  assert.equal(recebido.opcoes.headers['X-Hourglass-XSRF-Token'], 'xyz');
  assert.ok(recebido.opcoes.signal);
});

test('consulta com tempo esgotado tenta de novo uma vez e explica o erro', async () => {
  let chamadas = 0;
  global.fetch = async () => { chamadas++; throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
  await assert.rejects(criarCliente({ hglogin: 'a', xsrf: 'b' }).faltantes(), /30 segundos/);
  assert.equal(chamadas, 2);
});

test('consulta com 503 recupera na segunda tentativa', async () => {
  let chamadas = 0;
  global.fetch = async () => (++chamadas === 1 ? json({}, 503) : json({ missing: [1] }));
  assert.deepEqual((await criarCliente({ hglogin: 'a', xsrf: 'b' }).faltantes()).missing, [1]);
});

test('criação de relatório não é repetida às cegas', async () => {
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return json({}, 503); };
  await assert.rejects(criarCliente({ hglogin: 'a', xsrf: 'b' }).criarRelatorio({ user: { id: 1 } }), erro => erro.temporario === true);
  assert.equal(chamadas, 1);
});

test('401 vira erro de sessão expirada', async () => {
  global.fetch = async () => json({}, 401);
  await assert.rejects(criarCliente({ hglogin: 'a', xsrf: 'b' }).faltantes(), erro => erro.status === 401 && /expirada/.test(erro.message));
});

test('dados da conta vêm do cadastro inicial', async () => {
  global.fetch = async () => json({
    whoami: { user: { firstname: 'Teste', lastname: 'Exemplo', appt: 'Elder' }, congregation: { name: 'Congregação Exemplo', number: 1, country: { name: 'Brasil' } }, permissions: ['update reports'] },
    users: [{}, {}], fsGroups: [{ name: 'GRUPO 2' }, { name: 'GRUPO 1' }], workingMonth: '2026-09', lastSubmittedMonth: '2026-08',
  });
  const conta = await criarCliente({ hglogin: 'a', xsrf: 'b' }).conta();
  assert.equal(conta.usuario.nome, 'Teste Exemplo');
  assert.equal(conta.usuario.designacao, 'Ancião');
  assert.equal(conta.permissoes.lancarRelatorios, true);
  assert.equal(conta.permissoes.verResumo, false);
  assert.deepEqual(conta.grupos, ['GRUPO 1', 'GRUPO 2']);
  assert.equal(conta.ultimoMesEnviado, '2026-08');
});
