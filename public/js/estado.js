const ouvintes = new Set();

export const estado = {
  periodo: periodoPadrao(),
  sessao: null,
  publicadores: [],
  itens: [],
  semResposta: [],
  extensao: { presente: false, ativa: false },
  sincronizandoExtensao: false,
  resultadoExtensao: null,
};

function periodoPadrao() {
  const hoje = new Date();
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { mes: anterior.getMonth() + 1, ano: anterior.getFullYear() };
}

export function atualizar(parcial) {
  Object.assign(estado, parcial);
  ouvintes.forEach(ouvinte => ouvinte(estado, parcial));
}

export function observar(ouvinte) {
  ouvintes.add(ouvinte);
}

export const SITUACOES = ['ENVIAR', 'REVISAR', 'NÃO ENCONTRADO', 'JÁ LANÇADO', 'IGNORAR'];
export const LIMITE_COM_CREDITO = 55;
