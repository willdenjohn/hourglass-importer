'use strict';

const fs = require('fs');
const { normalizar } = require('./texto');

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function nomeCompleto(publicador) {
  return [publicador.firstname, publicador.middlename, publicador.lastname].filter(Boolean).join(' ');
}

function palavras(nome) {
  return normalizar(nome).split(/[^a-z]+/).filter(p => p.length > 1 && !STOPWORDS.has(p));
}

function levenshtein(a, b) {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const atual = linha[j];
      linha[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, linha[j], linha[j - 1]);
      anterior = atual;
    }
  }
  return linha[b.length];
}

function parecida(a, b) {
  const menor = Math.min(a.length, b.length);
  return a === b || (menor >= 4 && levenshtein(a, b) <= (menor >= 7 ? 2 : 1));
}

function pontuar(nomeFormulario, publicador) {
  const doFormulario = palavras(nomeFormulario);
  const doCadastro = palavras(nomeCompleto(publicador));
  if (!doFormulario.length || !doCadastro.length) return 0;
  const comuns = doFormulario.filter(p => doCadastro.some(c => parecida(p, c))).length;
  const primeiroBate = parecida(doFormulario[0], doCadastro[0]);
  const identicas = doFormulario.filter(p => doCadastro.includes(p)).length;
  const cobertura = comuns / Math.min(doFormulario.length, doCadastro.length) + identicas * 0.01;
  return primeiroBate ? cobertura : cobertura * 0.4;
}

function carregarApelidos(caminho) {
  if (!fs.existsSync(caminho)) return new Map();
  const conteudo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  return new Map(Object.entries(conteudo).map(([nome, id]) => [normalizar(nome), Number(id)]));
}

function criarLocalizador(publicadores, apelidos) {
  const porId = new Map(publicadores.map(p => [p.id, p]));

  return function localizar(nomeFormulario) {
    const idApelido = apelidos.get(normalizar(nomeFormulario));
    if (idApelido && porId.has(idApelido)) return { publicador: porId.get(idApelido), confianca: 'apelido' };

    const exato = publicadores.filter(p => normalizar(nomeCompleto(p)) === normalizar(nomeFormulario));
    const exatoComGrupo = exato.filter(p => p.group_id);
    if (exato.length === 1) return { publicador: exato[0], confianca: 'exato' };
    if (exatoComGrupo.length === 1) return { publicador: exatoComGrupo[0], confianca: 'exato' };

    const ranking = publicadores
      .map(p => ({ publicador: p, nota: pontuar(nomeFormulario, p) }))
      .sort((a, b) => b.nota - a.nota);
    const [melhor, segundo] = ranking;
    if (!melhor || melhor.nota < 0.5) return { publicador: null, confianca: 'nenhuma' };
    const empate = segundo && segundo.nota === melhor.nota;
    const confianca = melhor.nota >= 0.99 && !empate ? 'alta' : 'baixa';
    return { publicador: melhor.publicador, confianca, empate };
  };
}

module.exports = { criarLocalizador, carregarApelidos, nomeCompleto };
