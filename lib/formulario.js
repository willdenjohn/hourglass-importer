'use strict';

const xlsx = require('xlsx');
const { normalizar, vazio } = require('./texto');

const COLUNAS = {
  nome: /nome completo/,
  tipo: /^voce e\s*:?$/,
  grupo: /grupo/,
  participou: /participou/,
  dirigiu: /dirigiu/,
  quantos: /quantos estudos/,
  horas: /quantidade de horas|^horas/,
  credito: /credito|ldc|construcao/,
  observacoes: /observa/,
};

function mapearColunas(cabecalho) {
  const mapa = {};
  cabecalho.forEach((titulo, indice) => {
    const texto = normalizar(titulo);
    for (const [campo, regra] of Object.entries(COLUNAS)) {
      if (regra.test(texto)) (mapa[campo] = mapa[campo] || []).push(indice);
    }
  });
  if (!mapa.nome || !mapa.tipo) throw new Error('Planilha sem as colunas de nome e "Você é" do formulário.');
  return mapa;
}

function primeiroPreenchido(linha, indices = []) {
  const indice = indices.find(i => !vazio(linha[i]));
  return indice === undefined ? null : linha[indice];
}

function lerResposta(linha, mapa, numeroLinha) {
  const campos = Object.fromEntries(Object.keys(COLUNAS).map(campo => [campo, primeiroPreenchido(linha, mapa[campo])]));
  return { linha: numeroLinha, ...campos, nome: String(campos.nome ?? '').trim() };
}

function lerFormulario(origem) {
  const pasta = Buffer.isBuffer(origem) ? xlsx.read(origem, { type: 'buffer' }) : xlsx.readFile(origem);
  const linhas = xlsx.utils.sheet_to_json(pasta.Sheets[pasta.SheetNames[0]], { header: 1, defval: null });
  const mapa = mapearColunas(linhas[0]);
  return linhas.slice(1)
    .map((linha, i) => lerResposta(linha, mapa, i + 2))
    .filter(resposta => resposta.nome);
}

module.exports = { lerFormulario };
