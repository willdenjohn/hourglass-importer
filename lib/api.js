'use strict';

const BASE_URL = 'https://app.hourglass-app.com/api/v0.2';
const TEMPO_LIMITE = 30000;
const ESPERA_NOVA_TENTATIVA = 1500;
const STATUS_TEMPORARIOS = new Set([429, 502, 503, 504]);

function erroDaApi(mensagem, extras) {
  return Object.assign(new Error(mensagem), extras);
}

function esperar(milissegundos) {
  return new Promise(resolve => setTimeout(resolve, milissegundos));
}

const DESIGNACAO = { Elder: 'Ancião', 'Ministerial Servant': 'Servo ministerial' };
const PERMISSAO_LANCAR = 'update reports';
const PERMISSAO_RESUMO = 'view summary';

function descreverConta({ whoami = {}, users = [], fsGroups = [], workingMonth, lastSubmittedMonth }) {
  const { user = {}, congregation = {}, permissions = [] } = whoami;
  return {
    usuario: {
      nome: [user.firstname, user.lastname].filter(Boolean).join(' '),
      designacao: DESIGNACAO[user.appt] ?? null,
    },
    congregacao: {
      nome: congregation.name ?? '',
      numero: congregation.number ?? null,
      pais: congregation.country?.name ?? congregation.country ?? null,
      fuso: congregation.timezone?.name ?? null,
    },
    permissoes: {
      lancarRelatorios: permissions.includes(PERMISSAO_LANCAR),
      verResumo: permissions.includes(PERMISSAO_RESUMO),
    },
    mesEmAberto: workingMonth ?? null,
    ultimoMesEnviado: lastSubmittedMonth ?? null,
    publicadores: users.length,
    grupos: fsGroups.map(g => g.name).sort(),
  };
}

function criarCliente({ hglogin, xsrf }) {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `hglogin=${hglogin}; X-Hourglass-XSRF-Token=${xsrf}`,
    'X-Hourglass-XSRF-Token': xsrf,
  };

  async function chamar(caminho, opcoes) {
    let resposta;
    try {
      resposta = await fetch(`${BASE_URL}/${caminho}`, { headers, signal: AbortSignal.timeout(TEMPO_LIMITE), ...opcoes });
    } catch (erro) {
      const motivo = erro.name === 'TimeoutError' ? 'não respondeu em 30 segundos' : 'não pôde ser acessado';
      throw erroDaApi(`O Hourglass ${motivo}. Verifique a internet e tente de novo.`, { temporario: true, status: 504 });
    }
    if (resposta.status === 401) throw erroDaApi('Sessão expirada ou inválida (401). Copie os cookies do Hourglass novamente.', { status: 401 });
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw erroDaApi(`Hourglass respondeu ${resposta.status} em ${caminho}${texto ? ': ' + texto.slice(0, 200) : ''}`, {
        status: resposta.status, temporario: STATUS_TEMPORARIOS.has(resposta.status),
      });
    }
    return resposta.json();
  }

  async function requisitar(caminho, opcoes = {}) {
    const leitura = !opcoes.method || opcoes.method === 'GET';
    try {
      return await chamar(caminho, opcoes);
    } catch (erro) {
      if (!leitura || !erro.temporario) throw erro;
      await esperar(ESPERA_NOVA_TENTATIVA);
      return chamar(caminho, opcoes);
    }
  }

  let inicio;
  const carregarInicio = async () => (inicio ??= await requisitar('fsreport/startup'));

  return {
    async publicadores() {
      return (await carregarInicio()).users;
    },
    async grupos() {
      return (await carregarInicio()).fsGroups;
    },
    async conta() {
      return descreverConta(await carregarInicio());
    },
    async faltantes() {
      return requisitar('fsreport/summary/missing');
    },
    async totaisDoMes() {
      return requisitar('fsreport/summary/monthreporttotals');
    },
    async inativos() {
      const lista = await requisitar('fsreport/users/notpublishing');
      return lista.map(u => ({ ...u, id: u.users_id }));
    },
    async relatoriosDoMes(ano, mes) {
      const detalhe = await requisitar(`fsreport/summary/monthdetail/${ano}/${mes}`);
      return detalhe.reports.filter(r => r.reported_at || r.id);
    },
    async relatorioDoPublicador(idPublicador, ano, mes) {
      const { reports = [] } = await requisitar(`fsreport/reports/${idPublicador}`);
      return reports.find(r => r.year === ano && r.month === mes && (r.reported_at || r.id)) ?? null;
    },
    async criarRelatorio(relatorio) {
      return requisitar(`fsreport/reports/${relatorio.user.id}`, {
        method: 'POST',
        body: JSON.stringify(relatorio),
      });
    },
  };
}

module.exports = { criarCliente };
