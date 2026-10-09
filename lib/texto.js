'use strict';

const NUMEROS_POR_EXTENSO = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

function normalizar(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function vazio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

function numerosNoTexto(valor) {
  return (String(valor ?? '').match(/\d+(?:[.,]\d+)?/g) || []).map(n => parseFloat(n.replace(',', '.')));
}

function numeroPorExtenso(valor) {
  const palavras = normalizar(valor).split(/[^a-z]+/);
  const achado = palavras.find(p => p in NUMEROS_POR_EXTENSO);
  return achado === undefined ? null : NUMEROS_POR_EXTENSO[achado];
}

function simOuNao(valor) {
  const texto = normalizar(valor);
  if (['sim', 's'].includes(texto)) return true;
  if (['nao', 'n'].includes(texto)) return false;
  return null;
}

module.exports = { normalizar, vazio, numerosNoTexto, numeroPorExtenso, simOuNao };
