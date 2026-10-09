let renovarSessao = null;

export function definirRenovacaoDeSessao(funcao) {
  renovarSessao = funcao;
}

async function requisitar(caminho, opcoes = {}, tentativa = 1) {
  const resposta = await fetch(caminho, opcoes);
  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resposta.json() : null;
  const podeRenovar = resposta.status === 401 && caminho !== '/api/sessao' && tentativa === 1 && renovarSessao;
  if (podeRenovar && await renovarSessao()) return requisitar(caminho, opcoes, 2);
  if (!resposta.ok) throw new Error(dados?.erro || `Erro ${resposta.status}`);
  return dados;
}

function json(metodo, dados) {
  return { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) };
}

const consulta = ({ mes, ano }) => `mes=${mes}&ano=${ano}`;

export const api = {
  sessao: () => requisitar('/api/sessao'),
  salvarSessao: dados => requisitar('/api/sessao', json('POST', dados)),
  publicadores: () => requisitar('/api/publicadores'),
  enviarPlanilha: arquivo => requisitar('/api/planilha', { method: 'POST', body: arquivo }),
  amostraPlanilha: (id, mapeamento) => requisitar('/api/planilha/amostra', json('POST', { id, mapeamento })),
  preparar: (periodo, dados) => requisitar(`/api/preparar?${consulta(periodo)}`, json('POST', dados)),
  conferencia: periodo => requisitar(`/api/conferencia?${consulta(periodo)}`),
  salvarConferencia: (periodo, itens) => requisitar(`/api/conferencia?${consulta(periodo)}`, json('PUT', { itens })),
  simular: (periodo, itens) => requisitar(`/api/simular?${consulta(periodo)}`, json('POST', { itens })),
  salvarApelido: (nome, id) => requisitar('/api/apelidos', json('POST', { nome, id })),
  faltantes: () => requisitar('/api/faltantes'),
  urlConferenciaXlsx: periodo => `/api/conferencia.xlsx?${consulta(periodo)}`,
  urlFaltantesXlsx: rotulo => `/api/faltantes.xlsx?mes=${rotulo}`,

  async enviar(periodo, itens, aoEvento) {
    const resposta = await fetch(`/api/enviar?${consulta(periodo)}`, json('POST', { itens, confirmacao: 'ENVIAR' }));
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      throw new Error(dados.erro || `Erro ${resposta.status}`);
    }
    const leitor = resposta.body.getReader();
    const decodificador = new TextDecoder();
    let pendente = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      pendente += decodificador.decode(value, { stream: true });
      const linhas = pendente.split('\n');
      pendente = linhas.pop();
      linhas.filter(Boolean).forEach(linha => aoEvento(JSON.parse(linha)));
    }
  },
};
