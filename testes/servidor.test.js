'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { subirServidor, planilhaForms, lerNdjson } = require('./apoio');
const { gerarModelo } = require('../lib/modelo');
const { lerConferencia } = require('../lib/conferencia');

async function prepararSetembro(app) {
  const enviado = await app.chamar('/api/planilha', 'POST', planilhaForms());
  const preparado = await app.chamar('/api/preparar?mes=9&ano=2026', 'POST', { id: enviado.dados.id, mapeamento: enviado.dados.mapeamento });
  return preparado.dados.itens;
}

const porNome = (itens, nome) => itens.find(i => i.nomeFormulario === nome);

test('sessão, conta e publicadores', async () => {
  const app = await subirServidor();
  try {
    const sessao = await app.chamar('/api/sessao');
    assert.equal(sessao.dados.valida, true);
    assert.equal(sessao.dados.conta.congregacao.nome, 'Congregação Exemplo');
    assert.equal((await app.chamar('/api/sessao', 'POST', { hglogin: '', xsrf: '' })).status, 400);
    assert.equal((await app.chamar('/api/publicadores')).dados.length, 10);
  } finally {
    await app.fechar();
  }
});

test('importação do Forms gera a conferência esperada', async () => {
  const app = await subirServidor();
  try {
    const itens = await prepararSetembro(app);
    assert.equal(itens.length, 11);
    const ana = porNome(itens, 'Ana Clara Exemplo');
    assert.equal(ana.id, 1001);
    assert.equal(ana.situacao, 'ENVIAR');
    const bruno = porNome(itens, 'Bruno Teste Ficticio');
    assert.equal(bruno.situacao, 'REVISAR');
    assert.equal(bruno.credito, 15);
    assert.equal(bruno.estudos, 2);
    assert.equal(porNome(itens, 'Carla Modelo Silva').pioneiro, 'Auxiliar');
    assert.equal(porNome(itens, 'Daniel Amostra Costa').participou, 'NÃO');
    assert.equal(porNome(itens, 'Pessoa Desconhecida').situacao, 'NÃO ENCONTRADO');
    assert.match(porNome(itens, 'Igor Inativo').alertas, /inativo no Hourglass/);
    assert.equal(itens.filter(i => i.nomeFormulario === 'Fabio Exemplo Lima' && i.situacao === 'IGNORAR').length, 1);
    assert.ok(fs.existsSync(path.join(app.pasta, 'conferencias', 'conferencia-2026-09.xlsx')));
  } finally {
    await app.fechar();
  }
});

test('mapeamento: obrigatórios, formato lembrado e planilha modelo', async () => {
  const app = await subirServidor();
  try {
    const enviado = await app.chamar('/api/planilha', 'POST', planilhaForms());
    assert.equal(enviado.dados.lembrado, false);
    const semNome = await app.chamar('/api/preparar?mes=9&ano=2026', 'POST', { id: enviado.dados.id, mapeamento: { ...enviado.dados.mapeamento, nome: [] } });
    assert.equal(semNome.status, 422);
    await app.chamar('/api/preparar?mes=9&ano=2026', 'POST', { id: enviado.dados.id, mapeamento: enviado.dados.mapeamento, lembrar: true });
    assert.equal((await app.chamar('/api/planilha', 'POST', planilhaForms())).dados.lembrado, true);
    const modelo = await app.chamar('/api/planilha', 'POST', gerarModelo());
    assert.deepEqual(modelo.dados.faltando, []);
    assert.equal((await app.chamar('/api/planilha', 'POST', Buffer.from('não é excel'))).status, 400);
    assert.equal((await app.chamar('/api/modelo.xlsx')).status, 200);
  } finally {
    await app.fechar();
  }
});

test('simulação e envio com confirmação, registro e marcação na conferência', async () => {
  const app = await subirServidor();
  try {
    const itens = await prepararSetembro(app);
    const simulacao = await app.chamar('/api/simular?mes=9&ano=2026', 'POST', { itens });
    assert.deepEqual(simulacao.dados.erros, []);
    const prontos = simulacao.dados.pendentes.length;
    assert.ok(prontos > 0);

    assert.equal((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens })).status, 400);
    const envio = await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens, confirmacao: 'ENVIAR' });
    const fim = lerNdjson(envio.dados).find(e => e.tipo === 'fim');
    assert.equal(fim.enviados, prontos);
    assert.equal(app.hourglass.estado.criados.length, prontos);
    assert.deepEqual(app.hourglass.estado.criados.find(r => r.user.id === 1001), { id: 0, user: { id: 1001 }, month: 9, year: 2026, minutes: 1, studies: 1, credithours: null, pioneer: null, remarks: null });

    const registro = fs.readFileSync(path.join(app.pasta, 'conferencias', 'envios-2026-09.log'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(registro.length, prontos);
    assert.ok(registro.every(r => r.origem === 'interface' && r.resultado === 'enviado'));

    const conferencia = lerConferencia(path.join(app.pasta, 'conferencias', 'conferencia-2026-09.xlsx'));
    assert.equal(conferencia.filter(i => i.situacao === 'JÁ LANÇADO').length, prontos);

    const reenvio = lerNdjson((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens, confirmacao: 'ENVIAR' })).dados);
    assert.equal(reenvio.find(e => e.tipo === 'fim').enviados, 0);
    assert.equal(app.hourglass.estado.criados.length, prontos);
  } finally {
    await app.fechar();
  }
});

