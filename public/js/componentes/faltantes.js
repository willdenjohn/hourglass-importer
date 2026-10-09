import { h, substituir, notificar } from '../dom.js';
import { api } from '../api.js';

function formatarRotulo(rotulo) {
  const [ano, mes] = rotulo.split('-');
  return `${mes}/${ano}`;
}

function totais({ totais: t }) {
  const cartaoNumero = (rotulo, valor, classe = '') => h('div', { class: 'cartao' },
    h('div', { class: 'texto-suave' }, rotulo), h('div', { class: `numero-destaque ${classe}` }, valor));
  return h('div', { class: 'grade' },
    cartaoNumero('Ativos', t.ativos),
    cartaoNumero('Entregues', t.entregues),
    cartaoNumero('Em falta', t.faltando),
    cartaoNumero('Inativos', t.inativos));
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    notificar('Mensagem copiada.');
  } catch {
    notificar('Não foi possível copiar. Selecione o texto e use Ctrl+C.', 'erro');
  }
}

function cartaoMensagem(texto) {
  return h('div', { class: 'cartao' },
    h('h3', { class: 'cartao__titulo' }, 'Mensagem para enviar'),
    h('p', { class: 'texto-suave' }, 'Lista completa dos que faltam, pronta para colar no WhatsApp.'),
    h('textarea', { class: 'entrada mensagem', id: 'mensagem-faltantes', readonly: true, 'aria-label': 'Mensagem com a lista de faltantes' }, texto),
    h('div', { class: 'linha-acoes' }, h('button', { class: 'botao botao--primario', id: 'botao-copiar-mensagem', onClick: () => copiar(texto) }, 'Copiar mensagem')));
}

function cartaoGrupo(grupo, membros) {
  return h('div', { class: 'cartao', dataset: { grupo } },
    h('div', { class: 'grupo__cabecalho' },
      h('h3', { class: 'cartao__titulo' }, grupo),
      h('span', { class: 'selo selo--alerta' }, `${membros.length} em falta`)),
    membros[0].dirigente ? h('div', { class: 'texto-suave' }, `Dirigente: ${membros[0].dirigente}`) : null,
    membros.map(m => h('div', { class: 'grupo__membro' },
      h('span', {}, m.nome, h('span', { class: 'texto-suave' }, ` · ${m.status}`),
        m.mesesSemRelatorio > 1 ? h('span', { class: 'selo selo--perigo' }, `${m.mesesSemRelatorio} meses`) : null),
      h('span', { class: 'texto-suave' }, m.telefone || '—'))));
}

function porGrupo(faltantes) {
  const grupos = new Map();
  faltantes.forEach(f => grupos.set(f.grupo, [...(grupos.get(f.grupo) || []), f]));
  return [...grupos.entries()];
}

export function montarFaltantes(painel) {
  let dados = null;
  let carregando = false;

  async function carregar() {
    carregando = true;
    render();
    try {
      dados = await api.faltantes();
    } catch (erro) {
      notificar(erro.message, 'erro');
    } finally {
      carregando = false;
      render();
    }
  }

  function conteudo() {
    if (carregando) return h('div', { class: 'aviso' }, 'Consultando o Hourglass…');
    if (!dados) return h('div', { class: 'aviso' }, 'Clique em Atualizar para consultar quem ainda não entregou.');
    return [
      totais(dados),
      dados.faltantes.length ? cartaoMensagem(dados.mensagem) : null,
      h('div', { class: 'grade grade--larga' }, porGrupo(dados.faltantes).map(([grupo, membros]) => cartaoGrupo(grupo, membros))),
      dados.inativos.length ? h('details', { class: 'cartao' },
        h('summary', {}, `Inativos — 6 meses ou mais sem relatório (${dados.inativos.length})`),
        h('ul', { class: 'lista-simples' }, dados.inativos.map(i => h('li', {}, `${i.nome} — ${i.grupo}`)))) : null,
    ];
  }

  function render() {
    substituir(painel,
      h('div', { class: 'cartao' },
        h('div', { class: 'grupo__cabecalho' },
          h('h2', { class: 'cartao__titulo' }, dados ? `Relatórios em falta — ${formatarRotulo(dados.mes)}` : 'Relatórios em falta'),
          h('div', { class: 'linha-acoes' },
            dados ? h('a', { class: 'botao', href: api.urlFaltantesXlsx(dados.mes), download: true }, 'Baixar Excel') : null,
            h('button', { class: 'botao botao--primario', id: 'botao-atualizar-faltantes', disabled: carregando, onClick: carregar }, 'Atualizar'))),
        h('p', { class: 'texto-suave' }, 'Mês em aberto no Hourglass, consultado direto da lista de relatórios em falta.')),
      conteudo());
  }

  return { render, carregar };
}
