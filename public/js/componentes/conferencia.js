import { h, substituir, notificar } from '../dom.js';
import { api } from '../api.js';
import { estado, atualizar, SITUACOES } from '../estado.js';
import { errosDoItem } from '../validacao.js';
import { normalizarBusca } from '../texto.js';
import { linhaConferencia } from './linhaConferencia.js';
import { mostrarSimulacao, mostrarProgresso } from './dialogoEnvio.js';
import { rotuloPeriodo } from './importar.js';
import { avisoMesEnviado } from './avisoMes.js';

const CABECALHO = ['Situação', 'Linha', 'No Forms', 'No Hourglass', 'Participou', 'Horas', 'Crédito', 'Estudos', 'Pioneiro', 'Alertas'];
const ATRASO_SALVAR = 800;

export function montarConferencia(painel, irPara) {
  let filtro = 'TODOS';
  let busca = '';
  let temporizador = null;
  let salvamento = { estado: 'ocioso', em: null };
  const linhas = new WeakMap();
  const areas = {};

  function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function marcarSalvamento(novo) {
    salvamento = novo;
    if (areas.salvamento) substituir(areas.salvamento, textoSalvamento());
  }

  function textoSalvamento() {
    if (salvamento.estado === 'salvando') return 'Salvando…';
    if (salvamento.estado === 'erro') return h('span', { class: 'texto-perigo' }, 'Não foi possível salvar — tente de novo.');
    if (salvamento.estado === 'salvo') return `Alterações salvas às ${salvamento.em}.`;
    return 'Edições são salvas automaticamente na conferência do mês.';
  }

  function agendarSalvamento() {
    clearTimeout(temporizador);
    marcarSalvamento({ estado: 'salvando' });
    temporizador = setTimeout(async () => {
      try {
        await api.salvarConferencia(estado.periodo, estado.itens);
        marcarSalvamento({ estado: 'salvo', em: horaAtual() });
      } catch (erro) {
        marcarSalvamento({ estado: 'erro' });
        notificar(`Não foi possível salvar: ${erro.message}`, 'erro');
      }
    }, ATRASO_SALVAR);
  }

  function visivel(item) {
    if (filtro !== 'TODOS' && item.situacao !== filtro) return false;
    if (!busca) return true;
    return normalizarBusca(`${item.nomeFormulario} ${item.nomeHourglass ?? ''}`).includes(busca);
  }

  function criarLinha(item) {
    const linha = linhaConferencia(item, estado.publicadores, { aoAlterar: alterarItem, aoTrocarPublicador: trocarPublicador, aoLembrar: lembrarApelido });
    linhas.set(item, linha);
    return linha;
  }

  function aplicarNaLinha(linha, item) {
    const nova = linhaConferencia(item, estado.publicadores, { aoAlterar: alterarItem, aoTrocarPublicador: trocarPublicador, aoLembrar: lembrarApelido });
    linha.dataset.situacao = nova.dataset.situacao;
    [...nova.children].forEach((celulaNova, indice) => {
      const celula = linha.children[indice];
      if (celula && !celula.contains(document.activeElement)) celula.replaceWith(celulaNova);
    });
  }

  function redesenharLinha(item) {
    const linha = linhas.get(item);
    if (!linha?.isConnected) return;
    setTimeout(() => aplicarNaLinha(linha, item), 0);
  }

  function alterarItem(item, mudancas) {
    Object.assign(item, mudancas);
    agendarSalvamento();
    redesenharLinha(item);
    atualizarResumo();
  }

  function trocarPublicador(item, id) {
    const publicador = estado.publicadores.find(p => p.id === id);
    alterarItem(item, { id, nomeHourglass: publicador?.nome ?? '', cadastro: publicador?.status ?? '', correspondencia: 'manual', apelidoSalvo: false });
  }

  async function lembrarApelido(item) {
    try {
      await api.salvarApelido(item.nomeFormulario, item.id);
      item.apelidoSalvo = true;
      notificar(`"${item.nomeFormulario}" será reconhecido como ${item.nomeHourglass} nos próximos meses.`);
      redesenharLinha(item);
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
  }

  function contagens() {
    const contagem = { TODOS: estado.itens.length };
    SITUACOES.forEach(s => { contagem[s] = estado.itens.filter(i => i.situacao === s).length; });
    return contagem;
  }

  function botoesFiltro() {
    const contagem = contagens();
    return ['TODOS', ...SITUACOES].filter(s => s === 'TODOS' || contagem[s] || s === filtro).map(s =>
      h('button', {
        class: 'filtro', 'aria-pressed': String(filtro === s), dataset: { filtro: s },
        onClick: () => { filtro = s; atualizarResumo(); redesenharCorpo(); },
      }, `${s === 'TODOS' ? 'Todos' : s} (${contagem[s] ?? 0})`));
  }

  function campoBusca() {
    return h('input', {
      class: 'entrada entrada--compacta campo-busca', type: 'search', id: 'busca-conferencia',
      placeholder: 'Buscar nome…', value: busca, 'aria-label': 'Buscar nome na conferência',
      onInput: e => { busca = normalizarBusca(e.target.value); redesenharCorpo(); },
    });
  }

  function redesenharCorpo() {
    const visiveis = estado.itens.filter(visivel);
    substituir(areas.corpo, visiveis.length
      ? visiveis.map(criarLinha)
      : h('tr', {}, h('td', { colSpan: CABECALHO.length, class: 'texto-suave celula-vazia' }, 'Nenhuma linha encontrada com esse filtro ou busca.')));
  }

  async function simular() {
    try {
      clearTimeout(temporizador);
      await api.salvarConferencia(estado.periodo, estado.itens);
      marcarSalvamento({ estado: 'salvo', em: horaAtual() });
      const resultado = await api.simular(estado.periodo, estado.itens);
      mostrarSimulacao(resultado, rotuloPeriodo(estado.periodo), enviar);
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
  }

  async function enviar(dialogoAberto) {
    const tela = mostrarProgresso(dialogoAberto);
    try {
      await api.enviar(estado.periodo, estado.itens, evento => {
        if (evento.tipo === 'progresso') tela.progresso(evento);
        if (evento.tipo === 'fim') tela.concluir(evento, () => { dialogoAberto.fechar(); irPara('faltantes'); });
      });
      const { itens } = await api.conferencia(estado.periodo);
      atualizar({ itens });
    } catch (erro) {
      notificar(erro.message, 'erro');
      dialogoAberto.fechar();
    }
  }

  function conteudoBarra() {
    const prontos = estado.itens.filter(i => i.situacao === 'ENVIAR');
    const comErro = prontos.filter(i => errosDoItem(i).length).length;
    const semPermissao = estado.sessao?.conta && !estado.sessao.conta.permissoes.lancarRelatorios;
    areas.salvamento = h('div', { class: 'texto-suave', id: 'estado-salvamento', 'aria-live': 'polite' }, textoSalvamento());
    return [
      h('div', {},
        h('strong', {}, `${prontos.length} para enviar`),
        comErro ? h('span', { class: 'selo selo--perigo espaco-esquerda' }, `${comErro} com erro`) : null,
        semPermissao ? h('div', { class: 'selo selo--perigo' }, 'Sua conta não tem permissão para lançar relatórios') : null,
        areas.salvamento),
      h('div', { class: 'linha-acoes' },
        h('a', { class: 'botao', href: api.urlConferenciaXlsx(estado.periodo), download: true }, 'Baixar Excel'),
        h('button', { class: 'botao botao--primario', id: 'botao-simular', disabled: !prontos.length, onClick: simular }, 'Simular envio')),
    ];
  }

  function atualizarResumo() {
    substituir(areas.filtros, botoesFiltro());
    substituir(areas.barra, conteudoBarra());
  }

  function semResposta() {
    if (!estado.semResposta.length) return null;
    return h('details', { class: 'cartao' },
      h('summary', {}, `${estado.semResposta.length} publicadores sem resposta no Forms e sem relatório no Hourglass`),
      h('ul', { class: 'lista-simples' }, estado.semResposta.map(p => h('li', {}, p.nome))));
  }

  function render() {
    if (!estado.itens.length) {
      substituir(painel, h('div', { class: 'cartao' },
        h('h2', { class: 'cartao__titulo' }, 'Nenhuma conferência carregada'),
        h('p', { class: 'texto-suave' }, 'Importe a planilha na etapa 2 ou abra uma conferência salva.'),
        h('button', { class: 'botao botao--primario', onClick: () => irPara('importar') }, 'Ir para importação')));
      return;
    }
    const rolagem = window.scrollY;
    areas.filtros = h('div', { class: 'filtros', role: 'group', 'aria-label': 'Filtrar por situação' });
    areas.corpo = h('tbody');
    areas.barra = h('div', { class: 'barra-envio' });
    substituir(painel,
      h('div', { class: 'cartao' },
        h('h2', { class: 'cartao__titulo' }, `Conferência de ${rotuloPeriodo(estado.periodo)}`),
        h('p', { class: 'texto-suave' }, 'Confira as linhas em amarelo e vermelho, ajuste os valores e mude a situação para ENVIAR. Só linhas ENVIAR são enviadas.'),
        avisoMesEnviado()),
      semResposta(),
      h('div', { class: 'barra-ferramentas' }, areas.filtros, campoBusca()),
      h('div', { class: 'tabela-rolagem' },
        h('table', { class: 'tabela', id: 'tabela-conferencia' }, h('thead', {}, h('tr', {}, CABECALHO.map(c => h('th', {}, c)))), areas.corpo)),
      areas.barra);
    atualizarResumo();
    redesenharCorpo();
    window.scrollTo(0, rolagem);
  }

  return { render };
}

export async function carregarPublicadores() {
  try {
    atualizar({ publicadores: await api.publicadores() });
  } catch (erro) {
    notificar(erro.message, 'erro');
  }
}
