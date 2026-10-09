'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const xlsx = require('xlsx');
const { criarAplicacao } = require('../servidor');

const PUBLICADORES = [
  { id: 1001, firstname: 'Ana', middlename: 'Clara', lastname: 'Exemplo', status: 'Baptized Publisher', group_id: 1, cellphone: '(00) 00000-0000' },
  { id: 1002, firstname: 'Bruno', middlename: 'Teste', lastname: 'Ficticio', status: 'Regular Pioneer', group_id: 1 },
  { id: 1003, firstname: 'Carla', middlename: 'Modelo', lastname: 'Silva', status: 'Continuous Auxiliary Pioneer', group_id: 2 },
  { id: 1004, firstname: 'Daniel', middlename: 'Amostra', lastname: 'Costa', status: 'Baptized Publisher', group_id: 2 },
  { id: 1005, firstname: 'Elisa', middlename: 'Demo', lastname: 'Souza', status: 'Regular Pioneer', group_id: 2 },
  { id: 1006, firstname: 'Fabio', middlename: 'Exemplo', lastname: 'Lima', status: 'Unbaptized Publisher', group_id: 1 },
  { id: 1007, firstname: 'Giovana', middlename: 'Teste', lastname: 'Rocha', status: 'Baptized Publisher', group_id: 1 },
  { id: 1008, firstname: 'Giordana', middlename: 'Teste', lastname: 'Rocha', status: 'Baptized Publisher', group_id: 1 },
  { id: 1009, firstname: 'Heitor', middlename: 'Ficticio', lastname: 'Nunes', status: 'Baptized Publisher', group_id: 2 },
  { id: 1010, firstname: 'Ana', middlename: 'Clara', lastname: 'Exemplo', status: 'Baptized Publisher', group_id: null },
];
const GRUPOS = [{ id: 1, name: 'GRUPO 1', overseer_id: 1001 }, { id: 2, name: 'GRUPO 2', overseer_id: 1004 }];
const INATIVOS = [{ users_id: 1099, firstname: 'Igor', middlename: null, lastname: 'Inativo' }];
const SESSAO = { hglogin: 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.x', xsrf: 'teste' };

function criarHourglassFalso({ falhas = {}, mesEmAberto = '2026-09', ultimoMesEnviado = '2026-08', permissoes = ['update reports', 'view summary'] } = {}) {
  const estado = { relatorios: [], criados: [], clientes: 0, falhasUsadas: new Set() };
  const atraso = () => new Promise(resolve => setTimeout(resolve, 15));

  const cliente = {
    async conta() {
      return {
        usuario: { nome: 'Usuário Teste', designacao: 'Ancião' },
        congregacao: { nome: 'Congregação Exemplo', numero: 12345, pais: 'Brasil', fuso: 'America/Sao_Paulo' },
        permissoes: { lancarRelatorios: permissoes.includes('update reports'), verResumo: permissoes.includes('view summary') },
        mesEmAberto, ultimoMesEnviado, publicadores: PUBLICADORES.length, grupos: GRUPOS.map(g => g.name),
      };
    },
    publicadores: async () => PUBLICADORES,
    grupos: async () => GRUPOS,
    inativos: async () => INATIVOS.map(u => ({ ...u, id: u.users_id })),
    relatoriosDoMes: async (ano, mes) => estado.relatorios.filter(r => r.year === ano && r.month === mes),
    relatorioDoPublicador: async (id, ano, mes) => estado.relatorios.find(r => r.user.id === id && r.year === ano && r.month === mes) ?? null,
    async criarRelatorio(relatorio) {
      await atraso();
      const falha = falhas[relatorio.user.id];
      const primeira = falha && !estado.falhasUsadas.has(relatorio.user.id);
      if (falha === 'permanente') throw new Error('Hourglass respondeu 500');
      if (primeira) estado.falhasUsadas.add(relatorio.user.id);
      if (primeira && falha === 'depois-de-salvar') {
        estado.relatorios.push({ ...relatorio, reported_at: 'agora' });
        estado.criados.push(relatorio);
        throw Object.assign(new Error('tempo esgotado'), { temporario: true });
      }
      if (primeira && falha === 'antes-de-salvar') throw Object.assign(new Error('503'), { temporario: true });
      estado.relatorios.push({ ...relatorio, reported_at: 'agora' });
      estado.criados.push(relatorio);
      return relatorio;
    },
    async faltantes() {
      const entregues = new Set(estado.relatorios.map(r => r.user.id));
      return { missing: PUBLICADORES.filter(p => p.group_id && !entregues.has(p.id)).map(p => ({ user: { id: p.id }, months: [mesEmAberto] })) };
    },
    async totaisDoMes() {
      return { month: mesEmAberto, userCount: PUBLICADORES.length, missingUserIds: [], enteredByAdminUserIds: estado.relatorios.map(r => r.user.id), enteredBySelfUserIds: [], inactiveUserIds: [] };
    },
  };

  return { estado, criarCliente: () => { estado.clientes++; return cliente; } };
}

const pastasCriadas = [];
process.on('exit', () => pastasCriadas.forEach(pasta => fs.rmSync(pasta, { recursive: true, force: true })));

function pastaTemporaria() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'importador-teste-'));
  pastasCriadas.push(pasta);
  fs.writeFileSync(path.join(pasta, 'sessao.json'), JSON.stringify(SESSAO));
  return pasta;
}

