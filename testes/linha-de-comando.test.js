'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { pastaTemporaria, SESSAO } = require('./apoio');

const RAIZ = path.join(__dirname, '..');
const FALSO = path.join(__dirname, 'hourglass-http-falso.js');
const ambiente = { ...process.env, NODE_PATH: path.join(RAIZ, 'node_modules') };

function copiar(origem, destino) {
  if (!fs.statSync(origem).isDirectory()) return fs.copyFileSync(origem, destino);
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem)) copiar(path.join(origem, nome), path.join(destino, nome));
}

function copiaDoProjeto() {
  const pasta = pastaTemporaria();
  for (const item of ['importar.js', 'servidor.js', 'lib', 'public']) copiar(path.join(RAIZ, item), path.join(pasta, item));
  fs.writeFileSync(path.join(pasta, 'sessao.json'), JSON.stringify(SESSAO));
  return pasta;
}

function rodar(pasta, argumentos, entrada = '') {
  return spawnSync(process.execPath, ['-r', FALSO, ...argumentos], { cwd: pasta, input: entrada, encoding: 'utf8', env: ambiente, timeout: 30000 });
}

function esperarSaida(filho, padrao) {
  return new Promise((resolve, reject) => {
    let texto = '';
    const limite = setTimeout(() => reject(new Error(`sem saída: ${texto}`)), 10000);
    filho.stdout.on('data', parte => {
      texto += parte;
      if (padrao.test(texto)) { clearTimeout(limite); resolve(texto); }
    });
  });
}

test('linha de comando: modelo, simulação, envio, registro e conferência atualizada', () => {
  const pasta = copiaDoProjeto();
  assert.match(rodar(pasta, ['importar.js', 'modelo']).stdout, /Modelo gerado/);
  assert.ok(fs.existsSync(path.join(pasta, 'modelo-relatorios.xlsx')));

  const { escreverConferencia, lerConferencia } = require('../lib/conferencia');
  fs.mkdirSync(path.join(pasta, 'conferencias'));
  const conferencia = path.join(pasta, 'conferencias', 'conferencia-2026-09.xlsx');
  escreverConferencia(conferencia, [
    { situacao: 'ENVIAR', linha: 2, id: 2001, nomeFormulario: 'Ana', nomeHourglass: 'Ana Clara Exemplo', participou: 'SIM', estudos: 1 },
    { situacao: 'ENVIAR', linha: 3, id: 2002, nomeFormulario: 'Bruno', nomeHourglass: 'Bruno Teste Ficticio', horas: 50, credito: 5, pioneiro: 'Regular' },
  ]);

  const simulacao = rodar(pasta, ['importar.js', 'enviar', 'conferencias/conferencia-2026-09.xlsx']);
  assert.match(simulacao.stdout, /2 relatórios seriam enviados/);

  const cancelado = rodar(pasta, ['importar.js', 'enviar', 'conferencias/conferencia-2026-09.xlsx', '--executar'], 'nao\n');
  assert.match(cancelado.stdout, /Cancelado/);

  const envio = rodar(pasta, ['importar.js', 'enviar', 'conferencias/conferencia-2026-09.xlsx', '--executar'], 'ENVIAR\n');
  assert.match(envio.stdout, /conferência atualizada/);
  assert.ok(lerConferencia(conferencia).every(i => i.situacao === 'JÁ LANÇADO'));
  const registro = fs.readFileSync(path.join(pasta, 'conferencias', 'envios-2026-09.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(registro.length, 2);
  assert.ok(registro.every(r => r.origem === 'linha de comando' && r.resultado === 'enviado'));
  assert.ok(!fs.existsSync(path.join(pasta, '.envio.lock')));
});

test('linha de comando respeita a trava de outro envio', () => {
  const pasta = copiaDoProjeto();
  const { escreverConferencia } = require('../lib/conferencia');
  fs.mkdirSync(path.join(pasta, 'conferencias'));
  escreverConferencia(path.join(pasta, 'conferencias', 'conferencia-2026-09.xlsx'), [
    { situacao: 'ENVIAR', linha: 2, id: 2001, nomeHourglass: 'Ana Clara Exemplo', participou: 'SIM' },
  ]);
  fs.writeFileSync(path.join(pasta, '.envio.lock'), '{}');
  const envio = rodar(pasta, ['importar.js', 'enviar', 'conferencias/conferencia-2026-09.xlsx', '--executar'], 'ENVIAR\n');
  assert.match(envio.stderr + envio.stdout, /envio em andamento/);
});

test('servidor: endereço ao iniciar, porta ocupada e limite de 10 MB', async () => {
  const pasta = copiaDoProjeto();
  const ocupante = http.createServer().listen(0, '127.0.0.1');
  await new Promise(r => ocupante.once('listening', r));
  const portaOcupada = ocupante.address().port;
  const ocupada = spawnSync(process.execPath, ['servidor.js'], { cwd: pasta, env: { ...ambiente, PORTA: String(portaOcupada) }, encoding: 'utf8', timeout: 10000 });
  assert.match(ocupada.stdout, /já está aberto/);
  assert.equal(ocupada.status, 1);
  ocupante.close();

  const livre = http.createServer().listen(0, '127.0.0.1');
  await new Promise(r => livre.once('listening', r));
  const porta = livre.address().port;
  await new Promise(r => livre.close(r));
  const filho = spawn(process.execPath, ['servidor.js'], { cwd: pasta, env: { ...ambiente, PORTA: String(porta) } });
  try {
    assert.match(await esperarSaida(filho, /rodando em/), new RegExp(`localhost:${porta}`));
    const grande = await fetch(`http://localhost:${porta}/api/planilha`, { method: 'POST', body: Buffer.alloc(11 * 1024 * 1024) })
      .then(r => r.status, () => 'conexão encerrada');
    assert.ok(grande === 413 || grande === 'conexão encerrada', `recebido: ${grande}`);
    assert.equal((await fetch(`http://localhost:${porta}/api/sessao`)).status, 200);
  } finally {
    filho.kill();
  }
});
