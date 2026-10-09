'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const formulario = require('../lib/formulario');
const { criarLocalizador, carregarApelidos } = require('../lib/correspondencia');
const { gerarModelo, COLUNAS_MODELO } = require('../lib/modelo');
const { PUBLICADORES, TITULOS_FORMS, planilha, planilhaForms, pastaTemporaria } = require('./apoio');

const titulosDe = (planilhaLida, mapeamento, campo) => mapeamento[campo].map(i => planilhaLida.titulos[i]);

test('exportação do Forms tem todas as colunas detectadas, inclusive as duplas', () => {
  const lida = formulario.abrirPlanilha(planilhaForms());
  const mapa = formulario.sugerirMapeamento(lida.titulos);
  assert.deepEqual(formulario.validarMapeamento(mapa), []);
  assert.deepEqual(titulosDe(lida, mapa, 'nome'), ['Escreva seu nome completo']);
  assert.deepEqual(titulosDe(lida, mapa, 'tipo'), ['Você é:']);
  assert.equal(mapa.estudos.length, 2);
  assert.equal(mapa.dirigiu.length, 2);
  assert.deepEqual(titulosDe(lida, mapa, 'horas'), ['Digite a quantidade de horas?']);
});

test('planilha modelo é reconhecida sem ajustes', () => {
  const lida = formulario.abrirPlanilha(gerarModelo());
  const mapa = formulario.sugerirMapeamento(lida.titulos);
  assert.deepEqual(lida.titulos, COLUNAS_MODELO);
  for (const campo of ['nome', 'participou', 'estudos', 'pioneiroAuxiliar', 'horas', 'credito', 'observacoes']) {
    assert.equal(mapa[campo].length, 1, campo);
  }
  const pasta = xlsx.read(gerarModelo());
  assert.deepEqual(pasta.SheetNames, ['Relatórios', 'Instruções']);
});

test('planilha fora do padrão: títulos diferentes, ordem trocada e sem tipo', () => {
  const lida = formulario.abrirPlanilha(planilha([
    ['Obs', 'Créditos', 'Horas trabalhadas', 'Grp', 'Publicador', 'Estudos'],
    ['', '', 12, 'G1', 'Ana Clara Exemplo', 1],
  ]));
  const mapa = formulario.sugerirMapeamento(lida.titulos);
  assert.deepEqual(titulosDe(lida, mapa, 'nome'), ['Publicador']);
  assert.deepEqual(titulosDe(lida, mapa, 'horas'), ['Horas trabalhadas']);
  assert.deepEqual(titulosDe(lida, mapa, 'credito'), ['Créditos']);
  assert.deepEqual(titulosDe(lida, mapa, 'observacoes'), ['Obs']);
  assert.deepEqual(mapa.tipo, []);
});

test('mapeamento sem Nome ou sem Horas/Participou é recusado', () => {
  assert.deepEqual(formulario.validarMapeamento({ nome: [], horas: [1] }), ['Nome']);
  assert.deepEqual(formulario.validarMapeamento({ nome: [0], horas: [], participou: [] }), ['Horas ou Participou no ministério']);
});

test('formato lembrado é reaplicado pelos títulos', () => {
  const arquivo = path.join(pastaTemporaria(), 'mapeamentos.json');
  const lida = formulario.abrirPlanilha(planilhaForms());
  const mapa = { ...formulario.sugerirMapeamento(lida.titulos), observacoes: [7] };
  assert.equal(formulario.mapeamentoLembrado(arquivo, lida.titulos), null);
  formulario.lembrarMapeamento(arquivo, lida.titulos, mapa);
  assert.deepEqual(formulario.mapeamentoLembrado(arquivo, lida.titulos).observacoes, [7]);
  assert.equal(formulario.mapeamentoLembrado(arquivo, [...TITULOS_FORMS, 'Nova coluna']), null);
});

test('leitura das respostas usa a primeira coluna preenchida', () => {
  const lida = formulario.abrirPlanilha(planilhaForms());
  const respostas = formulario.lerRespostas(lida, formulario.sugerirMapeamento(lida.titulos));
  const bruno = respostas.find(r => r.nome === 'Bruno Teste Ficticio');
  assert.equal(bruno.estudos, 'Dois estudos');
  assert.equal(bruno.dirigiu, 'Sim');
  assert.equal(respostas.length, 11);
});

test('correspondência de nomes: exato, apelido, irmãs parecidas e cadastro duplicado', () => {
  const pasta = pastaTemporaria();
  fs.writeFileSync(path.join(pasta, 'apelidos.json'), JSON.stringify({ 'Bia': 1004 }));
  const localizar = criarLocalizador(PUBLICADORES, carregarApelidos(path.join(pasta, 'apelidos.json')));
  assert.equal(localizar('Ana Clara Exemplo').publicador.id, 1001);
  assert.equal(localizar('Bia').publicador.id, 1004);
  assert.equal(localizar('Giovana Rocha').publicador.id, 1007);
  assert.equal(localizar('Giordana Rocha').publicador.id, 1008);
  assert.equal(localizar('Brunno Teste Ficticio').publicador.id, 1002);
  assert.equal(localizar('Pessoa Desconhecida').publicador, null);
});
