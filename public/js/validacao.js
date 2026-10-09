import { LIMITE_COM_CREDITO } from './estado.js';

const PIONEIROS_COM_CREDITO = ['Regular', 'Especial'];

function numero(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  return Number(String(valor).replace(',', '.'));
}

export function errosDoItem(item) {
  if (item.situacao !== 'ENVIAR') return [];
  const erros = [];
  const horas = numero(item.horas);
  const credito = numero(item.credito);
  const estudos = numero(item.estudos);

  if (!item.id) erros.push('escolha o publicador');
  if ([horas, credito, estudos].some(n => n !== null && (Number.isNaN(n) || n < 0))) erros.push('valor numérico inválido');
  if (item.pioneiro && horas === null) erros.push('pioneiro sem horas');
  if (horas !== null && !Number.isInteger(horas)) erros.push('use horas inteiras');
  if (!item.pioneiro && !['SIM', 'NÃO'].includes(item.participou)) erros.push('informe se participou');
  if (credito && !PIONEIROS_COM_CREDITO.includes(item.pioneiro)) erros.push('crédito só para pioneiro regular/especial');
  if (credito && (horas ?? 0) + credito > LIMITE_COM_CREDITO) erros.push(`campo + crédito passa de ${LIMITE_COM_CREDITO}h`);
  return erros;
}

export function camposInvalidos(item) {
  const horas = numero(item.horas);
  const credito = numero(item.credito);
  return {
    horas: horas !== null && (Number.isNaN(horas) || !Number.isInteger(horas)),
    credito: Boolean(credito) && ((horas ?? 0) + credito > LIMITE_COM_CREDITO || !PIONEIROS_COM_CREDITO.includes(item.pioneiro)),
  };
}
