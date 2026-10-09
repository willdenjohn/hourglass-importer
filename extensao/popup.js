const elementos = {
  selo: document.getElementById('selo'),
  hourglass: document.getElementById('estado-hourglass'),
  importador: document.getElementById('estado-importador'),
  ultima: document.getElementById('estado-ultima'),
  sincronizar: document.getElementById('botao-sincronizar'),
  ativar: document.getElementById('botao-ativar'),
};

function formatarHora(milissegundos) {
  return new Date(milissegundos).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escrever(elemento, texto, classe = '') {
  elemento.textContent = texto;
  elemento.className = classe;
}

function textoHourglass(estado) {
  if (!estado.hourglassLogado) return ['não logado', 'erro'];
  if (estado.hourglassExpira && estado.hourglassExpira < Date.now()) return ['login expirado', 'erro'];
  return [estado.hourglassExpira ? `logado até ${formatarHora(estado.hourglassExpira)}` : 'logado', 'ok'];
}

function textoImportador(estado) {
  if (!estado.importadorRodando) return ['não está aberto', 'erro'];
  return estado.importadorConectado ? ['conectado', 'ok'] : ['aguardando sessão', 'erro'];
}

function textoUltima(ultima) {
  if (!ultima) return ['nenhuma ainda', ''];
  return [`${formatarHora(ultima.em)} — ${ultima.mensagem}`, ultima.ok ? 'ok' : 'erro'];
}

function render(estado) {
  elementos.selo.textContent = estado.ativa ? 'ATIVA' : 'DESATIVADA';
  elementos.selo.className = `selo ${estado.ativa ? 'selo--ativa' : 'selo--inativa'}`;
  escrever(elementos.hourglass, ...textoHourglass(estado));
  escrever(elementos.importador, ...textoImportador(estado));
  escrever(elementos.ultima, ...textoUltima(estado.ultimaSincronizacao));
  elementos.ativar.textContent = estado.ativa ? 'Desativar' : 'Ativar';
  elementos.ativar.className = `botao${estado.ativa ? ' botao--perigo' : ''}`;
  elementos.sincronizar.disabled = !estado.ativa;
}

async function atualizar() {
  render(await chrome.runtime.sendMessage({ acao: 'diagnostico' }));
}

elementos.sincronizar.addEventListener('click', async () => {
  elementos.sincronizar.disabled = true;
  elementos.sincronizar.textContent = 'Sincronizando…';
  await chrome.runtime.sendMessage({ acao: 'sincronizar', forcar: true });
  elementos.sincronizar.textContent = 'Sincronizar agora';
  await atualizar();
});

elementos.ativar.addEventListener('click', async () => {
  const { ativa } = await chrome.runtime.sendMessage({ acao: 'estado' });
  render(await chrome.runtime.sendMessage({ acao: 'definirAtiva', ativa: !ativa }));
});

atualizar();
