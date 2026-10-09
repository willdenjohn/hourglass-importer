async function requisitar(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, opcoes);
  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resposta.json() : null;
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
  preparar: (periodo, arquivo) => requisitar(`/api/preparar?${consulta(periodo)}`, { method: 'POST', body: arquivo }),
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
