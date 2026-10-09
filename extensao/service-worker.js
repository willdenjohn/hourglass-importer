const HOURGLASS = 'https://app.hourglass-app.com';
const IMPORTADOR = 'http://localhost:3434';
const COOKIE_SESSAO = 'hglogin';
const COOKIE_XSRF = 'X-Hourglass-XSRF-Token';
const PADRAO = { ativa: true, ultimaSincronizacao: null };

async function lerConfiguracao() {
  return { ...PADRAO, ...(await chrome.storage.local.get(Object.keys(PADRAO))) };
}

async function atualizarSelo() {
  const { ativa } = await lerConfiguracao();
  await chrome.action.setBadgeText({ text: ativa ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: ativa ? '#2b8a3e' : '#868e96' });
  await chrome.action.setTitle({ title: `Importador Hourglass — ${ativa ? 'ativa' : 'desativada'}` });
}

function expiracao(token) {
  try {
    const carga = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return carga.exp ? carga.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function lerCookies() {
  const [sessao, xsrf] = await Promise.all([
    chrome.cookies.get({ url: HOURGLASS, name: COOKIE_SESSAO }),
    chrome.cookies.get({ url: HOURGLASS, name: COOKIE_XSRF }),
  ]);
  if (!sessao?.value || !xsrf?.value) return null;
  return { hglogin: sessao.value, xsrf: decodeURIComponent(xsrf.value) };
}

async function estadoImportador() {
  try {
    const resposta = await fetch(`${IMPORTADOR}/api/sessao`, { cache: 'no-store' });
    return { rodando: true, ...(await resposta.json()) };
  } catch {
    return { rodando: false };
  }
}

async function registrar(resultado) {
  const ultimaSincronizacao = { ...resultado, em: Date.now() };
  await chrome.storage.local.set({ ultimaSincronizacao });
  return resultado;
}

async function sincronizar({ forcar = false } = {}) {
  const { ativa } = await lerConfiguracao();
  if (!ativa) return { ok: false, motivo: 'desativada', mensagem: 'Extensão desativada.' };

  const importador = await estadoImportador();
  if (!importador.rodando) return registrar({ ok: false, motivo: 'importador', mensagem: 'Importador não está rodando em localhost:3434.' });
  if (importador.valida && !forcar) return registrar({ ok: true, motivo: 'ja-valida', mensagem: 'Sessão do importador já está válida.' });

  const cookies = await lerCookies();
  if (!cookies) return registrar({ ok: false, motivo: 'sem-login', mensagem: 'Faça login no Hourglass neste Chrome.' });
  const expira = expiracao(cookies.hglogin);
  if (expira && expira < Date.now()) return registrar({ ok: false, motivo: 'expirada', mensagem: 'Login do Hourglass expirou. Abra o Hourglass e entre de novo.' });

  try {
    const resposta = await fetch(`${IMPORTADOR}/api/sessao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cookies),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return registrar({ ok: false, motivo: 'recusada', mensagem: dados.erro || `Importador recusou (${resposta.status}).` });
    return registrar({ ok: true, motivo: 'enviada', mensagem: 'Sessão enviada ao importador.' });
  } catch (erro) {
    return registrar({ ok: false, motivo: 'falha', mensagem: erro.message });
  }
}

async function diagnostico() {
  const [configuracao, cookies, importador] = await Promise.all([lerConfiguracao(), lerCookies(), estadoImportador()]);
  return {
    ...configuracao,
    hourglassLogado: Boolean(cookies),
    hourglassExpira: cookies ? expiracao(cookies.hglogin) : null,
    importadorRodando: importador.rodando,
    importadorConectado: Boolean(importador.valida),
  };
}

async function definirAtiva(ativa) {
  await chrome.storage.local.set({ ativa });
  await atualizarSelo();
  return diagnostico();
}

const ACOES = {
  sincronizar: mensagem => sincronizar({ forcar: Boolean(mensagem.forcar) }),
  diagnostico: () => diagnostico(),
  definirAtiva: mensagem => definirAtiva(Boolean(mensagem.ativa)),
  estado: () => lerConfiguracao(),
};

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  const acao = ACOES[mensagem?.acao];
  if (!acao) return false;
  acao(mensagem).then(responder, erro => responder({ ok: false, mensagem: erro.message }));
  return true;
});

chrome.storage.onChanged.addListener(mudancas => {
  if ('ativa' in mudancas) atualizarSelo();
});

chrome.runtime.onInstalled.addListener(atualizarSelo);
chrome.runtime.onStartup.addListener(atualizarSelo);
