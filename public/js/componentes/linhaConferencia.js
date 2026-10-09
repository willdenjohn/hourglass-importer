import { h, opcoes } from '../dom.js';
import { SITUACOES } from '../estado.js';
import { errosDoItem, camposInvalidos } from '../validacao.js';

const OPCOES_PIONEIRO = [['', '—'], ['Regular', 'Regular'], ['Auxiliar', 'Auxiliar'], ['Especial', 'Especial']];
const STATUS_PT = {
  'Baptized Publisher': 'Publicador batizado',
  'Unbaptized Publisher': 'Publicador não batizado',
  'Regular Pioneer': 'Pioneiro regular',
  'Continuous Auxiliary Pioneer': 'Pioneiro auxiliar contínuo',
  'Special Pioneer': 'Pioneiro especial',
};
const OPCOES_PARTICIPOU = [['', '—'], ['SIM', 'Sim'], ['NÃO', 'Não']];

function seletor(valor, lista, aoMudar, rotulo) {
  return h('select', { class: 'entrada entrada--compacta', 'aria-label': rotulo, onChange: e => aoMudar(e.target.value) }, opcoes(lista, valor));
}

function campoNumero(valor, aoMudar, rotulo, invalido) {
  return h('input', {
    class: `entrada entrada--compacta entrada--numero${invalido ? ' entrada--invalida' : ''}`,
    type: 'number', min: 0, step: 1, value: valor ?? '', 'aria-label': rotulo,
    onChange: e => aoMudar(e.target.value === '' ? '' : Number(e.target.value)),
  });
}

function seletorPublicador(item, publicadores, aoMudar) {
  const lista = [['', '— escolher —'], ...publicadores.map(p => [p.id, p.nome])];
  return seletor(item.id, lista, valor => aoMudar(valor ? Number(valor) : ''), 'Publicador no Hourglass');
}

function celulaAlertas(item) {
  const erros = errosDoItem(item);
  const alertas = String(item.alertas || '').split(' | ').filter(Boolean);
  return h('td', { class: 'celula-alertas' },
    erros.map(e => h('span', { class: 'celula-alertas__item celula-alertas__item--erro' }, `✖ ${e}`)),
    alertas.map(a => h('span', { class: 'celula-alertas__item' }, a)),
    item.horasOriginal ? h('span', { class: 'celula-alertas__item' }, `Forms: "${item.horasOriginal}"`) : null);
}

function botaoLembrar(item, aoLembrar) {
  if (item.correspondencia !== 'manual' || !item.id || item.apelidoSalvo) return null;
  return h('button', { class: 'botao botao--pequeno', onClick: () => aoLembrar(item) }, 'Lembrar este nome');
}

export function linhaConferencia(item, publicadores, { aoAlterar, aoTrocarPublicador, aoLembrar }) {
  const alterar = campo => valor => aoAlterar(item, { [campo]: valor });
  const invalidos = camposInvalidos(item);

  return h('tr', { dataset: { situacao: item.situacao, linha: item.linha } },
    h('td', {}, seletor(item.situacao, SITUACOES.map(s => [s, s]), alterar('situacao'), 'Situação')),
    h('td', { class: 'texto-suave' }, item.linha),
    h('td', { class: 'celula-nome' },
      h('div', {}, item.nomeFormulario),
      h('div', { class: 'texto-suave' }, item.tipoFormulario || '')),
    h('td', { class: 'celula-nome' },
      seletorPublicador(item, publicadores, id => aoTrocarPublicador(item, id)),
      item.cadastro ? h('div', { class: 'texto-suave' }, STATUS_PT[item.cadastro] ?? item.cadastro) : null,
      botaoLembrar(item, aoLembrar)),
    h('td', {}, seletor(item.participou, OPCOES_PARTICIPOU, alterar('participou'), 'Participou')),
    h('td', {}, campoNumero(item.horas, alterar('horas'), 'Horas', invalidos.horas)),
    h('td', {}, campoNumero(item.credito, alterar('credito'), 'Crédito', invalidos.credito)),
    h('td', {}, campoNumero(item.estudos, alterar('estudos'), 'Estudos')),
    h('td', {}, seletor(item.pioneiro, OPCOES_PIONEIRO, alterar('pioneiro'), 'Pioneiro')),
    celulaAlertas(item));
}
