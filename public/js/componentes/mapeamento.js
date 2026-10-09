import { h } from '../dom.js';

const CAMPOS_PREVIA = ['nome', 'participou', 'estudos', 'pioneiroAuxiliar', 'horas', 'credito', 'tipo', 'observacoes'];

function rotuloColuna(titulos, indice) {
  return `${String.fromCharCode(65 + (indice % 26))}${indice >= 26 ? Math.floor(indice / 26) : ''} · ${titulos[indice] || '(sem título)'}`;
}

function seletorColuna(titulos, valor, usados, aoMudar, rotulo, vazio = '— não usar —') {
  const opcoes = [h('option', { value: '' }, vazio),
    ...titulos.map((_, i) => h('option', { value: i, selected: i === valor, disabled: usados.has(i) && i !== valor }, rotuloColuna(titulos, i)))];
  return h('select', { class: 'entrada entrada--compacta', 'aria-label': rotulo, onChange: e => aoMudar(e.target.value === '' ? null : Number(e.target.value)) }, opcoes);
}

function exemplos(planilha, indices) {
  const valores = indices.flatMap(i => planilha.exemplos[i] ?? []);
  return valores.length ? valores.slice(0, 3).map(v => `"${v}"`).join(', ') : '—';
}

function linhaCampo(campo, planilha, mapeamento, usados, aoAlterar) {
  const indices = mapeamento[campo.chave] ?? [];
  const principal = seletorColuna(planilha.titulos, indices[0] ?? null, usados,
    valor => aoAlterar(campo.chave, valor === null ? [] : [valor, ...indices.slice(1)]), campo.rotulo);
  const extras = indices.slice(1).map(i => h('span', { class: 'selo selo--primario' }, `+ ${rotuloColuna(planilha.titulos, i)}`,
    h('button', { class: 'botao-remover', type: 'button', 'aria-label': 'Remover coluna', onClick: () => aoAlterar(campo.chave, indices.filter(x => x !== i)) }, '×')));
  const adicionar = campo.multiplo && indices.length
    ? seletorColuna(planilha.titulos, null, usados, valor => valor !== null && aoAlterar(campo.chave, [...indices, valor]), `Adicionar coluna a ${campo.rotulo}`, '+ adicionar coluna')
    : null;

  return h('tr', { dataset: { campo: campo.chave } },
    h('td', {}, h('strong', {}, campo.rotulo), campo.obrigatorio ? h('span', { class: 'texto-suave' }, ' (obrigatório)') : null),
    h('td', {}, h('div', { class: 'linha-acoes' }, principal, extras, adicionar)),
    h('td', { class: 'texto-suave' }, exemplos(planilha, indices)));
}

export function tabelaMapeamento(planilha, mapeamento, aoAlterar) {
  const usados = new Set(Object.values(mapeamento).flat());
  return h('div', { class: 'tabela-rolagem' },
    h('table', { class: 'tabela', id: 'tabela-mapeamento' },
      h('thead', {}, h('tr', {}, ['Campo do relatório', 'Coluna da sua planilha', 'Exemplos'].map(t => h('th', {}, t)))),
      h('tbody', {}, planilha.campos.map(campo => linhaCampo(campo, planilha, mapeamento, usados, aoAlterar)))));
}

export function tabelaPrevia(campos, amostra) {
  const rotulos = Object.fromEntries(campos.map(c => [c.chave, c.rotulo]));
  return h('div', { class: 'tabela-rolagem' },
    h('table', { class: 'tabela', id: 'tabela-previa' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Linha'), CAMPOS_PREVIA.map(c => h('th', {}, rotulos[c])))),
      h('tbody', {}, amostra.map(r => h('tr', {}, h('td', { class: 'texto-suave' }, r.linha),
        CAMPOS_PREVIA.map(c => h('td', {}, r[c] === null || r[c] === undefined || r[c] === '' ? h('span', { class: 'texto-suave' }, '—') : String(r[c]))))))));
}
