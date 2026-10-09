'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const xlsx = require('xlsx');
const { createApp } = require('../server');

const PUBLISHERS = [
  { id: 1001, firstname: 'Ana', middlename: 'Clara', lastname: 'Example', status: 'Baptized Publisher', group_id: 1, cellphone: '(00) 00000-0000' },
  { id: 1002, firstname: 'Bruno', middlename: 'Test', lastname: 'Fictional', status: 'Regular Pioneer', group_id: 1 },
  { id: 1003, firstname: 'Carla', middlename: 'Sample', lastname: 'Silva', status: 'Continuous Auxiliary Pioneer', group_id: 2 },
  { id: 1004, firstname: 'Daniel', middlename: 'Demo', lastname: 'Costa', status: 'Baptized Publisher', group_id: 2 },
  { id: 1005, firstname: 'Elisa', middlename: 'Demo', lastname: 'Souza', status: 'Regular Pioneer', group_id: 2 },
  { id: 1006, firstname: 'Fabio', middlename: 'Example', lastname: 'Lima', status: 'Unbaptized Publisher', group_id: 1 },
  { id: 1007, firstname: 'Giovana', middlename: 'Test', lastname: 'Rocha', status: 'Baptized Publisher', group_id: 1 },
  { id: 1008, firstname: 'Giordana', middlename: 'Test', lastname: 'Rocha', status: 'Baptized Publisher', group_id: 1 },
  { id: 1009, firstname: 'Heitor', middlename: 'Fictional', lastname: 'Nunes', status: 'Baptized Publisher', group_id: 2 },
  { id: 1010, firstname: 'Ana', middlename: 'Clara', lastname: 'Example', status: 'Baptized Publisher', group_id: null },
];
const GROUPS = [{ id: 1, name: 'GROUP 1', overseer_id: 1001 }, { id: 2, name: 'GROUP 2', overseer_id: 1004 }];
const INACTIVE = [{ users_id: 1099, firstname: 'Igor', middlename: null, lastname: 'Inactive' }];
const SESSION = { hglogin: 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.x', xsrf: 'test' };

const createdFolders = [];
process.on('exit', () => createdFolders.forEach(folder => fs.rmSync(folder, { recursive: true, force: true })));

function createFakeHourglass({ failures = {}, openMonth = '2026-09', lastSubmittedMonth = '2026-08', permissions = ['update reports', 'view summary'] } = {}) {
  const state = { reports: [], created: [], clients: 0, usedFailures: new Set() };
  const delay = () => new Promise(resolve => setTimeout(resolve, 15));

  const client = {
    async account() {
      return {
        user: { name: 'Test User', appointment: 'Elder' },
        congregation: { name: 'Example Congregation', number: 12345, country: 'Brazil', timezone: 'America/Sao_Paulo' },
        permissions: { submitReports: permissions.includes('update reports'), viewSummary: permissions.includes('view summary') },
        openMonth, lastSubmittedMonth, publishers: PUBLISHERS.length, groups: GROUPS.map(group => group.name),
      };
    },
    publishers: async () => PUBLISHERS,
    groups: async () => GROUPS,
    inactivePublishers: async () => INACTIVE.map(user => ({ ...user, id: user.users_id })),
    reportsOfMonth: async (year, month) => state.reports.filter(report => report.year === year && report.month === month),
    reportOfPublisher: async (id, year, month) => state.reports.find(report => report.user.id === id && report.year === year && report.month === month) ?? null,
    async createReport(report) {
      await delay();
      const failure = failures[report.user.id];
      const first = failure && !state.usedFailures.has(report.user.id);
      if (failure === 'permanent') throw Object.assign(new Error('hourglass_http'), { code: 'hourglass_http', params: { status: 500, route: 'reports' } });
      if (first) state.usedFailures.add(report.user.id);
      if (first && failure === 'after-saving') {
        state.reports.push({ ...report, reported_at: 'now' });
        state.created.push(report);
        throw Object.assign(new Error('hourglass_timeout'), { code: 'hourglass_timeout', temporary: true });
      }
      if (first && failure === 'before-saving') throw Object.assign(new Error('hourglass_http'), { code: 'hourglass_http', temporary: true });
      state.reports.push({ ...report, reported_at: 'now' });
      state.created.push(report);
      return report;
    },
    async missingReports() {
      const sent = new Set(state.reports.map(report => report.user.id));
      return { missing: PUBLISHERS.filter(publisher => publisher.group_id && !sent.has(publisher.id)).map(publisher => ({ user: { id: publisher.id }, months: [openMonth] })) };
    },
    async monthTotals() {
      return { month: openMonth, userCount: PUBLISHERS.length, missingUserIds: [], enteredByAdminUserIds: state.reports.map(report => report.user.id), enteredBySelfUserIds: [], inactiveUserIds: [] };
    },
  };

  return { state, createClient: () => { state.clients++; return client; } };
}

function temporaryFolder() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hourglass-importer-test-'));
  createdFolders.push(folder);
  fs.writeFileSync(path.join(folder, 'session.json'), JSON.stringify(SESSION));
  return folder;
}

