'use strict';

const fs = require('fs');
const path = require('path');
const { interpretarResposta } = require('./interpretar');
const { criarLocalizador, carregarApelidos, nomeCompleto } = require('./correspondencia');
const { SITUACAO, PIONEIRO_PT, montarRelatorio } = require('./conferencia');
const { normalizar } = require('./texto');

function rotuloMes(mes, ano) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function caminhos(pasta) {
  return {
    apelidos: path.join(pasta, 'apelidos.json'),
    conferencias: path.join(pasta, 'conferencias'),
    conferencia: (mes, ano) => path.join(pasta, 'conferencias', `conferencia-${rotuloMes(mes, ano)}.xlsx`),
    faltantes: rotulo => path.join(pasta, 'conferencias', `faltantes-${rotulo}.xlsx`),
  };
}

function separarDuplicadas(respostas) {
  const ultimaPorNome = new Map(respostas.map(r => [normalizar(r.nome), r.linha]));
  return respostas.map(r => ({ ...r, duplicada: ultimaPorNome.get(normalizar(r.nome)) !== r.linha }));
}

function descreverPublicador(publicador) {
  return publicador ? { id: publicador.id, nomeHourglass: nomeCompleto(publicador), cadastro: publicador.status } : {};
}

function montarItem(resposta, localizar, localizarInativo, jaLancados) {
  const base = { linha: resposta.linha, nomeFormulario: resposta.nome, tipoFormulario: resposta.tipo, horasOriginal: resposta.horas, observacoes: resposta.observacoes };
  if (resposta.duplicada) return { ...base, situacao: SITUACAO.ignorar, alertas: 'resposta duplicada — vale a última' };

  const { publicador, confianca, empate } = localizar(resposta.nome);
  if (!publicador) {
    const inativo = localizarInativo(resposta.nome).publicador;
    const alerta = inativo ? `inativo no Hourglass: ${nomeCompleto(inativo)}` : 'não encontrado — escolha o publicador ou cadastre no Hourglass';
    return { ...base, situacao: SITUACAO.naoEncontrado, correspondencia: 'nenhuma', alertas: alerta };
  }

  const dados = interpretarResposta(resposta, publicador);
  const alertas = [...dados.avisos];
  if (confianca === 'baixa') alertas.unshift(empate ? 'nome ambíguo — confira' : 'nome parecido — confira');
  const lancado = jaLancados.has(publicador.id);
  if (lancado) alertas.unshift('relatório do mês já existe no Hourglass');

  return {
    ...base,
    ...descreverPublicador(publicador),
    situacao: lancado ? SITUACAO.lancado : alertas.length ? SITUACAO.revisar : SITUACAO.enviar,
    correspondencia: confianca,
    participou: dados.participou === null ? '' : dados.participou ? 'SIM' : 'NÃO',
    horas: dados.horas,
    credito: dados.credito,
    estudos: dados.estudos,
    pioneiro: PIONEIRO_PT[dados.pioneer] ?? '',
    alertas: alertas.join(' | '),
  };
}

function marcarAlvosRepetidos(itens) {
  const contagem = new Map();
  itens.filter(i => i.id && i.situacao !== SITUACAO.ignorar).forEach(i => contagem.set(i.id, (contagem.get(i.id) || 0) + 1));
  for (const item of itens) {
    if (contagem.get(item.id) > 1 && [SITUACAO.enviar, SITUACAO.revisar].includes(item.situacao)) {
      item.situacao = SITUACAO.revisar;
      item.alertas = ['duas respostas apontam para o mesmo publicador', item.alertas].filter(Boolean).join(' | ');
    }
  }
}

function resumir(itens) {
  const porSituacao = {};
  itens.forEach(i => { porSituacao[i.situacao] = (porSituacao[i.situacao] || 0) + 1; });
  return porSituacao;
}

