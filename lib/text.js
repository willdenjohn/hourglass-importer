'use strict';

const NUMBER_WORDS = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  uno: 1, una: 1, dos: 2, cuatro: 4, siete: 7, ocho: 8, nueve: 9, diez: 10,
};
const YES = new Set(['sim', 's', 'yes', 'y', 'si', 'true']);
const NO = new Set(['nao', 'n', 'no', 'false']);

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function numbersIn(value) {
  return (String(value ?? '').match(/\d+(?:[.,]\d+)?/g) || []).map(n => parseFloat(n.replace(',', '.')));
}

function numberFromWords(value) {
  const words = normalize(value).split(/[^a-z]+/);
  const found = words.find(word => word in NUMBER_WORDS);
  return found === undefined ? null : NUMBER_WORDS[found];
}

function parseYesNo(value) {
  if (value === true || value === false) return value;
  const text = normalize(value);
  if (YES.has(text)) return true;
  if (NO.has(text)) return false;
  return null;
}

module.exports = { normalize, isBlank, numbersIn, numberFromWords, parseYesNo };
