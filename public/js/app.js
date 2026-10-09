import { api } from './api.js';
import { estado, atualizar, observar } from './estado.js';
import { formatarData } from './dom.js';
import { montarSessao } from './componentes/sessao.js';
import { montarImportar } from './componentes/importar.js';
import { montarConferencia, carregarPublicadores } from './componentes/conferencia.js';
import { montarFaltantes } from './componentes/faltantes.js';

const abas = [...document.querySelectorAll('.aba')];
const painel = nome => document.getElementById(`painel-${nome}`);
const seletorPeriodo = document.getElementById('periodo');
const seloSessao = document.getElementById('selo-sessao');
const subtitulo = document.getElementById('subtitulo');
let periodoEscolhido = false;

const telas = {
  sessao: montarSessao(painel('sessao')),
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
  if (periodoEscolhido || !conta.mesEmAberto) return;
  const [ano, mes] = conta.mesEmAberto.split('-').map(Number);
  seletorPeriodo.value = conta.mesEmAberto;
  atualizar({ periodo: { mes, ano } });
}

function valorPeriodo({ mes, ano }) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

seletorPeriodo.value = valorPeriodo(estado.periodo);
seletorPeriodo.addEventListener('change', () => {
  const [ano, mes] = seletorPeriodo.value.split('-').map(Number);
  periodoEscolhido = true;
  if (ano && mes) atualizar({ periodo: { mes, ano }, itens: [], semResposta: [] });
});

abas.forEach(aba => aba.addEventListener('click', () => irPara(aba.dataset.aba)));

observar((novo, mudou) => {
  if ('sessao' in mudou) {
    atualizarSelo(novo.sessao);
    aplicarConta(novo.sessao?.conta);
    if (novo.sessao?.valida && !novo.publicadores.length) carregarPublicadores();
  }
  if ('sessao' in mudou || 'periodo' in mudou || 'publicadores' in mudou) telas[abaAtual].render();
});

async function iniciar() {
  irPara('sessao');
  try {
    const sessao = await api.sessao();
    atualizar({ sessao });
    if (sessao.valida) irPara('importar');
  } catch (erro) {
    atualizar({ sessao: { configurada: false, erro: erro.message } });
  }
}

iniciar();
