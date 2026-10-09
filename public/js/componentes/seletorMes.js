import { h, substituir } from '../dom.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const indice = ({ mes, ano }) => ano * 12 + (mes - 1);
const deIndice = valor => ({ ano: Math.floor(valor / 12), mes: (valor % 12) + 1 });

function deRotulo(rotulo) {
  if (!rotulo) return null;
  const [ano, mes] = rotulo.split('-').map(Number);
  return { ano, mes };
}

export function montarSeletorMes(alvo, aoEscolher) {
  let selecionado = null;
  let emAberto = null;
  let ultimoEnviado = null;
  let anoVisivel = new Date().getFullYear();
  let aberto = false;

  const permitido = periodo => !emAberto || indice(periodo) <= indice(emAberto);

  function escolher(periodo) {
    if (!permitido(periodo)) return;
    aberto = false;
    selecionado = periodo;
    render();
    aoEscolher(periodo);
  }

  function mover(passo) {
    const proximo = deIndice(indice(selecionado) + passo);
    if (permitido(proximo)) escolher(proximo);
  }

  function alternar() {
    aberto = !aberto;
    anoVisivel = selecionado.ano;
    render();
  }

  function botaoMes(numero) {
    const periodo = { ano: anoVisivel, mes: numero };
    const classes = ['calendario__mes'];
    if (selecionado && indice(periodo) === indice(selecionado)) classes.push('calendario__mes--selecionado');
    if (emAberto && indice(periodo) === indice(emAberto)) classes.push('calendario__mes--aberto');
    const enviado = ultimoEnviado && indice(periodo) <= indice(ultimoEnviado);
    if (enviado) classes.push('calendario__mes--enviado');
    return h('button', {
      class: classes.join(' '), type: 'button', role: 'gridcell',
      disabled: !permitido(periodo),
      'aria-label': `${MESES[numero - 1]} de ${anoVisivel}${enviado ? ' (já enviado à filial)' : ''}`,
      title: enviado ? 'Já enviado à filial' : null,
      onClick: () => escolher(periodo),
    }, MESES_CURTOS[numero - 1]);
  }

  function painel() {
    const proximoAnoBloqueado = emAberto && anoVisivel >= emAberto.ano;
    return h('div', { class: 'calendario__painel', role: 'dialog', 'aria-label': 'Escolher mês' },
      h('div', { class: 'calendario__cabecalho' },
        h('button', { class: 'calendario__seta', type: 'button', 'aria-label': 'Ano anterior', onClick: () => { anoVisivel--; render(); } }, '‹'),
        h('strong', {}, anoVisivel),
        h('button', { class: 'calendario__seta', type: 'button', 'aria-label': 'Próximo ano', disabled: proximoAnoBloqueado, onClick: () => { anoVisivel++; render(); } }, '›')),
      h('div', { class: 'calendario__grade', role: 'grid' }, MESES.map((_, i) => botaoMes(i + 1))),
      emAberto ? h('div', { class: 'calendario__rodape' },
        h('div', {},
          h('span', { class: 'calendario__legenda' }, h('span', { class: 'calendario__ponto' }), 'Mês em aberto no Hourglass'),
          ultimoEnviado ? h('span', { class: 'calendario__legenda' }, h('span', { class: 'calendario__risco' }), 'Já enviado à filial') : null),
        h('button', { class: 'botao botao--pequeno', type: 'button', onClick: () => escolher(emAberto) }, 'Ir para ele')) : null);
  }

  function render() {
    if (!selecionado) return;
    const noAberto = emAberto && indice(selecionado) === indice(emAberto);
    substituir(alvo,
      h('div', { class: 'calendario' },
        h('button', { class: 'calendario__seta', type: 'button', 'aria-label': 'Mês anterior', onClick: () => mover(-1) }, '‹'),
        h('button', { class: 'calendario__atual', type: 'button', id: 'periodo', 'aria-expanded': String(aberto), onClick: alternar },
          h('span', { class: 'calendario__rotulo' }, 'Mês do relatório'),
          h('span', { class: 'calendario__valor' }, `${MESES[selecionado.mes - 1]} ${selecionado.ano}`,
            noAberto ? h('span', { class: 'calendario__ponto', title: 'Mês em aberto no Hourglass' }) : null)),
        h('button', { class: 'calendario__seta', type: 'button', 'aria-label': 'Próximo mês', disabled: !permitido(deIndice(indice(selecionado) + 1)), onClick: () => mover(1) }, '›'),
        aberto ? painel() : null));
  }

  document.addEventListener('click', evento => {
    if (aberto && !evento.composedPath().includes(alvo)) {
      aberto = false;
      render();
    }
  });
  document.addEventListener('keydown', evento => {
    if (aberto && evento.key === 'Escape') {
      aberto = false;
      render();
    }
  });

  return {
    definir(periodo) {
      selecionado = { ...periodo };
      render();
    },
    definirMesEmAberto(rotulo) {
      emAberto = deRotulo(rotulo);
      render();
    },
    definirUltimoEnviado(rotulo) {
      ultimoEnviado = deRotulo(rotulo);
      render();
    },
  };
}
