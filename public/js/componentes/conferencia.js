import { h, substituir, notificar } from '../dom.js';
import { api } from '../api.js';
import { estado, atualizar, SITUACOES } from '../estado.js';
import { errosDoItem } from '../validacao.js';
import { linhaConferencia } from './linhaConferencia.js';
import { mostrarSimulacao, mostrarProgresso } from './dialogoEnvio.js';
import { rotuloPeriodo } from './importar.js';
import { avisoMesEnviado } from './avisoMes.js';

const CABECALHO = ['Situação', 'Linha', 'No Forms', 'No Hourglass', 'Participou', 'Horas', 'Crédito', 'Estudos', 'Pioneiro', 'Alertas'];
const ATRASO_SALVAR = 800;

export function montarConferencia(painel, irPara) {
  let filtro = 'TODOS';
  let temporizador = null;
  let corpoTabela = null;

  function agendarSalvamento() {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      try {
        await api.salvarConferencia(estado.periodo, estado.itens);
      } catch (erro) {
        notificar(`Não foi possível salvar: ${erro.message}`, 'erro');
      }
    }, ATRASO_SALVAR);
  }

  function alterarItem(item, mudancas) {
    Object.assign(item, mudancas);
    agendarSalvamento();
    render();
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
      render();
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
  }

  function contagens() {
    const contagem = { TODOS: estado.itens.length };
    SITUACOES.forEach(s => { contagem[s] = estado.itens.filter(i => i.situacao === s).length; });
    return contagem;
  }

  function barraFiltros() {
    const contagem = contagens();
    return h('div', { class: 'filtros', role: 'group', 'aria-label': 'Filtrar por situação' },
      ['TODOS', ...SITUACOES].filter(s => s === 'TODOS' || contagem[s]).map(s =>
        h('button', { class: 'filtro', 'aria-pressed': String(filtro === s), dataset: { filtro: s }, onClick: () => { filtro = s; render(); } }, `${s === 'TODOS' ? 'Todos' : s} (${contagem[s]})`)));
  }

  function tabela() {
    const visiveis = estado.itens.filter(i => filtro === 'TODOS' || i.situacao === filtro);
    corpoTabela = h('tbody', {}, visiveis.map(item =>
      linhaConferencia(item, estado.publicadores, { aoAlterar: alterarItem, aoTrocarPublicador: trocarPublicador, aoLembrar: lembrarApelido })));
    return h('div', { class: 'tabela-rolagem' },
      h('table', { class: 'tabela', id: 'tabela-conferencia' }, h('thead', {}, h('tr', {}, CABECALHO.map(c => h('th', {}, c)))), corpoTabela));
  }

  async function simular() {
    try {
      await api.salvarConferencia(estado.periodo, estado.itens);
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

  function barraEnvio() {
    const prontos = estado.itens.filter(i => i.situacao === 'ENVIAR');
    const comErro = prontos.filter(i => errosDoItem(i).length).length;
    return h('div', { class: 'barra-envio' },
      h('div', {},
        h('strong', {}, `${prontos.length} para enviar`),
        comErro ? h('span', { class: 'selo selo--perigo' }, `${comErro} com erro`) : null,
        estado.sessao?.conta && !estado.sessao.conta.permissoes.lancarRelatorios ? h('div', { class: 'selo selo--perigo' }, 'Sua conta não tem permissão para lançar relatórios') : null,
        h('div', { class: 'texto-suave' }, 'Edições são salvas automaticamente na conferência do mês.')),
      h('div', { class: 'linha-acoes' },
        h('a', { class: 'botao', href: api.urlConferenciaXlsx(estado.periodo), download: true }, 'Baixar Excel'),
        h('button', { class: 'botao botao--primario', id: 'botao-simular', disabled: !prontos.length, onClick: simular }, 'Simular envio')));
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
        h('p', { class: 'texto-suave' }, 'Importe a planilha do Forms na etapa 2 ou abra uma conferência salva.'),
        h('button', { class: 'botao botao--primario', onClick: () => irPara('importar') }, 'Ir para importação')));
      return;
    }
    const rolagem = window.scrollY;
    substituir(painel,
      h('div', { class: 'cartao' },
        h('h2', { class: 'cartao__titulo' }, `Conferência de ${rotuloPeriodo(estado.periodo)}`),
        h('p', { class: 'texto-suave' }, 'Confira as linhas em amarelo e vermelho, ajuste os valores e mude a situação para ENVIAR. Só linhas ENVIAR são enviadas.'),
        avisoMesEnviado()),
      semResposta(),
      barraFiltros(),
      tabela(),
      barraEnvio());
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
