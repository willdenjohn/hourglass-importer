'use strict';

const xlsx = require('xlsx');
const { PIONEIRO } = require('./interpretar');
const { normalizar, vazio, simOuNao } = require('./texto');

const SITUACAO = {
  enviar: 'ENVIAR',
  revisar: 'REVISAR',
  lancado: 'JÁ LANÇADO',
  naoEncontrado: 'NÃO ENCONTRADO',
  ignorar: 'IGNORAR',
};

const COLUNAS = [
  ['Situação', 'situacao', 16],
  ['Linha', 'linha', 7],
  ['Nome no formulário', 'nomeFormulario', 34],
  ['Tipo (formulário)', 'tipoFormulario', 20],
  ['ID Hourglass', 'id', 12],
  ['Nome no Hourglass', 'nomeHourglass', 34],
  ['Cadastro', 'cadastro', 24],
  ['Correspondência', 'correspondencia', 15],
  ['Participou', 'participou', 10],
  ['Horas', 'horas', 8],
  ['Crédito', 'credito', 8],
  ['Estudos', 'estudos', 8],
  ['Pioneiro', 'pioneiro', 10],
  ['Observações', 'observacoes', 30],
  ['Horas (texto original)', 'horasOriginal', 30],
  ['Alertas', 'alertas', 70],
];

const PIONEIRO_PT = { [PIONEIRO.Regular]: 'Regular', [PIONEIRO.Auxiliar]: 'Auxiliar', [PIONEIRO.Especial]: 'Especial' };
const PIONEIRO_API = Object.fromEntries(Object.entries(PIONEIRO_PT).map(([api, pt]) => [normalizar(pt), api]));

function paraLinha(item) {
  return COLUNAS.map(([, campo]) => item[campo] ?? '');
}

function escreverConferencia(caminho, itens) {
  const folha = xlsx.utils.aoa_to_sheet([COLUNAS.map(([titulo]) => titulo), ...itens.map(paraLinha)]);
  folha['!cols'] = COLUNAS.map(([, , largura]) => ({ wch: largura }));
  folha['!autofilter'] = { ref: folha['!ref'] };
  const pasta = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(pasta, folha, 'Conferência');
  xlsx.writeFile(pasta, caminho);
}

function lerConferencia(caminho) {
  const pasta = xlsx.readFile(caminho);
  const linhas = xlsx.utils.sheet_to_json(pasta.Sheets[pasta.SheetNames[0]], { header: 1, defval: null });
  const indices = Object.fromEntries(COLUNAS.map(([titulo, campo]) => [campo, linhas[0].indexOf(titulo)]));
  return linhas.slice(1).map(linha => Object.fromEntries(Object.entries(indices).map(([campo, i]) => [campo, i >= 0 ? linha[i] : null])));
}

function numeroOuNulo(valor) {
  if (vazio(valor)) return null;
  const numero = Number(String(valor).replace(',', '.'));
  return Number.isNaN(numero) ? NaN : numero;
}

function minutosValidos(minutos) {
  return minutos === 0 || minutos === 1 || [15, 30, 45].includes(minutos) || (minutos % 60 === 0 && minutos / 60 <= 500);
}

function montarRelatorio(item, ano, mes) {
  const erros = [];
  const id = numeroOuNulo(item.id);
  const pioneer = vazio(item.pioneiro) ? null : PIONEIRO_API[normalizar(item.pioneiro)];
  const horas = numeroOuNulo(item.horas);
  const credito = numeroOuNulo(item.credito);
  const estudos = numeroOuNulo(item.estudos);
  const participou = simOuNao(item.participou);

  if (!id) erros.push('sem ID Hourglass');
  if (pioneer === undefined) erros.push(`pioneiro inválido: "${item.pioneiro}"`);
  if ([horas, credito, estudos].some(Number.isNaN)) erros.push('horas, crédito ou estudos não numéricos');
  if (pioneer && horas === null) erros.push('pioneiro sem horas');
  if (!pioneer && participou === null) erros.push('participou deve ser SIM ou NÃO');
  if (credito && pioneer !== PIONEIRO.Regular && pioneer !== PIONEIRO.Especial) erros.push('crédito só vale para pioneiro regular/especial');
  if (credito && (horas ?? 0) + credito > 55) erros.push(`campo + crédito passa de 55h (${horas} + ${credito})`);

  const minutos = pioneer ? Math.round((horas ?? 0) * 60) : (participou ? 1 : 0);
  if (!minutosValidos(minutos)) erros.push(`horas inválidas para o Hourglass (${horas}) — use horas inteiras`);

  const relatorio = {
    id: 0,
    user: { id },
    month: mes,
    year: ano,
    minutes: minutos,
    studies: estudos || null,
    credithours: credito || null,
    pioneer: pioneer ?? null,
    remarks: vazio(item.observacoes) ? null : String(item.observacoes).trim(),
  };
  return { relatorio, erros };
}

module.exports = { SITUACAO, PIONEIRO_PT, escreverConferencia, lerConferencia, montarRelatorio };
