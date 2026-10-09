'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { migrateLegacyFiles } = require('../lib/migration');
const { readReview } = require('../lib/review');
const { loadSession } = require('../lib/session');
const { rememberedMapping } = require('../lib/spreadsheet');
const { temporaryFolder, SESSION } = require('./support');

const LEGACY_HEADER = ['Situação', 'Linha', 'Nome no formulário', 'Tipo (formulário)', 'ID Hourglass', 'Nome no Hourglass', 'Cadastro', 'Correspondência', 'Participou', 'Horas', 'Crédito', 'Estudos', 'Pioneiro', 'Observações', 'Horas (texto original)', 'Alertas'];

function legacyReview(file) {
  const rows = [
    LEGACY_HEADER,
    ['ENVIAR', 2, 'Ana', 'Publicador', 1001, 'Ana Clara Example', 'Baptized Publisher', 'exato', 'SIM', '', '', 1, '', '', '', ''],
    ['JÁ LANÇADO', 3, 'Bruno', 'Pioneiro(a) Regular', 1002, 'Bruno Test Fictional', 'Regular Pioneer', 'alta', 'SIM', 40, 15, '', 'Regular', '', '40 + 15', 'AJUSTADO: crédito confirmado | enviado pelo importador'],
    ['REVISAR', 4, 'Carla', 'Pioneiro(a) Auxiliar', 1003, 'Carla Sample Silva', 'Continuous Auxiliary Pioneer', 'alta', 'SIM', 30, '', '', 'Auxiliar', '', '30', 'horas em texto'],
    ['NÃO ENCONTRADO', 5, 'Unknown', 'Publicador', '', '', '', 'nenhuma', 'NÃO', '', '', '', '', '', '', ''],
  ];
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(rows), 'Conferência');
  xlsx.writeFile(book, file);
}

test('legacy Portuguese files are renamed and stay usable', () => {
  const folder = temporaryFolder();
  fs.rmSync(path.join(folder, 'session.json'));
  fs.writeFileSync(path.join(folder, 'sessao.json'), JSON.stringify(SESSION));
  fs.writeFileSync(path.join(folder, 'apelidos.json'), JSON.stringify({ Ana: 1001 }));
  fs.writeFileSync(path.join(folder, 'mapeamentos.json'), JSON.stringify({ 'nome|horas': { nome: ['nome'], horas: ['horas'], observacoes: [] } }));
  fs.writeFileSync(path.join(folder, '.envio.lock'), '{}');
  fs.mkdirSync(path.join(folder, 'conferencias'));
  legacyReview(path.join(folder, 'conferencias', 'conferencia-2026-09.xlsx'));
  fs.writeFileSync(path.join(folder, 'conferencias', 'envios-2026-09.log'), '{}\n');
  fs.writeFileSync(path.join(folder, 'conferencias', 'faltantes-2026-09.xlsx'), 'x');

  const migrated = migrateLegacyFiles(folder);
  assert.equal(migrated.length, 6);
  assert.deepEqual(loadSession(folder), SESSION);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'aliases.json'), 'utf8')), { Ana: 1001 });
  assert.deepEqual(rememberedMapping(path.join(folder, 'mappings.json'), ['Nome', 'Horas']).name, [0]);
  assert.deepEqual(fs.readdirSync(path.join(folder, 'reviews')).sort(), ['missing-2026-09.xlsx', 'review-2026-09.xlsx', 'submissions-2026-09.log']);
  assert.ok(!fs.existsSync(path.join(folder, 'conferencias')));
  assert.ok(!fs.existsSync(path.join(folder, '.envio.lock')));
  assert.deepEqual(migrateLegacyFiles(folder), []);

  const items = readReview(path.join(folder, 'reviews', 'review-2026-09.xlsx'));
  assert.deepEqual(items.map(item => item.status), ['send', 'already_sent', 'review', 'not_found']);
  assert.deepEqual(items.map(item => item.participated), [true, true, true, false]);
  assert.equal(items[1].pioneer, 'Regular');
  assert.equal(items[2].pioneer, 'Auxiliary');
  assert.deepEqual(items[1].alerts, [{ code: 'text', params: { text: 'AJUSTADO: crédito confirmado' } }, { code: 'text', params: { text: 'enviado pelo importador' } }]);
});
