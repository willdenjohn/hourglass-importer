'use strict';

const fs = require('fs');
const path = require('path');

const MARCADOR_VAZIO = 'COLE_AQUI';

function arquivoSessao(pasta) {
  return path.join(pasta, 'sessao.json');
}

function normalizarSessao({ hglogin, xsrf }) {
  let token = String(hglogin ?? '').trim().replace(/^hglogin=/, '');
  if (token.startsWith('yJ')) token = 'e' + token;
  return { hglogin: token, xsrf: String(xsrf ?? '').trim().replace(/^X-Hourglass-XSRF-Token=/, '') };
}

function sessaoPreenchida(sessao) {
  return Boolean(sessao?.hglogin && sessao?.xsrf && !sessao.hglogin.startsWith(MARCADOR_VAZIO) && !sessao.xsrf.startsWith(MARCADOR_VAZIO));
}

function carregarSessao(pasta) {
  const arquivo = arquivoSessao(pasta);
  if (!fs.existsSync(arquivo)) return null;
  const sessao = normalizarSessao(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
  return sessaoPreenchida(sessao) ? sessao : null;
}

function salvarSessao(pasta, sessao) {
  fs.writeFileSync(arquivoSessao(pasta), JSON.stringify(sessao, null, 2) + '\n');
}

function expiracao(hglogin) {
  try {
    const carga = JSON.parse(Buffer.from(hglogin.split('.')[1], 'base64url').toString('utf8'));
    return carga.exp ? new Date(carga.exp * 1000) : null;
  } catch {
    return null;
  }
}

module.exports = { carregarSessao, salvarSessao, normalizarSessao, sessaoPreenchida, expiracao };