test('envio bloqueia erros de validação e linhas duplicadas para o mesmo publicador', async () => {
  const app = await subirServidor();
  try {
    const itens = await prepararSetembro(app);
    const comCreditoAlto = itens.map(i => i.nomeFormulario === 'Elisa Demo Souza' ? { ...i, credito: 10 } : i);
    const simulacao = await app.chamar('/api/simular?mes=9&ano=2026', 'POST', { itens: comCreditoAlto });
    assert.ok(simulacao.dados.erros.some(e => e.erros.some(x => x.includes('55h'))));
    assert.equal((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens: comCreditoAlto, confirmacao: 'ENVIAR' })).status, 422);

    const duplicado = itens.map(i => i.nomeFormulario === 'Giovana Teste Rocha' ? { ...i, id: 1008 } : i);
    const simulacaoDuplicada = await app.chamar('/api/simular?mes=9&ano=2026', 'POST', { itens: duplicado });
    assert.ok(simulacaoDuplicada.dados.erros.some(e => e.erros.some(x => x.includes('mesmo publicador'))));
    assert.equal(app.hourglass.estado.criados.length, 0);
  } finally {
    await app.fechar();
  }
});

test('envios simultâneos não duplicam relatórios', async () => {
  const app = await subirServidor();
  try {
    const itens = await prepararSetembro(app);
    const corpo = { itens, confirmacao: 'ENVIAR' };
    const [a, b] = await Promise.all([
      app.chamar('/api/enviar?mes=9&ano=2026', 'POST', corpo),
      new Promise(r => setTimeout(r, 10)).then(() => app.chamar('/api/enviar?mes=9&ano=2026', 'POST', corpo)),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const ids = app.hourglass.estado.criados.map(r => r.user.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(!fs.existsSync(path.join(app.pasta, '.envio.lock')));
  } finally {
    await app.fechar();
  }
});

test('trava de outro processo bloqueia e trava abandonada é descartada', async () => {
  const app = await subirServidor();
  try {
    const itens = await prepararSetembro(app);
    const trava = path.join(app.pasta, '.envio.lock');
    fs.writeFileSync(trava, '{}');
    assert.equal((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens, confirmacao: 'ENVIAR' })).status, 409);
    const antiga = new Date(Date.now() - 31 * 60 * 1000);
    fs.utimesSync(trava, antiga, antiga);
    assert.equal((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens, confirmacao: 'ENVIAR' })).status, 200);
    assert.ok(!fs.existsSync(trava));
  } finally {
    await app.fechar();
  }
});

test('falhas temporárias do Hourglass são recuperadas sem duplicar', async () => {
  const app = await subirServidor({ falso: { falhas: { 1001: 'depois-de-salvar', 1006: 'antes-de-salvar', 1007: 'permanente' } } });
  try {
    const itens = await prepararSetembro(app);
    const fim = lerNdjson((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens, confirmacao: 'ENVIAR' })).dados).find(e => e.tipo === 'fim');
    assert.equal(fim.falhas, 1);
    const ids = app.hourglass.estado.criados.map(r => r.user.id);
    assert.equal(ids.filter(id => id === 1001).length, 1);
    assert.equal(ids.filter(id => id === 1006).length, 1);
    assert.ok(!ids.includes(1007));
  } finally {
    await app.fechar();
  }
});

test('envio exige permissão de lançar relatórios', async () => {
  const app = await subirServidor({ falso: { permissoes: ['view summary'] } });
  try {
    const itens = await prepararSetembro(app);
    assert.equal((await app.chamar('/api/enviar?mes=9&ano=2026', 'POST', { itens, confirmacao: 'ENVIAR' })).status, 403);
  } finally {
    await app.fechar();
  }
});

test('faltantes e mensagem única', async () => {
  const app = await subirServidor();
  try {
    const faltantes = await app.chamar('/api/faltantes');
    assert.equal(faltantes.dados.faltantes.length, 9);
    assert.match(faltantes.dados.mensagem, /09\/2026/);
    assert.match(faltantes.dados.mensagem, /\*GRUPO 1\*/);
    assert.equal((await app.chamar('/api/faltantes.xlsx?mes=2026-09')).status, 200);
    assert.equal((await app.chamar('/api/faltantes.xlsx?mes=../x')).status, 400);
  } finally {
    await app.fechar();
  }
});

test('proteções: origem, host, caminho, JSON inválido e cache do cadastro', async () => {
  const app = await subirServidor();
  try {
    assert.equal((await app.chamar('/api/apelidos', 'POST', { nome: 'X', id: 1 }, { Origin: 'https://site-estranho.example' })).status, 403);
    assert.equal((await app.chamar('/api/apelidos', 'POST', { nome: 'X', id: 1 }, { Origin: 'chrome-extension://abc' })).status, 200);
    assert.equal((await app.chamar('/..%2f..%2fservidor.js')).status, 404);
    const quebrado = await fetch(app.base + '/api/apelidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{quebrado' });
    assert.equal(quebrado.status, 400);
    await app.chamar('/api/sessao');
    const antes = app.hourglass.estado.clientes;
    await app.chamar('/api/publicadores');
    await app.chamar('/api/faltantes');
    assert.equal(app.hourglass.estado.clientes, antes);
    assert.equal((await app.chamar('/api/preparar?mes=13&ano=2026', 'POST', {})).status, 400);
  } finally {
    await app.fechar();
  }
});
