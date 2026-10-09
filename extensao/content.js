const ORIGEM_PAGINA = 'importador-hourglass';
const ORIGEM_EXTENSAO = 'extensao-hourglass';

function avisarPagina(tipo, dados) {
  window.postMessage({ origem: ORIGEM_EXTENSAO, tipo, ...dados }, window.location.origin);
}

async function anunciarEstado() {
  const { ativa } = await chrome.runtime.sendMessage({ acao: 'estado' });
  avisarPagina('estado', { ativa, versao: chrome.runtime.getManifest().version });
}

window.addEventListener('message', async evento => {
  if (evento.source !== window || evento.data?.origem !== ORIGEM_PAGINA) return;
  if (evento.data.tipo === 'ping') return anunciarEstado();
  if (evento.data.tipo === 'sincronizar') {
    const resultado = await chrome.runtime.sendMessage({ acao: 'sincronizar', forcar: Boolean(evento.data.forcar) });
    avisarPagina('resultado', resultado);
  }
});

chrome.storage.onChanged.addListener(mudancas => {
  if ('ativa' in mudancas) avisarPagina('estado', { ativa: mudancas.ativa.newValue, versao: chrome.runtime.getManifest().version });
});

anunciarEstado();
