'use strict';

const xlsx = require('xlsx');
const { nomeCompleto } = require('./correspondencia');

const STATUS_PT = {
  'Baptized Publisher': 'Publicador batizado',
  'Unbaptized Publisher': 'Publicador não batizado',
  'Regular Pioneer': 'Pioneiro regular',
  'Continuous Auxiliary Pioneer': 'Pioneiro auxiliar contínuo',
  'Special Pioneer': 'Pioneiro especial',
};

function formatarMes(mes) {
  const [ano, numero] = mes.split('-');
  return `${numero}/${ano}`;
}

function descrever(publicador, grupos, meses) {
  const grupo = grupos.get(publicador?.group_id);
  return {
    grupo: grupo?.name ?? 'SEM GRUPO',
    dirigente: grupo?.dirigente ?? '',
    nome: publicador ? nomeCompleto(publicador) : '(desconhecido)',
    status: STATUS_PT[publicador?.status] ?? publicador?.status ?? '',
    telefone: publicador?.cellphone || publicador?.homephone || '',
    mesesSemRelatorio: meses.length,
    meses: meses.map(formatarMes).join(', '),
  };
}

function mapearGrupos(grupos, porId) {
  return new Map(grupos.map(g => [g.id, { name: g.name, dirigente: porId.get(g.overseer_id) ? nomeCompleto(porId.get(g.overseer_id)) : '' }]));
}

function ordenar(lista) {
  return lista.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome));
}

async function levantarFaltantes(cliente) {
  const [publicadores, grupos, faltantes, totais] = await Promise.all([
    cliente.publicadores(), cliente.grupos(), cliente.faltantes(), cliente.totaisDoMes(),
  ]);
  const porId = new Map(publicadores.map(p => [p.id, p]));
  const mapaGrupos = mapearGrupos(grupos, porId);
  const inativos = new Set(totais.inactiveUserIds ?? []);
  const linhas = faltantes.missing.map(f => ({ id: f.user.id, ...descrever(porId.get(f.user.id), mapaGrupos, f.months) }));

  return {
    mes: totais.month,
    totais: {
      ativos: totais.userCount,
      entregues: (totais.enteredByAdminUserIds?.length ?? 0) + (totais.enteredBySelfUserIds?.length ?? 0),
      faltando: totais.missingUserIds?.length ?? 0,
      inativos: inativos.size,
    },
    faltantes: ordenar(linhas.filter(l => !inativos.has(l.id))),
    inativos: ordenar(linhas.filter(l => inativos.has(l.id))),
  };
}

function imprimirFaltantes({ mes, totais, faltantes, inativos }) {
  console.log(`\n═══ RELATÓRIOS EM FALTA — ${formatarMes(mes)} ═══`);
  console.log(`Ativos: ${totais.ativos} | Entregues: ${totais.entregues} | Faltando: ${totais.faltando} | Inativos: ${totais.inativos}`);
  let grupoAtual;
  for (const f of faltantes) {
    if (f.grupo !== grupoAtual) {
      grupoAtual = f.grupo;
      console.log(`\n${f.grupo}${f.dirigente ? ` — dirigente: ${f.dirigente}` : ''}`);
    }
    const atraso = f.mesesSemRelatorio > 1 ? ` — ${f.mesesSemRelatorio} meses em falta (${f.meses})` : '';
    console.log(`  - ${f.nome} (${f.status})${f.telefone ? ` — ${f.telefone}` : ''}${atraso}`);
  }
  if (inativos.length) {
    console.log(`\nInativos (6+ meses sem relatório): ${inativos.map(i => i.nome).join('; ')}`);
  }
}

function salvarFaltantes(caminho, { faltantes, inativos }) {
  const colunas = [['Grupo', 'grupo', 12], ['Dirigente', 'dirigente', 28], ['Nome', 'nome', 38], ['Situação', 'status', 26], ['Telefone', 'telefone', 18], ['Meses em falta', 'mesesSemRelatorio', 14], ['Meses', 'meses', 60]];
  const pasta = xlsx.utils.book_new();
  for (const [titulo, lista] of [['Em falta', faltantes], ['Inativos', inativos]]) {
    const folha = xlsx.utils.aoa_to_sheet([colunas.map(c => c[0]), ...lista.map(l => colunas.map(c => l[c[1]]))]);
    folha['!cols'] = colunas.map(c => ({ wch: c[2] }));
    xlsx.utils.book_append_sheet(pasta, folha, titulo);
  }
  xlsx.writeFile(pasta, caminho);
}

function mensagemGeral({ mes, faltantes }) {
  const grupos = new Map();
  faltantes.forEach(f => grupos.set(f.grupo, [...(grupos.get(f.grupo) || []), f]));
  const blocos = [...grupos.entries()].map(([grupo, membros]) =>
    [`*${grupo}*`, ...membros.map(m => `• ${m.nome}${m.mesesSemRelatorio > 1 ? ` (${m.mesesSemRelatorio} meses)` : ''}`)].join('\n'));
  return [
    'Olá!',
    `Segue a lista dos publicadores que ainda não entregaram o relatório de ${formatarMes(mes)} (${faltantes.length} no total):`,
    ...blocos,
    'Por favor, ajudem a lembrá-los de enviar o relatório o quanto antes. Obrigado!',
  ].join('\n\n');
}

module.exports = { levantarFaltantes, imprimirFaltantes, salvarFaltantes, mensagemGeral };
