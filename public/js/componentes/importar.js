import { h, substituir, notificar } from '../dom.js';
import { api } from '../api.js';
import { estado, atualizar } from '../estado.js';
import { tabelaMapeamento, tabelaPrevia } from './mapeamento.js';
import { avisoMesEnviado } from './avisoMes.js';

const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const COLUNAS_MODELO = [
  ['Nome', 'Nome completo como está no Hourglass', 'Obrigatória'],
  ['Participou no ministério', 'Sim ou Não (publicadores)', 'Obrigatória*'],
  ['Estudos bíblicos', 'Número de estudos dirigidos', ''],
  ['Pioneiro auxiliar', 'Sim se foi pioneiro auxiliar no mês', ''],
  ['Horas', 'Número inteiro (pioneiros)', 'Obrigatória*'],
  ['Horas de crédito', 'Só pioneiro regular; campo + crédito até 55h', ''],
  ['Observações', 'Vai para as observações do relatório', ''],
];

export function rotuloPeriodo({ mes, ano }) {
  return `${NOMES_MESES[mes - 1]}/${ano}`;
}

function zonaArquivo(nomeArquivo, aoEscolher) {
  const entrada = h('input', { type: 'file', accept: '.xlsx,.xls', class: 'oculto-visual', id: 'arquivo-forms' });
  const zona = h('label', { class: 'zona-arquivo', for: 'arquivo-forms' },
    h('div', {}, 'Arraste aqui a planilha de relatórios (Excel)'),
    h('div', { class: 'texto-suave' }, 'Exportação do Forms ou a planilha modelo — clique para escolher'),
    nomeArquivo ? h('div', { class: 'zona-arquivo__nome' }, nomeArquivo) : null,
    entrada);

  entrada.addEventListener('change', () => entrada.files[0] && aoEscolher(entrada.files[0]));
  zona.addEventListener('dragover', evento => { evento.preventDefault(); zona.classList.add('zona-arquivo--ativa'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('zona-arquivo--ativa'));
  zona.addEventListener('drop', evento => {
    evento.preventDefault();
    zona.classList.remove('zona-arquivo--ativa');
    if (evento.dataTransfer.files[0]) aoEscolher(evento.dataTransfer.files[0]);
  });
  return zona;
}

function orientacao() {
  return h('details', { class: 'cartao', id: 'orientacao-planilha' },
    h('summary', { class: 'cartao__titulo' }, 'Que planilha posso enviar?'),
    h('p', { class: 'texto-suave' }, 'O ideal é a planilha modelo: as colunas seguem os campos do relatório no Hourglass e entram sem ajustes. Exportações do Forms e outras planilhas também funcionam — você confirma as colunas na próxima etapa.'),
    h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', {}, h('tr', {}, ['Coluna do modelo', 'O que preencher', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, COLUNAS_MODELO.map(([coluna, descricao, obrigatoria]) => h('tr', {}, h('td', {}, h('strong', {}, coluna)), h('td', {}, descricao), h('td', { class: 'texto-suave' }, obrigatoria)))))),
    h('p', { class: 'texto-suave' }, '* Basta uma das duas: Horas ou Participou. Pioneiros regulares e auxiliares contínuos são reconhecidos pelo cadastro do Hourglass. Uma linha por publicador; se o nome repetir, vale a última.'),
    h('a', { class: 'botao', href: '/api/modelo.xlsx', download: true }, 'Baixar planilha modelo'));
}

export function montarImportar(painel, irPara) {
  let arquivo = null;
  let planilha = null;
  let mapeamento = {};
  let amostra = [];
  let faltando = [];
  let lembrar = true;
  let processando = false;

  async function enviarArquivo(escolhido) {
    arquivo = escolhido;
    planilha = null;
    render();
    try {
      planilha = await api.enviarPlanilha(arquivo);
      ({ mapeamento, amostra, faltando } = planilha);
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
    render();
  }

  async function alterarMapeamento(chave, indices) {
    mapeamento = { ...mapeamento, [chave]: indices };
    render();
    try {
      ({ amostra, faltando } = await api.amostraPlanilha(planilha.id, mapeamento));
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
    render();
  }

  async function processar() {
    processando = true;
    render();
    try {
      const resultado = await api.preparar(estado.periodo, { id: planilha.id, mapeamento, lembrar });
      atualizar({ itens: resultado.itens, semResposta: resultado.semResposta });
      notificar(`${resultado.itens.length} respostas processadas.`);
      irPara('conferencia');
    } catch (erro) {
      notificar(erro.message, 'erro');
    } finally {
      processando = false;
      render();
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

  function situacaoFormato() {
    if (planilha.lembrado) return h('div', { class: 'aviso aviso--sucesso' }, 'Formato já conhecido: colunas aplicadas como da última vez.');
    if (faltando.length) return h('div', { class: 'aviso aviso--perigo' }, `Escolha a coluna para: ${faltando.join(', ')}.`);
    return h('div', { class: 'aviso aviso--alerta' }, 'Colunas detectadas automaticamente. Confira antes de processar — para não precisar ajustar, use a planilha modelo.');
  }

  function etapaMapeamento() {
    if (!planilha) return arquivo ? h('div', { class: 'aviso' }, 'Lendo a planilha…') : null;
    const podeProcessar = !faltando.length && estado.sessao?.valida && !processando;
    return [
      h('div', { class: 'cartao', id: 'cartao-mapeamento' },
        h('div', { class: 'grupo__cabecalho' },
          h('h3', { class: 'cartao__titulo' }, 'Colunas da planilha'),
          h('span', { class: 'selo' }, `${planilha.totalLinhas} linhas`)),
        situacaoFormato(),
        tabelaMapeamento(planilha, mapeamento, alterarMapeamento)),
      h('div', { class: 'cartao' },
        h('h3', { class: 'cartao__titulo' }, 'Prévia das primeiras linhas'),
        h('p', { class: 'texto-suave' }, 'Valores como foram lidos da planilha. A interpretação (horas em texto, crédito, pioneiro) acontece ao processar.'),
        tabelaPrevia(planilha.campos, amostra),
        h('div', { class: 'linha-acoes espaco-topo' },
          h('label', { class: 'linha-acoes' },
            h('input', { type: 'checkbox', id: 'lembrar-formato', checked: lembrar, onChange: e => { lembrar = e.target.checked; } }),
            'Lembrar este formato para as próximas importações'),
          h('button', { class: 'botao botao--primario', id: 'botao-processar', disabled: !podeProcessar, onClick: processar }, processando ? 'Processando…' : 'Processar planilha'))),
    ];
  }

  function render() {
    substituir(painel,
      h('div', { class: 'cartao' },
        h('div', { class: 'grupo__cabecalho' },
          h('h2', { class: 'cartao__titulo' }, `Importar relatórios de ${rotuloPeriodo(estado.periodo)}`),
          h('a', { class: 'botao', href: '/api/modelo.xlsx', download: true, id: 'baixar-modelo' }, 'Baixar planilha modelo')),
        h('p', { class: 'texto-suave' }, 'O mês vem do calendário no topo. Nada é enviado ao Hourglass nesta etapa.'),
        avisoMesEnviado(),
        zonaArquivo(arquivo?.name, enviarArquivo),
        h('div', { class: 'linha-acoes' }, h('button', { class: 'botao', onClick: abrirSalva }, 'Abrir conferência já salva deste mês')),
        !estado.sessao?.valida ? h('div', { class: 'aviso aviso--alerta espaco-topo' }, 'Conecte a sessão na etapa 1 para poder processar.') : null),
      etapaMapeamento(),
      orientacao());
  }

  return { render };
}
