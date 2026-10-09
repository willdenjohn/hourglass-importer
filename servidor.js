'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const formulario = require('./lib/formulario');
const { gerarModelo } = require('./lib/modelo');
const { nomeCompleto } = require('./lib/correspondencia');
const { criarCliente: criarClienteReal } = require('./lib/api');
const { escreverConferencia, lerConferencia } = require('./lib/conferencia');
const { carregarSessao, salvarSessao, normalizarSessao, sessaoPreenchida, expiracao } = require('./lib/sessao');
const { levantarFaltantes, salvarFaltantes, mensagemGeral } = require('./lib/faltantes');
const { caminhos, resumir, prepararConferencia, validarEnvio, enviarRelatorios, descreverRelatorio, salvarApelido, marcarEnviados } = require('./lib/servico');

const PORTA = Number(process.env.PORTA) || 3434;
const PASTA_PUBLICA = path.join(__dirname, 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAXIMO_PLANILHAS = 5;
const EXEMPLOS_POR_COLUNA = 3;

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', parte => partes.push(parte));
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

async function lerJson(req) {
  const corpo = await lerCorpo(req);
  return corpo.length ? JSON.parse(corpo.toString('utf8')) : {};
}

function responderJson(res, dados, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

function responderArquivo(res, caminho, nome) {
  if (!fs.existsSync(caminho)) throw new ErroHttp(404, 'Arquivo não encontrado.');
  res.writeHead(200, { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${nome}"` });
  fs.createReadStream(caminho).pipe(res);
}

function servirEstatico(res, rota) {
  const relativo = rota === '/' ? 'index.html' : rota.slice(1);
  const caminho = path.normalize(path.join(PASTA_PUBLICA, relativo));
  if (!caminho.startsWith(PASTA_PUBLICA) || !fs.existsSync(caminho) || fs.statSync(caminho).isDirectory()) {
    throw new ErroHttp(404, 'Página não encontrada.');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(caminho)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(caminho).pipe(res);
}

const HOST_LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function origemPermitida(req) {
  if (!HOST_LOCAL.test(req.headers.host ?? '')) return false;
  const origem = req.headers.origin;
  if (!origem || req.method === 'GET') return true;
  if (origem.startsWith('chrome-extension://')) return true;
  const host = req.headers.host;
  return origem === `http://${host}`;
}

function periodo(url) {
  const mes = Number(url.searchParams.get('mes'));
  const ano = Number(url.searchParams.get('ano'));
  if (!(mes >= 1 && mes <= 12) || !(ano >= 2020 && ano <= 2100)) throw new ErroHttp(400, 'Mês ou ano inválido.');
  return { mes, ano };
}

function exemplosDasColunas({ titulos, linhas }) {
  return titulos.map((_, indice) => [...new Set(linhas.map(l => l[indice]).filter(v => v !== null && String(v).trim() !== '').map(String))].slice(0, EXEMPLOS_POR_COLUNA));
}

function normalizarMapeamento(mapeamento, totalColunas) {
  return Object.fromEntries(formulario.CAMPOS.map(({ chave }) => {
    const indices = [mapeamento?.[chave] ?? []].flat().map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < totalColunas);
    return [chave, [...new Set(indices)]];
  }));
}

function resumoPublicador(p) {
  return { id: p.id, nome: nomeCompleto(p), status: p.status, grupo: p.group_id };
}

function criarAplicacao({ pasta = __dirname, criarCliente = criarClienteReal } = {}) {
  const arquivos = caminhos(pasta);
  const planilhas = new Map();

  function guardarPlanilha(planilha) {
    const id = Math.random().toString(36).slice(2, 10);
    planilhas.set(id, planilha);
    if (planilhas.size > MAXIMO_PLANILHAS) planilhas.delete(planilhas.keys().next().value);
    return id;
  }

  function planilhaGuardada(id) {
    const planilha = planilhas.get(id);
    if (!planilha) throw new ErroHttp(404, 'Planilha não encontrada. Envie o arquivo novamente.');
    return planilha;
  }

  function cliente() {
    const sessao = carregarSessao(pasta);
    if (!sessao) throw new ErroHttp(401, 'Sessão não configurada. Cole os cookies na etapa 1.');
    return criarCliente(sessao);
  }

  async function estadoSessao() {
    const sessao = carregarSessao(pasta);
    if (!sessao) return { configurada: false };
    const expira = expiracao(sessao.hglogin);
    try {
      const conta = await criarCliente(sessao).conta();
      return { configurada: true, valida: true, expira, publicadores: conta.publicadores, conta };
    } catch (erro) {
      return { configurada: true, valida: false, expira, erro: erro.message };
    }
  }

  const rotas = {
    'GET /api/sessao': async (req, res) => responderJson(res, await estadoSessao()),

    'POST /api/sessao': async (req, res) => {
      const sessao = normalizarSessao(await lerJson(req));
      if (!sessaoPreenchida(sessao)) throw new ErroHttp(400, 'Informe os dois cookies.');
      await criarCliente(sessao).publicadores().catch(erro => { throw new ErroHttp(401, erro.message); });
      salvarSessao(pasta, sessao);
      responderJson(res, await estadoSessao());
    },

    'GET /api/publicadores': async (req, res) => {
      const publicadores = await cliente().publicadores();
      responderJson(res, publicadores.map(resumoPublicador).sort((a, b) => a.nome.localeCompare(b.nome)));
    },

    'GET /api/modelo.xlsx': async (req, res) => {
      res.writeHead(200, { 'Content-Type': TIPO_XLSX, 'Content-Disposition': 'attachment; filename="modelo-relatorios.xlsx"' });
      res.end(gerarModelo());
    },

    'POST /api/planilha': async (req, res) => {
      let planilha;
      try {
        planilha = formulario.abrirPlanilha(await lerCorpo(req));
      } catch {
        throw new ErroHttp(400, 'Não consegui ler o arquivo. Envie um Excel (.xlsx).');
      }
      if (!planilha.titulos.length || !planilha.linhas.length) throw new ErroHttp(400, 'A planilha está vazia ou sem linha de títulos.');
      const lembrado = formulario.mapeamentoLembrado(arquivos.mapeamentos, planilha.titulos);
      const mapeamento = lembrado ?? formulario.sugerirMapeamento(planilha.titulos);
      responderJson(res, {
        id: guardarPlanilha(planilha),
        campos: formulario.CAMPOS,
        titulos: planilha.titulos,
        exemplos: exemplosDasColunas(planilha),
        totalLinhas: planilha.linhas.length,
        lembrado: Boolean(lembrado),
        mapeamento,
        faltando: formulario.validarMapeamento(mapeamento),
        amostra: formulario.amostra(planilha, mapeamento),
      });
    },

    'POST /api/planilha/amostra': async (req, res) => {
      const { id, mapeamento } = await lerJson(req);
      const planilha = planilhaGuardada(id);
      const normalizado = normalizarMapeamento(mapeamento, planilha.titulos.length);
      responderJson(res, { faltando: formulario.validarMapeamento(normalizado), amostra: formulario.amostra(planilha, normalizado) });
    },

    'POST /api/preparar': async (req, res, url) => {
      const { mes, ano } = periodo(url);
      const { id, mapeamento, lembrar } = await lerJson(req);
      const planilha = planilhaGuardada(id);
      const normalizado = normalizarMapeamento(mapeamento, planilha.titulos.length);
      const faltando = formulario.validarMapeamento(normalizado);
      if (faltando.length) throw new ErroHttp(422, `Mapeie as colunas: ${faltando.join(', ')}.`);
      if (lembrar) formulario.lembrarMapeamento(arquivos.mapeamentos, planilha.titulos, normalizado);
      const respostas = formulario.lerRespostas(planilha, normalizado);
      const resultado = await prepararConferencia(cliente(), respostas, mes, ano, arquivos.apelidos);
      fs.mkdirSync(arquivos.conferencias, { recursive: true });
      escreverConferencia(arquivos.conferencia(mes, ano), resultado.itens);
      responderJson(res, {
        itens: resultado.itens,
        resumo: resumir(resultado.itens),
        semResposta: resultado.semResposta.map(resumoPublicador),
        totalLancados: resultado.totalLancados,
      });
    },

    'GET /api/conferencia': async (req, res, url) => {
      const { mes, ano } = periodo(url);
      const arquivo = arquivos.conferencia(mes, ano);
      if (!fs.existsSync(arquivo)) throw new ErroHttp(404, 'Ainda não existe conferência para esse mês.');
      const itens = lerConferencia(arquivo);
      responderJson(res, { itens, resumo: resumir(itens) });
    },

    'PUT /api/conferencia': async (req, res, url) => {
      const { mes, ano } = periodo(url);
      const { itens } = await lerJson(req);
      fs.mkdirSync(arquivos.conferencias, { recursive: true });
      escreverConferencia(arquivos.conferencia(mes, ano), itens);
      responderJson(res, { salvo: true, resumo: resumir(itens) });
    },

    'GET /api/conferencia.xlsx': async (req, res, url) => {
      const { mes, ano } = periodo(url);
      responderArquivo(res, arquivos.conferencia(mes, ano), path.basename(arquivos.conferencia(mes, ano)));
    },

    'POST /api/simular': async (req, res, url) => {
      const { mes, ano } = periodo(url);
      const { itens } = await lerJson(req);
      const { comErro, pendentes, jaExistentes } = await validarEnvio(cliente(), itens, mes, ano);
      responderJson(res, {
        erros: comErro.map(p => ({ linha: p.item.linha, nome: p.item.nomeHourglass || p.item.nomeFormulario, erros: p.erros })),
        jaExistentes: jaExistentes.map(p => p.item.nomeHourglass),
        pendentes: pendentes.map(p => ({ linha: p.item.linha, nome: p.item.nomeHourglass, detalhe: descreverRelatorio(p) })),
      });
    },

    'POST /api/enviar': async (req, res, url) => {
      const { mes, ano } = periodo(url);
      const { itens, confirmacao } = await lerJson(req);
      if (confirmacao !== 'ENVIAR') throw new ErroHttp(400, 'Confirmação ausente.');
      const api = cliente();
      if (!(await api.conta()).permissoes.lancarRelatorios) throw new ErroHttp(403, 'Sua conta do Hourglass não tem permissão para lançar relatórios.');
      const { comErro, pendentes, jaExistentes } = await validarEnvio(api, itens, mes, ano);
      if (comErro.length) throw new ErroHttp(422, 'Há linhas com erro. Rode a simulação e corrija.');

      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
      const escrever = dados => res.write(JSON.stringify(dados) + '\n');
      escrever({ tipo: 'inicio', total: pendentes.length });
      const resultados = await enviarRelatorios(api, pendentes, (resultado, feitos, total) => escrever({ tipo: 'progresso', feitos, total, ...resultado }));
      const jaNoHourglass = jaExistentes.map(p => ({ id: p.relatorio.user.id, ok: true }));
      escreverConferencia(arquivos.conferencia(mes, ano), marcarEnviados(itens, [...resultados, ...jaNoHourglass]));
      escrever({ tipo: 'fim', enviados: resultados.filter(r => r.ok).length, falhas: resultados.filter(r => !r.ok).length });
      res.end();
    },

    'POST /api/apelidos': async (req, res) => {
      const { nome, id } = await lerJson(req);
      if (!nome || !Number(id)) throw new ErroHttp(400, 'Informe nome e ID.');
      salvarApelido(arquivos.apelidos, nome, id);
      responderJson(res, { salvo: true });
    },

    'GET /api/faltantes': async (req, res) => {
      const levantamento = await levantarFaltantes(cliente());
      fs.mkdirSync(arquivos.conferencias, { recursive: true });
      salvarFaltantes(arquivos.faltantes(levantamento.mes), levantamento);
      responderJson(res, { ...levantamento, mensagem: mensagemGeral(levantamento) });
    },

    'GET /api/faltantes.xlsx': async (req, res, url) => {
      const rotulo = url.searchParams.get('mes') ?? '';
      if (!/^\d{4}-\d{2}$/.test(rotulo)) throw new ErroHttp(400, 'Mês inválido.');
      responderArquivo(res, arquivos.faltantes(rotulo), `faltantes-${rotulo}.xlsx`);
    },
  };

  return async function atender(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const rota = rotas[`${req.method} ${url.pathname}`];
    try {
      if (!origemPermitida(req)) throw new ErroHttp(403, 'Origem não permitida.');
      if (rota) return await rota(req, res, url);
      if (req.method === 'GET') return servirEstatico(res, url.pathname);
      throw new ErroHttp(404, 'Rota não encontrada.');
    } catch (erro) {
      if (res.headersSent) return res.end();
      responderJson(res, { erro: erro.message }, erro.status ?? 500);
    }
  };
}

function iniciar(opcoes) {
  const servidor = http.createServer(criarAplicacao(opcoes));
  servidor.listen(opcoes?.porta ?? PORTA, '127.0.0.1', () => {
    process.stdout.write(`Importador Hourglass rodando em http://localhost:${servidor.address().port}\n`);
  });
  return servidor;
}

if (require.main === module) iniciar();

module.exports = { criarAplicacao, iniciar };
