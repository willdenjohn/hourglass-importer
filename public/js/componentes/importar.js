import { h, substituir, notificar } from '../dom.js';
import { api } from '../api.js';
import { estado, atualizar } from '../estado.js';

const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function rotuloPeriodo({ mes, ano }) {
  return `${NOMES_MESES[mes - 1]}/${ano}`;
}

function zonaArquivo(aoEscolher) {
  const entrada = h('input', { type: 'file', accept: '.xlsx', class: 'oculto-visual', id: 'arquivo-forms' });
  const nome = h('div', { class: 'zona-arquivo__nome' });
  const zona = h('label', { class: 'zona-arquivo', for: 'arquivo-forms' },
    h('div', {}, 'Arraste aqui o Excel exportado do Forms'),
    h('div', { class: 'texto-suave' }, 'ou clique para escolher (.xlsx)'),
    nome, entrada);

  const escolher = arquivo => {
    if (!arquivo) return;
    nome.textContent = arquivo.name;
    aoEscolher(arquivo);
  };
  entrada.addEventListener('change', () => escolher(entrada.files[0]));
  zona.addEventListener('dragover', evento => { evento.preventDefault(); zona.classList.add('zona-arquivo--ativa'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('zona-arquivo--ativa'));
  zona.addEventListener('drop', evento => {
    evento.preventDefault();
    zona.classList.remove('zona-arquivo--ativa');
    escolher(evento.dataTransfer.files[0]);
  });
  return zona;
}

export function montarImportar(painel, irPara) {
  let arquivo = null;

  async function processar(botao) {
    botao.disabled = true;
    botao.textContent = 'Processando…';
    try {
      const resultado = await api.preparar(estado.periodo, arquivo);
      atualizar({ itens: resultado.itens, semResposta: resultado.semResposta });
      notificar(`${resultado.itens.length} respostas processadas.`);
      irPara('conferencia');
    } catch (erro) {
      notificar(erro.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Processar planilha';
    }
  }

  async function abrirSalva() {
    try {
      const { itens } = await api.conferencia(estado.periodo);
      atualizar({ itens, semResposta: [] });
      irPara('conferencia');
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
  }

  function render() {
    const botao = h('button', { class: 'botao botao--primario', id: 'botao-processar', disabled: true }, 'Processar planilha');
    botao.addEventListener('click', () => processar(botao));
    substituir(painel,
      h('div', { class: 'cartao' },
        h('h2', { class: 'cartao__titulo' }, `Importar relatórios de ${rotuloPeriodo(estado.periodo)}`),
        h('p', { class: 'texto-suave' }, 'O mês vem do seletor no topo. Processar só consulta o Hourglass — nada é enviado nesta etapa.'),
        zonaArquivo(escolhido => { arquivo = escolhido; botao.disabled = !estado.sessao?.valida; }),
        h('div', { class: 'linha-acoes' }, botao,
          h('button', { class: 'botao', onClick: abrirSalva }, 'Abrir conferência já salva deste mês')),
        !estado.sessao?.valida && h('div', { class: 'aviso aviso--alerta' }, 'Configure a sessão na etapa 1 antes de processar.')));
  }

  return { render };
}