async function prepararConferencia(cliente, respostasBrutas, mes, ano, arquivoApelidos) {
  const respostas = separarDuplicadas(respostasBrutas);
  const [publicadores, inativos, relatorios] = await Promise.all([
    cliente.publicadores(), cliente.inativos(), cliente.relatoriosDoMes(ano, mes),
  ]);
  const localizar = criarLocalizador(publicadores, carregarApelidos(arquivoApelidos));
  const localizarInativo = criarLocalizador(inativos, new Map());
  const jaLancados = new Set(relatorios.map(r => r.user.id));

  const itens = respostas.map(r => montarItem(r, localizar, localizarInativo, jaLancados));
  marcarAlvosRepetidos(itens);

  const responderam = new Set(itens.map(i => i.id).filter(Boolean));
  const semResposta = publicadores.filter(p => p.group_id && !responderam.has(p.id) && !jaLancados.has(p.id));
  return { itens, semResposta, publicadores, totalLancados: relatorios.length };
}

async function validarEnvio(cliente, itens, mes, ano, limite) {
  const preparados = itens
    .filter(i => i.situacao === SITUACAO.enviar)
    .map(item => ({ item, ...montarRelatorio(item, ano, mes) }));
  const porPublicador = new Map();
  preparados.forEach(p => porPublicador.set(p.relatorio.user.id, (porPublicador.get(p.relatorio.user.id) || 0) + 1));
  preparados
    .filter(p => p.relatorio.user.id && porPublicador.get(p.relatorio.user.id) > 1)
    .forEach(p => p.erros.push('mais de uma linha ENVIAR para o mesmo publicador'));
  const comErro = preparados.filter(p => p.erros.length);
  const validos = preparados.filter(p => !p.erros.length);
  if (comErro.length) return { comErro, pendentes: [], jaExistentes: [] };

  const jaLancados = new Set((await cliente.relatoriosDoMes(ano, mes)).map(r => r.user.id));
  return {
    comErro,
    jaExistentes: validos.filter(p => jaLancados.has(p.relatorio.user.id)),
    pendentes: validos.filter(p => !jaLancados.has(p.relatorio.user.id)).slice(0, limite),
  };
}

async function enviarRelatorios(cliente, pendentes, aoProgresso = () => {}) {
  const resultados = [];
  for (const { item, relatorio } of pendentes) {
    try {
      await cliente.criarRelatorio(relatorio);
      resultados.push({ id: relatorio.user.id, nome: item.nomeHourglass, ok: true });
    } catch (erro) {
      resultados.push({ id: relatorio.user.id, nome: item.nomeHourglass, ok: false, erro: erro.message });
    }
    aoProgresso(resultados[resultados.length - 1], resultados.length, pendentes.length);
  }
  return resultados;
}

function descreverRelatorio({ relatorio, item }) {
  const horas = relatorio.pioneer ? `${relatorio.minutes / 60}h${relatorio.credithours ? ` +${relatorio.credithours}h crédito` : ''}` : (relatorio.minutes ? 'participou' : 'não participou');
  return [horas, relatorio.studies ? `${relatorio.studies} est.` : null, relatorio.pioneer ? item.pioneiro : null].filter(Boolean).join(' — ');
}

function marcarEnviados(itens, resultados) {
  const enviados = new Set(resultados.filter(r => r.ok).map(r => r.id));
  return itens.map(item => (item.situacao === SITUACAO.enviar && enviados.has(Number(item.id))
    ? { ...item, situacao: SITUACAO.lancado, alertas: ['enviado pelo importador', item.alertas].filter(Boolean).join(' | ') }
    : item));
}

function salvarApelido(arquivo, nome, id) {
  const atuais = fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : {};
  atuais[nome] = Number(id);
  fs.writeFileSync(arquivo, JSON.stringify(atuais, null, 2) + '\n');
}

module.exports = {
  caminhos, rotuloMes, resumir, prepararConferencia, validarEnvio, enviarRelatorios, descreverRelatorio, salvarApelido, marcarEnviados,
};