async function startServer(options = {}) {
  const folder = options.folder ?? temporaryFolder();
  const hourglass = options.hourglass ?? createFakeHourglass(options.fake);
  const server = http.createServer(createApp({ folder, createClient: hourglass.createClient }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const call = async (route, method = 'GET', body, headers = {}) => {
    const isJson = body !== undefined && !Buffer.isBuffer(body);
    const response = await fetch(base + route, {
      method,
      headers: { 'X-Language': options.language ?? 'en', ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
    });
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data, headers: response.headers };
  };
  const close = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  return { base, folder, hourglass, call, close };
}

function spreadsheet(rows) {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(rows), 'Sheet');
  return xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
}

const FORMS_TITLES = [
  'ID', 'Hora de início', 'Hora de conclusão', 'Email', 'Nome', 'Hora da última modificação',
  'Escreva seu nome completo', 'você é do grupo do:', 'Você é:',
  'Você participou de alguma modalidade no ministério esse mês? publicador',
  'Dirigiu estudo esse mês? ', 'Dirigiu estudo esse mês?', 'Quantos estudos você dirigiu?', 'Quantos estudos você dirigiu?2',
  'Digite a quantidade de horas?',
];

function formsRow(name, type, { participated = null, conductedPublisher = null, conductedPioneer = null, studiesPublisher = null, studiesPioneer = null, hours = null } = {}) {
  return [1, '', '', 'anonymous', '', '', name, 'Group 1', type, participated, conductedPublisher, conductedPioneer, studiesPublisher, studiesPioneer, hours];
}

function formsSpreadsheet() {
  return spreadsheet([
    FORMS_TITLES,
    formsRow('Ana Clara Example', 'Publicador', { participated: 'Sim', conductedPublisher: 'Sim', studiesPublisher: '1' }),
    formsRow('Bruno Test Fictional', 'Pioneiro(a) Regular', { conductedPioneer: 'Sim', studiesPioneer: 'Dois estudos', hours: '40 horas + 20 crédito construção' }),
    formsRow('Carla Sample Silva', 'Pioneiro(a) Auxiliar', { hours: '30h' }),
    formsRow('Daniel Demo Costa', 'Publicador', { participated: 'Não' }),
    formsRow('Elisa Demo Souza', 'Pioneiro(a) Regular', { hours: 52 }),
    formsRow('Fabio Example Lima', 'Publicador', { participated: 'Sim' }),
    formsRow('Giovana Test Rocha', 'Publicador', { participated: 'Sim' }),
    formsRow('Giordana Test Rocha', 'Publicador', { participated: 'Sim' }),
    formsRow('Unknown Person', 'Publicador', { participated: 'Sim' }),
    formsRow('Igor Inactive', 'Publicador', { participated: 'Sim' }),
    formsRow('Fabio Example Lima', 'Publicador', { participated: 'Sim', conductedPublisher: 'Sim', studiesPublisher: 2 }),
  ]);
}

function parseNdjson(text) {
  return String(text).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

module.exports = {
  PUBLISHERS, GROUPS, SESSION, FORMS_TITLES,
  createFakeHourglass, temporaryFolder, startServer, spreadsheet, formsSpreadsheet, formsRow, parseNdjson,
};
