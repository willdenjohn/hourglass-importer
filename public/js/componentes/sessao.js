import { h, substituir, notificar, formatarData } from '../dom.js';
import { api } from '../api.js';
import { estado, atualizar } from '../estado.js';

function situacaoSessao(sessao) {
  if (!sessao) return h('div', { class: 'aviso' }, 'Verificando…');
  if (!sessao.configurada) return h('div', { class: 'aviso aviso--alerta' }, 'Nenhuma sessão configurada. Cole os cookies abaixo.');
  if (!sessao.valida) return h('div', { class: 'aviso aviso--perigo' }, sessao.erro);
  return h('div', { class: 'aviso aviso--sucesso' },
    `Conectado ao Hourglass — ${sessao.publicadores} publicadores ativos.`,
    sessao.expira ? ` Login válido até ${formatarData(sessao.expira)}.` : '');
}

function mesPorExtenso(rotulo) {
  if (!rotulo) return '—';
  const [ano, mes] = rotulo.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function marcador(ok, texto) {
  return h('span', { class: `selo ${ok ? 'selo--sucesso' : 'selo--perigo'}` }, `${ok ? '✔' : '✖'} ${texto}`);
}

function detalhesConta(conta) {
  if (!conta) return null;
  const linha = (rotulo, valor) => h('div', {}, h('div', { class: 'texto-suave' }, rotulo), h('strong', {}, valor || '—'));
  return h('div', { class: 'cartao', id: 'dados-conta' },
    h('h3', { class: 'cartao__titulo' }, 'Dados da conta'),
    h('div', { class: 'grade' },
      linha('Usuário', [conta.usuario.nome, conta.usuario.designacao].filter(Boolean).join(' · ')),
      linha('Congregação', conta.congregacao.nome),
      linha('Número', conta.congregacao.numero),
      linha('País / fuso', [conta.congregacao.pais, conta.congregacao.fuso].filter(Boolean).join(' · ')),
      linha('Mês em aberto', mesPorExtenso(conta.mesEmAberto)),
      linha('Último mês enviado à filial', mesPorExtenso(conta.ultimoMesEnviado)),
      linha('Publicadores ativos', conta.publicadores),
      linha('Grupos de campo', conta.grupos.join(', '))),
    h('div', { class: 'linha-acoes' },
      marcador(conta.permissoes.lancarRelatorios, 'Lançar relatórios'),
      marcador(conta.permissoes.verResumo, 'Ver resumos e faltantes')));
}

function instrucoes() {
  return h('ol', { class: 'lista-simples texto-suave' },
    h('li', {}, 'Abra o Hourglass logado no navegador e aperte F12.'),
    h('li', {}, 'Vá em Application → Cookies → https://app.hourglass-app.com.'),
    h('li', {}, 'Copie a coluna Value de hglogin e de X-Hourglass-XSRF-Token e cole abaixo.'));
}

function formulario(aoSalvar) {
  const hglogin = h('textarea', { class: 'entrada entrada--mono', id: 'campo-hglogin', rows: 3, placeholder: 'valor do hglogin (começa com eyJ)', spellcheck: false });
  const xsrf = h('input', { class: 'entrada entrada--mono', id: 'campo-xsrf', placeholder: 'valor do X-Hourglass-XSRF-Token', spellcheck: false });
  const botao = h('button', { class: 'botao botao--primario', type: 'submit' }, 'Salvar e testar conexão');

  async function enviar(evento) {
    evento.preventDefault();
    botao.disabled = true;
    try {
      await aoSalvar({ hglogin: hglogin.value, xsrf: xsrf.value });
      hglogin.value = '';
      xsrf.value = '';
    } finally {
      botao.disabled = false;
    }
  }

  return h('form', { onSubmit: enviar },
    h('label', { class: 'campo' }, h('span', { class: 'campo__rotulo' }, 'hglogin'), hglogin),
    h('label', { class: 'campo' }, h('span', { class: 'campo__rotulo' }, 'X-Hourglass-XSRF-Token'), xsrf),
    h('div', { class: 'linha-acoes' }, botao));
}

export function montarSessao(painel) {
  async function salvar(dados) {
    try {
      const sessao = await api.salvarSessao(dados);
      atualizar({ sessao });
      notificar('Sessão salva e conectada.');
    } catch (erro) {
      notificar(erro.message, 'erro');
    }
  }

  function render() {
    substituir(painel,
      h('div', { class: 'cartao' },
        h('h2', { class: 'cartao__titulo' }, 'Sessão do Hourglass'),
        situacaoSessao(estado.sessao)),
      detalhesConta(estado.sessao?.valida ? estado.sessao.conta : null),
      h('div', { class: 'cartao' },
        h('h3', { class: 'cartao__titulo' }, estado.sessao?.valida ? 'Trocar sessão' : 'Conectar'),
        instrucoes(),
        formulario(salvar),
        h('p', { class: 'texto-suave' }, 'Os cookies ficam salvos apenas neste computador (sessao.json) e dão acesso à sua conta. Não compartilhe.')));
  }

  return { render };
}
