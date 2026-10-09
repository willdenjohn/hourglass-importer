'use strict';

const xlsx = require('xlsx');

const COLUNAS = [
  ['Nome', 34],
  ['Participou no ministério', 24],
  ['Estudos bíblicos', 16],
  ['Pioneiro auxiliar', 17],
  ['Horas', 8],
  ['Horas de crédito', 16],
  ['Observações', 36],
];

const EXEMPLOS = [
  ['Ana Exemplo da Silva', 'Sim', 1, 'Não', '', '', ''],
  ['Bruno Exemplo Souza', 'Não', '', 'Não', '', '', ''],
  ['Carla Exemplo Lima', 'Sim', 2, 'Sim', 30, '', ''],
  ['Daniel Exemplo Costa', 'Sim', 1, 'Não', 40, 15, 'Crédito: construção de Salão do Reino'],
];

const INSTRUCOES = [
  ['Coluna', 'O que preencher', 'Obrigatória'],
  ['Nome', 'Nome completo como está no Hourglass. Apelidos podem ser associados uma vez na conferência.', 'Sim'],
  ['Participou no ministério', 'Sim ou Não. Vale para publicadores; pioneiros contam como participantes.', 'Sim (ou Horas)'],
  ['Estudos bíblicos', 'Quantidade de estudos dirigidos no mês, só o número. Deixe em branco se não dirigiu.', 'Não'],
  ['Pioneiro auxiliar', 'Sim se foi pioneiro auxiliar neste mês. Pioneiros regulares e auxiliares contínuos vêm do cadastro do Hourglass.', 'Não'],
  ['Horas', 'Horas no ministério, número inteiro. Obrigatório para pioneiros; publicadores deixam em branco.', 'Sim para pioneiros'],
  ['Horas de crédito', 'Só pioneiros regulares e especiais. Campo + crédito não pode passar de 55 horas no mês.', 'Não'],
  ['Observações', 'Texto livre que vai para o campo de observações do relatório no Hourglass.', 'Não'],
  [],
  ['Dicas', '', ''],
  ['', 'Uma linha por publicador. Mantenha os títulos da primeira linha como estão.', ''],
  ['', 'Use números nas colunas de horas e estudos (ex.: 30, não "trinta horas").', ''],
  ['', 'Se o mesmo nome aparecer duas vezes, vale a última linha.', ''],
  ['', 'Outras colunas extras são ignoradas; planilhas com títulos diferentes podem ser mapeadas na tela de importação.', ''],
];

function folha(linhas, larguras) {
  const resultado = xlsx.utils.aoa_to_sheet(linhas);
  resultado['!cols'] = larguras.map(wch => ({ wch }));
  return resultado;
}

function gerarModelo() {
  const pasta = xlsx.utils.book_new();
  const relatorios = folha([COLUNAS.map(([titulo]) => titulo), ...EXEMPLOS], COLUNAS.map(([, largura]) => largura));
  relatorios['!autofilter'] = { ref: relatorios['!ref'] };
  xlsx.utils.book_append_sheet(pasta, relatorios, 'Relatórios');
  xlsx.utils.book_append_sheet(pasta, folha(INSTRUCOES, [26, 100, 20]), 'Instruções');
  return xlsx.write(pasta, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { gerarModelo, COLUNAS_MODELO: COLUNAS.map(([titulo]) => titulo) };
