'use strict';

const { normalizar, vazio, numerosNoTexto, numeroPorExtenso, simOuNao } = require('./texto');

const PIONEIRO = { Regular: 'Regular', Auxiliar: 'Auxiliary', Especial: 'Special' };
const STATUS_PIONEIRO = {
  'Regular Pioneer': PIONEIRO.Regular,
  'Continuous Auxiliary Pioneer': PIONEIRO.Auxiliar,
  'Special Pioneer': PIONEIRO.Especial,
  'Field Missionary': PIONEIRO.Especial,
};
const HORAS_SUSPEITAS = 120;
const LIMITE_MENSAL_COM_CREDITO = 55;
const TEXTO_SO_NUMERO = /^\s*(horas?\s*)?\d+(?:[.,]\d+)?\s*(h|hs|hrs|ho|horas?)?\.?\s*$/i;

function tipoDoFormulario(tipo) {
  const texto = normalizar(tipo);
  if (texto.includes('regular')) return 'regular';
  if (texto.includes('auxiliar')) return 'auxiliar';
  if (texto.includes('publicador')) return 'publicador';
  return null;
}

function interpretarHoras(valor, avisos) {
  if (vazio(valor)) return null;
  if (typeof valor === 'number') return valor;
  const numeros = numerosNoTexto(valor);
  if (numeros.length === 0) {
    const extenso = numeroPorExtenso(valor);
    avisos.push(`horas sem número: "${valor}"`);
    return extenso;
  }
  if (numeros.length > 1) avisos.push(`horas com mais de um número: "${valor}"`);
  else if (!TEXTO_SO_NUMERO.test(String(valor)) && !/\(\s*\d+\s*\)/.test(String(valor))) avisos.push(`horas em texto: "${valor}"`);
  return numeros[0];
}

function sugerirCredito(valorHoras) {
  const numeros = numerosNoTexto(valorHoras);
  const mencionaCredito = /volunt|ldc|constru|reforma|cozinha|salao|salão|credito|crédito|betel|assembl/i.test(String(valorHoras ?? ''));
  return numeros.length > 1 && mencionaCredito ? numeros[1] : null;
}

function interpretarEstudos(dirigiu, quantos, avisos) {
  if (!vazio(quantos)) {
    if (/revisit/i.test(String(quantos))) {
      avisos.push(`estudos: "${quantos}"`);
      return null;
    }
    const numero = typeof quantos === 'number' ? quantos : (numerosNoTexto(quantos)[0] ?? numeroPorExtenso(quantos));
    if (numero === null || numero === undefined) avisos.push(`estudos não entendidos: "${quantos}"`);
    return numero ?? null;
  }
  if (simOuNao(dirigiu) === true) {
    avisos.push('dirigiu estudo mas não disse quantos (assumido 1)');
    return 1;
  }
  return null;
}

function arredondarHoras(horas, avisos) {
  if (horas === null || Number.isInteger(horas)) return horas;
  avisos.push(`horas fracionadas (${horas}) arredondadas para baixo`);
  return Math.floor(horas);
}

function pioneiroDoRelatorio(tipo, publicador, avisos) {
  const doCadastro = STATUS_PIONEIRO[publicador?.status] ?? null;
  if (tipo === 'regular' && doCadastro !== PIONEIRO.Regular && doCadastro !== PIONEIRO.Especial) {
    avisos.push(`diz ser pioneiro regular, cadastro: ${publicador?.status ?? '?'}`);
  }
  if (tipo !== 'regular' && doCadastro === PIONEIRO.Regular) {
    avisos.push(`cadastro é pioneiro regular, formulário diz: ${tipo ?? '?'}`);
  }
  if (tipo === 'auxiliar' && doCadastro !== PIONEIRO.Regular) return PIONEIRO.Auxiliar;
  return doCadastro;
}

function interpretarResposta(resposta, publicador) {
  const avisos = [];
  const tipo = tipoDoFormulario(resposta.tipo);
  if (!tipo) avisos.push(`tipo não reconhecido: "${resposta.tipo ?? ''}"`);
  const pioneer = pioneiroDoRelatorio(tipo, publicador, avisos);
  const participou = tipo === 'regular' || tipo === 'auxiliar' ? true : simOuNao(resposta.participou);
  const estudos = interpretarEstudos(resposta.dirigiu, resposta.quantos, avisos);
  const ehPioneiro = pioneer !== null;
  let horas = null;
  let credito = null;

  if (ehPioneiro) {
    horas = arredondarHoras(interpretarHoras(resposta.horas, avisos), avisos);
    if (horas === null) avisos.push('pioneiro sem horas');
    if (horas > HORAS_SUSPEITAS) avisos.push(`horas muito altas (${horas})`);
    credito = vazio(resposta.credito) ? sugerirCredito(resposta.horas) : interpretarHoras(resposta.credito, avisos);
    if (credito !== null && pioneer === PIONEIRO.Auxiliar) {
      avisos.push(`crédito (${credito}h) informado por pioneiro auxiliar — não se aplica`);
      credito = null;
    } else if (credito !== null) {
      const maximo = Math.max(0, LIMITE_MENSAL_COM_CREDITO - (horas ?? 0));
      avisos.push(credito > maximo ? `crédito informado ${credito}h, limitado a ${maximo}h (campo + crédito até ${LIMITE_MENSAL_COM_CREDITO}h)` : `crédito sugerido: ${credito}h`);
      credito = Math.min(credito, maximo) || null;
    }
  } else if (participou === null) {
    avisos.push('não respondeu se participou');
  }

  return { tipo, pioneer, participou: ehPioneiro ? true : participou, horas, credito, estudos, avisos };
}

module.exports = { interpretarResposta, PIONEIRO };
