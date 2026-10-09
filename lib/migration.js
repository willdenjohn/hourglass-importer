'use strict';

const fs = require('fs');
const path = require('path');

const FILES = [['sessao.json', 'session.json'], ['apelidos.json', 'aliases.json']];
const LEGACY_FOLDER = 'conferencias';
const NEW_FOLDER = 'reviews';
const LEGACY_PREFIXES = [['conferencia-', 'review-'], ['faltantes-', 'missing-'], ['envios-', 'submissions-']];
const MAPPING_KEYS = {
  nome: 'name', participou: 'participated', estudos: 'studies', pioneiroAuxiliar: 'auxiliaryPioneer', horas: 'hours',
  credito: 'credit', observacoes: 'notes', tipo: 'type', dirigiu: 'conducted',
};

function moveFile(from, to, migrated) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return;
  fs.renameSync(from, to);
  migrated.push(`${path.basename(from)} → ${path.basename(to)}`);
}

function migrateMappings(folder, migrated) {
  const from = path.join(folder, 'mapeamentos.json');
  const to = path.join(folder, 'mappings.json');
  if (!fs.existsSync(from) || fs.existsSync(to)) return;
  const legacy = JSON.parse(fs.readFileSync(from, 'utf8'));
  const converted = Object.fromEntries(Object.entries(legacy).map(([signature, mapping]) => [
    signature,
    Object.fromEntries(Object.entries(mapping).map(([key, titles]) => [MAPPING_KEYS[key] ?? key, titles])),
  ]));
  fs.writeFileSync(to, JSON.stringify(converted, null, 2) + '\n');
  fs.rmSync(from);
  migrated.push('mapeamentos.json → mappings.json');
}

function renamedFile(name) {
  const match = LEGACY_PREFIXES.find(([prefix]) => name.startsWith(prefix));
  return match ? match[1] + name.slice(match[0].length) : name;
}

function migrateReviews(folder, migrated) {
  const from = path.join(folder, LEGACY_FOLDER);
  if (!fs.existsSync(from)) return;
  const to = path.join(folder, NEW_FOLDER);
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    moveFile(path.join(from, name), path.join(to, renamedFile(name)), migrated);
  }
  if (!fs.readdirSync(from).length) fs.rmdirSync(from);
}

function migrateLegacyFiles(folder) {
  const migrated = [];
  FILES.forEach(([from, to]) => moveFile(path.join(folder, from), path.join(folder, to), migrated));
  migrateMappings(folder, migrated);
  migrateReviews(folder, migrated);
  fs.rmSync(path.join(folder, '.envio.lock'), { force: true });
  return migrated;
}

module.exports = { migrateLegacyFiles };
