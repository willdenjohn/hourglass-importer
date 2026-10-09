'use strict';

const relatorios = [];
const usuarios = [
  { id: 2001, firstname: 'Ana', middlename: 'Clara', lastname: 'Exemplo', status: 'Baptized Publisher', group_id: 1 },
  { id: 2002, firstname: 'Bruno', middlename: 'Teste', lastname: 'Ficticio', status: 'Regular Pioneer', group_id: 1 },
];
const responder = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });
const fetchOriginal = global.fetch;

global.fetch = async (url, opcoes = {}) => {
  if (!String(url).startsWith('https://app.hourglass-app.com')) return fetchOriginal(url, opcoes);
  const caminho = String(url).replace('https://app.hourglass-app.com/api/v0.2/', '');
  if (caminho === 'fsreport/startup') {
    return responder({ whoami: { user: {}, congregation: {}, permissions: ['update reports'] }, users: usuarios, fsGroups: [{ id: 1, name: 'GRUPO 1' }], workingMonth: '2026-09' });
  }
  if (caminho.startsWith('fsreport/summary/monthdetail/')) return responder({ reports: relatorios });
  if (caminho.startsWith('fsreport/reports/') && opcoes.method === 'POST') {
    const corpo = JSON.parse(opcoes.body);
    relatorios.push({ ...corpo, id: relatorios.length + 1, reported_at: 'agora' });
    return responder(corpo);
  }
  if (caminho.startsWith('fsreport/reports/')) {
    const id = Number(caminho.split('/').pop());
    return responder({ reports: relatorios.filter(r => r.user.id === id) });
  }
  if (caminho === 'fsreport/summary/missing') return responder({ missing: [] });
  if (caminho === 'fsreport/summary/monthreporttotals') {
    return responder({ month: '2026-09', userCount: 2, missingUserIds: [], enteredByAdminUserIds: [], enteredBySelfUserIds: [], inactiveUserIds: [] });
  }
  return responder({ erro: `rota não simulada: ${caminho}` }, 404);
};