async function subirServidor(opcoes = {}) {
  const pasta = opcoes.pasta ?? pastaTemporaria();
  const hourglass = opcoes.hourglass ?? criarHourglassFalso(opcoes.falso);
  const servidor = http.createServer(criarAplicacao({ pasta, criarCliente: hourglass.criarCliente }));
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${servidor.address().port}`;
  const chamar = async (rota, metodo = 'GET', corpo, cabecalhos = {}) => {
    const json = corpo !== undefined && !Buffer.isBuffer(corpo);
    const resposta = await fetch(base + rota, {
      method: metodo,
      headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...cabecalhos },
      body: corpo === undefined ? undefined : json ? JSON.stringify(corpo) : corpo,
    });
    const tipo = resposta.headers.get('content-type') ?? '';
    const dados = tipo.includes('application/json') ? await resposta.json() : await resposta.text();
    return { status: resposta.status, dados, cabecalhos: resposta.headers };
  };
  const fechar = () => new Promise(resolve => { servidor.closeAllConnections(); servidor.close(resolve); });
  return { base, pasta, hourglass, chamar, fechar };
}

function planilha(linhas) {
  const pasta = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(pasta, xlsx.utils.aoa_to_sheet(linhas), 'Planilha');
  return xlsx.write(pasta, { type: 'buffer', bookType: 'xlsx' });
}

const TITULOS_FORMS = [
  'ID', 'Hora de início', 'Hora de conclusão', 'Email', 'Nome', 'Hora da última modificação',
  'Escreva seu nome completo', 'você é do grupo do:', 'Você é:',
  'Você participou de alguma modalidade no ministério esse mês? publicador',
  'Dirigiu estudo esse mês? ', 'Dirigiu estudo esse mês?', 'Quantos estudos você dirigiu?', 'Quantos estudos você dirigiu?2',
  'Digite a quantidade de horas?',
];

function linhaForms(nome, tipo, { participou = null, dirigiuPub = null, dirigiuPio = null, estudosPub = null, estudosPio = null, horas = null } = {}) {
  return [1, '', '', 'anonymous', '', '', nome, 'Grupo 1', tipo, participou, dirigiuPub, dirigiuPio, estudosPub, estudosPio, horas];
}

function planilhaForms() {
  return planilha([
    TITULOS_FORMS,
    linhaForms('Ana Clara Exemplo', 'Publicador', { participou: 'Sim', dirigiuPub: 'Sim', estudosPub: '1' }),
    linhaForms('Bruno Teste Ficticio', 'Pioneiro(a) Regular', { dirigiuPio: 'Sim', estudosPio: 'Dois estudos', horas: '40 horas + 20 crédito construção' }),
    linhaForms('Carla Modelo Silva', 'Pioneiro(a) Auxiliar', { horas: '30h' }),
    linhaForms('Daniel Amostra Costa', 'Publicador', { participou: 'Não' }),
    linhaForms('Elisa Demo Souza', 'Pioneiro(a) Regular', { horas: 52 }),
    linhaForms('Fabio Exemplo Lima', 'Publicador', { participou: 'Sim' }),
    linhaForms('Giovana Teste Rocha', 'Publicador', { participou: 'Sim' }),
    linhaForms('Giordana Teste Rocha', 'Publicador', { participou: 'Sim' }),
    linhaForms('Pessoa Desconhecida', 'Publicador', { participou: 'Sim' }),
    linhaForms('Igor Inativo', 'Publicador', { participou: 'Sim' }),
    linhaForms('Fabio Exemplo Lima', 'Publicador', { participou: 'Sim', dirigiuPub: 'Sim', estudosPub: 2 }),
  ]);
}

function lerNdjson(texto) {
  return String(texto).trim().split('\n').filter(Boolean).map(linha => JSON.parse(linha));
}

module.exports = {
  PUBLICADORES, GRUPOS, SESSAO, TITULOS_FORMS,
  criarHourglassFalso, pastaTemporaria, subirServidor, planilha, planilhaForms, linhaForms, lerNdjson,
};
