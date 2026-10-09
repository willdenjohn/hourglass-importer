import { api, definirRenovacaoDeSessao } from './api.js';
import { estado, atualizar, observar } from './estado.js';
import { formatarData, notificar } from './dom.js';
import { montarSessao } from './componentes/sessao.js';
import { montarImportar } from './componentes/importar.js';
import { montarConferencia, carregarPublicadores } from './componentes/conferencia.js';
import { montarFaltantes } from './componentes/faltantes.js';
import { detectarExtensao, pedirSessao } from './extensao.js';
import { montarSeletorMes } from './componentes/seletorMes.js';

const abas = [...document.querySelectorAll('.aba')];
const painel = nome => document.getElementById(`painel-${nome}`);
const seloSessao = document.getElementById('selo-sessao');
const subtitulo = document.getElementById('subtitulo');
let periodoEscolhido = false;

const telas = {
  sessao: montarSessao(painel('sessao'), conectarPelaExtensao),
  importar: montarImportar(painel('importar'), irPara),
  conferencia: montarConferencia(painel('conferencia'), irPara),
  faltantes: montarFaltantes(painel('faltantes')),
};
let abaAtual = 'sessao';

function irPara(nome) {
  abaAtual = nome;
  abas.forEach(aba => aba.setAttribute('aria-selected', String(aba.dataset.aba === nome)));
  Object.keys(telas).forEach(chave => { painel(chave).hidden = chave !== nome; });
  telas[nome].render();
  if (nome === 'faltantes') telas.faltantes.carregar();
  window.scrollTo(0, 0);
}

function atualizarSelo(sessao) {
  if (!sessao) return;
  const valida = sessao.valida;
  seloSessao.className = `selo ${valida ? 'selo--sucesso' : 'selo--perigo'}`;
  seloSessao.textContent = valida
    ? `Hourglass conectado${sessao.expira ? ` · até ${formatarData(sessao.expira)}` : ''}`
    : 'Hourglass desconectado';
}

function aplicarConta(conta) {
  if (!conta) return;
  subtitulo.textContent = ['Microsoft Forms → Hourglass', conta.congregacao.nome].filter(Boolean).join(' · ');
  seletorMes.definirMesEmAberto(conta.mesEmAberto);
  if (periodoEscolhido || !conta.mesEmAberto) return;
  const [ano, mes] = conta.mesEmAberto.split('-').map(Number);
  seletorMes.definir({ mes, ano });
  atualizar({ periodo: { mes, ano } });
}

const seletorMes = montarSeletorMes(document.getElementById('seletor-mes'), periodo => {
  periodoEscolhido = true;
  atualizar({ periodo, itens: [], semResposta: [] });
});
seletorMes.definir(estado.periodo);

abas.forEach(aba => aba.addEventListener('click', () => irPara(aba.dataset.aba)));

observar((novo, mudou) => {
  if ('sessao' in mudou) {
    atualizarSelo(novo.sessao);
    aplicarConta(novo.sessao?.conta);
    if (novo.sessao?.valida && !novo.publicadores.length) carregarPublicadores();
  }
  if (['sessao', 'periodo', 'publicadores', 'extensao', 'sincronizandoExtensao', 'resultadoExtensao'].some(chave => chave in mudou)) telas[abaAtual].render();
});

async function consultarSessao() {
  try {
    const sessao = await api.sessao();
    atualizar({ sessao });
    return sessao;
  } catch (erro) {
    atualizar({ sessao: { configurada: false, erro: erro.message } });
    return null;
  }
}

async function conectarPelaExtensao(forcar = false) {
  atualizar({ sincronizandoExtensao: true });
  const resultado = await pedirSessao({ forcar });
  atualizar({ sincronizandoExtensao: false, resultadoExtensao: resultado });
  if (resultado.ok) await consultarSessao();
  return resultado;
}

definirRenovacaoDeSessao(async () => {
  if (estado.sincronizandoExtensao || !estado.extensao.ativa) {
    await consultarSessao();
    return false;
  }
  const resultado = await conectarPelaExtensao();
  notificar(resultado.ok ? 'Sessão do Hourglass renovada pela extensão.' : resultado.mensagem, resultado.ok ? 'info' : 'erro');
  return resultado.ok;
});

async function iniciar() {
  irPara('sessao');
  const [sessao] = await Promise.all([consultarSessao(), detectarExtensao()]);
  if (!sessao?.valida && estado.extensao.ativa) await conectarPelaExtensao();
  if (estado.sessao?.valida) irPara('importar');
}

iniciar();
