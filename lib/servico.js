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
    mapeamentos: path.join(pasta, 'mapeamentos.json'),
    conferencias: path.join(pasta, 'conferencias'),
    conferencia: (mes, ano) => path.join(pasta, 'conferencias', `conferencia-${rotuloMes(mes, ano)}.xlsx`),
    faltantes: rotulo => path.join(pasta, 'conferencias', `faltantes-${rotulo}.xlsx`),
    registro: (mes, ano) => path.join(pasta, 'conferencias', `envios-${rotuloMes(mes, ano)}.log`),
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

const ESPERA_NOVA_TENTATIVA = 2000;
const TRAVA_EXPIRADA = 30 * 60 * 1000;

function adquirirTrava(pasta) {
  const arquivo = path.join(pasta, '.envio.lock');
  try {
    if (fs.existsSync(arquivo) && Date.now() - fs.statSync(arquivo).mtimeMs > TRAVA_EXPIRADA) fs.rmSync(arquivo);
    fs.writeFileSync(arquivo, JSON.stringify({ pid: process.pid, inicio: new Date().toISOString() }), { flag: 'wx' });
  } catch (erro) {
    if (erro.code === 'EEXIST') return null;
    throw erro;
  }
  return () => fs.rmSync(arquivo, { force: true });
}

async function comTrava(pasta, tarefa) {
  const liberar = adquirirTrava(pasta);
  if (!liberar) throw Object.assign(new Error('Já existe um envio em andamento. Aguarde terminar.'), { status: 409 });
  try {
    return await tarefa();
  } finally {
    liberar();
  }
}

async function jaLancado(cliente, relatorio) {
  return Boolean(await cliente.relatorioDoPublicador(relatorio.user.id, relatorio.year, relatorio.month));
}

async function enviarUm(cliente, relatorio) {
  if (await jaLancado(cliente, relatorio)) return { ok: true, jaExistia: true };
  try {
    await cliente.criarRelatorio(relatorio);
    return { ok: true };
  } catch (erro) {
    if (!erro.temporario) throw erro;
    await new Promise(resolve => setTimeout(resolve, ESPERA_NOVA_TENTATIVA));
    if (await jaLancado(cliente, relatorio)) return { ok: true };
    await cliente.criarRelatorio(relatorio);
    return { ok: true };
  }
}

function criarRegistro(arquivo, origem) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  return (resultado, relatorio) => {
    const { id, user, ...valores } = relatorio;
    const situacao = resultado.jaExistia ? 'ja-existia' : resultado.ok ? 'enviado' : 'falha';
    const linha = { em: new Date().toISOString(), origem, publicador: user.id, nome: resultado.nome, ...valores, resultado: situacao, erro: resultado.erro ?? null };
    fs.appendFileSync(arquivo, JSON.stringify(linha) + '\n');
  };
}

async function enviarRelatorios(cliente, pendentes, aoProgresso = () => {}, registrar = () => {}) {
  const resultados = [];
  for (const { item, relatorio } of pendentes) {
    const base = { id: relatorio.user.id, nome: item.nomeHourglass };
    try {
      resultados.push({ ...base, ...(await enviarUm(cliente, relatorio)) });
    } catch (erro) {
      resultados.push({ ...base, ok: false, erro: erro.message });
    }
    const ultimo = resultados[resultados.length - 1];
    registrar(ultimo, relatorio);
    aoProgresso(ultimo, resultados.length, pendentes.length);
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
  caminhos, rotuloMes, resumir, prepararConferencia, validarEnvio, enviarRelatorios, descreverRelatorio, salvarApelido, marcarEnviados, comTrava, criarRegistro,
};
