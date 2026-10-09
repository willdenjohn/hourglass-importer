'use strict';

const BASE_URL = 'https://app.hourglass-app.com/api/v0.2';

function criarCliente({ hglogin, xsrf }) {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `hglogin=${hglogin}; X-Hourglass-XSRF-Token=${xsrf}`,
    'X-Hourglass-XSRF-Token': xsrf,
  };

  async function requisitar(caminho, opcoes = {}) {
    const resposta = await fetch(`${BASE_URL}/${caminho}`, { headers, ...opcoes });
    if (resposta.status === 401) throw new Error('Sessão expirada ou inválida (401). Copie os cookies do Hourglass novamente.');
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new Error(`HTTP ${resposta.status} em ${caminho}${texto ? ': ' + texto.slice(0, 200) : ''}`);
    }
    return resposta.json();
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
    async criarRelatorio(relatorio) {
      return requisitar(`fsreport/reports/${relatorio.user.id}`, {
        method: 'POST',
        body: JSON.stringify(relatorio),
      });
    },
  };
}

module.exports = { criarCliente };
