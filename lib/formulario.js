'use strict';

const fs = require('fs');
const xlsx = require('xlsx');
const { normalizar, vazio } = require('./texto');

const CAMPOS = [
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true, padroes: [/nome completo/, /^nome( do publicador)?$/, /^publicador$/, /nome/] },
  { chave: 'participou', rotulo: 'Participou no ministério', padroes: [/participou/, /participacao/] },
  { chave: 'estudos', rotulo: 'Estudos bíblicos', multiplo: true, padroes: [/quantos estudos/, /estudos? biblicos?/, /^estudos?$/] },
  { chave: 'pioneiroAuxiliar', rotulo: 'Pioneiro auxiliar', padroes: [/pioneiro auxiliar/, /^auxiliar$/] },
  { chave: 'horas', rotulo: 'Horas', padroes: [/quantidade de horas/, /^horas( de campo| no ministerio)?$/, /^horas?$/, /^(?!.*credito).*horas/] },
  { chave: 'credito', rotulo: 'Horas de crédito', padroes: [/credito/, /ldc|construcao/] },
  { chave: 'observacoes', rotulo: 'Observações', padroes: [/observa/, /^obs\b/, /comentario/] },
  { chave: 'tipo', rotulo: 'Tipo (publicador / pioneiro)', padroes: [/^voce e\s*:?$/, /^tipo/, /^situacao$|categoria/] },
  { chave: 'dirigiu', rotulo: 'Dirigiu estudo (Sim/Não)', multiplo: true, padroes: [/^dirigiu/] },
];
const ORDEM_DETECCAO = ['credito', 'pioneiroAuxiliar', 'nome', 'tipo', 'participou', 'estudos', 'dirigiu', 'horas', 'observacoes'];
const LINHAS_AMOSTRA = 5;

function abrirPlanilha(origem) {
  const pasta = Buffer.isBuffer(origem) ? xlsx.read(origem, { type: 'buffer' }) : xlsx.readFile(origem);
  const linhas = xlsx.utils.sheet_to_json(pasta.Sheets[pasta.SheetNames[0]], { header: 1, defval: null });
  const titulos = (linhas[0] ?? []).map(t => String(t ?? '').replace(/\s+/g, ' ').trim());
  const dados = linhas.slice(1).filter(l => l.some(c => !vazio(c)));
  return { titulos, linhas: dados };
}

function candidatos(campo, titulos, usados) {
  for (const padrao of campo.padroes) {
    const achados = titulos
      .map((titulo, indice) => ({ titulo: normalizar(titulo), indice }))
      .filter(({ titulo, indice }) => titulo && !usados.has(indice) && padrao.test(titulo))
      .map(({ indice }) => indice);
    if (achados.length) return campo.multiplo ? achados : [achados[0]];
  }
  return [];
}

function sugerirMapeamento(titulos) {
  const usados = new Set();
  const mapeamento = {};
  for (const chave of ORDEM_DETECCAO) {
    const indices = candidatos(CAMPOS.find(c => c.chave === chave), titulos, usados);
    indices.forEach(i => usados.add(i));
    mapeamento[chave] = indices;
  }
  return mapeamento;
}

function assinatura(titulos) {
  return titulos.map(normalizar).join('|');
}

function carregarMapeamentos(arquivo) {
  return fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : {};
}

function mapeamentoLembrado(arquivo, titulos) {
  const salvo = carregarMapeamentos(arquivo)[assinatura(titulos)];
  if (!salvo) return null;
  const normalizados = titulos.map(normalizar);
  return Object.fromEntries(CAMPOS.map(({ chave }) => [chave, (salvo[chave] ?? []).map(t => normalizados.indexOf(t)).filter(i => i >= 0)]));
}

function lembrarMapeamento(arquivo, titulos, mapeamento) {
  const todos = carregarMapeamentos(arquivo);
  todos[assinatura(titulos)] = Object.fromEntries(Object.entries(mapeamento).map(([chave, indices]) => [chave, indices.map(i => normalizar(titulos[i]))]));
  fs.writeFileSync(arquivo, JSON.stringify(todos, null, 2) + '\n');
}

function validarMapeamento(mapeamento) {
  const faltando = [];
  if (!mapeamento.nome?.length) faltando.push('Nome');
  if (!mapeamento.horas?.length && !mapeamento.participou?.length) faltando.push('Horas ou Participou no ministério');
  return faltando;
}

function primeiroPreenchido(linha, indices = []) {
  const indice = indices.find(i => !vazio(linha[i]));
  return indice === undefined ? null : linha[indice];
}

function lerRespostas({ linhas }, mapeamento) {
  return linhas
    .map((linha, i) => {
      const valores = Object.fromEntries(CAMPOS.map(({ chave }) => [chave, primeiroPreenchido(linha, mapeamento[chave])]));
      return { linha: i + 2, ...valores, nome: String(valores.nome ?? '').trim() };
    })
    .filter(resposta => resposta.nome);
}

function amostra(planilha, mapeamento) {
  return lerRespostas({ linhas: planilha.linhas.slice(0, LINHAS_AMOSTRA) }, mapeamento);
}

function lerFormulario(origem, arquivoMapeamentos) {
  const planilha = abrirPlanilha(origem);
  const mapeamento = (arquivoMapeamentos && mapeamentoLembrado(arquivoMapeamentos, planilha.titulos)) || sugerirMapeamento(planilha.titulos);
  const faltando = validarMapeamento(mapeamento);
  if (faltando.length) throw new Error(`Não encontrei as colunas: ${faltando.join(', ')}. Títulos da planilha: ${planilha.titulos.join(' | ')}`);
  return lerRespostas(planilha, mapeamento);
}

const DESCRICAO_CAMPOS = CAMPOS.map(({ chave, rotulo, obrigatorio, multiplo }) => ({ chave, rotulo, obrigatorio: Boolean(obrigatorio), multiplo: Boolean(multiplo) }));

module.exports = {
  CAMPOS: DESCRICAO_CAMPOS,
  abrirPlanilha, sugerirMapeamento, mapeamentoLembrado, lembrarMapeamento, validarMapeamento, lerRespostas, amostra, lerFormulario,
};
