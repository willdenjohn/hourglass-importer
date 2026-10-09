import { atualizar } from './estado.js';

const ORIGEM_PAGINA = 'importador-hourglass';
const ORIGEM_EXTENSAO = 'extensao-hourglass';
const TEMPO_DETECCAO = 600;
const TEMPO_RESPOSTA = 10000;

let aguardandoResultado = null;

function enviar(tipo, dados = {}) {
  window.postMessage({ origem: ORIGEM_PAGINA, tipo, ...dados }, window.location.origin);
}

window.addEventListener('message', evento => {
  if (evento.source !== window || evento.data?.origem !== ORIGEM_EXTENSAO) return;
  if (evento.data.tipo === 'estado') atualizar({ extensao: { presente: true, ativa: evento.data.ativa, versao: evento.data.versao } });
  if (evento.data.tipo === 'resultado' && aguardandoResultado) {
    aguardandoResultado(evento.data);
    aguardandoResultado = null;
  }
});

export function detectarExtensao() {
  enviar('ping');
  return new Promise(resolve => setTimeout(resolve, TEMPO_DETECCAO));
}

export function pedirSessao({ forcar = false } = {}) {
  return new Promise(resolve => {
    const limite = setTimeout(() => {
      aguardandoResultado = null;
      resolve({ ok: false, mensagem: 'A extensão não respondeu.' });
    }, TEMPO_RESPOSTA);
    aguardandoResultado = resultado => {
      clearTimeout(limite);
      resolve(resultado);
    };
    enviar('sincronizar', { forcar });
  });
}
