import { h, substituir } from '../dom.js';

function abrirDialogo(conteudo, rodape) {
  const corpo = h('div', { class: 'dialogo__corpo' }, conteudo);
  const areaRodape = h('div', { class: 'dialogo__rodape' }, rodape);
  const dialogo = h('dialog', { class: 'dialogo' }, corpo, areaRodape);
  const fechar = () => {
    if (dialogo.open) dialogo.close();
    dialogo.remove();
  };
  dialogo.addEventListener('close', fechar);
  document.body.append(dialogo);
  dialogo.showModal();
  return { dialogo, corpo, areaRodape, fechar };
}

function listaPendentes(pendentes) {
  return h('ul', { class: 'lista-simples' }, pendentes.map(p => h('li', {}, h('strong', {}, p.nome), ` — ${p.detalhe}`)));
}

export function mostrarSimulacao(resultado, rotulo, aoConfirmarEnvio) {
  const { erros, pendentes, jaExistentes } = resultado;
  const fechar = h('button', { class: 'botao' }, 'Fechar');
  const confirmacao = h('input', { class: 'entrada entrada--auto', id: 'confirmacao-envio', placeholder: 'digite ENVIAR', autocomplete: 'off' });
  const enviar = h('button', { class: 'botao botao--perigo', id: 'botao-confirmar-envio', disabled: true }, `Enviar ${pendentes.length} relatórios`);

  const conteudo = erros.length
    ? [h('h2', { class: 'cartao__titulo' }, 'Corrija antes de enviar'),
      h('ul', { class: 'lista-simples' }, erros.map(e => h('li', {}, `Linha ${e.linha} — ${e.nome}: ${e.erros.join('; ')}`)))]
    : [h('h2', { class: 'cartao__titulo' }, `Simulação de ${rotulo}`),
      h('div', { class: `aviso ${pendentes.length ? 'aviso--sucesso' : ''}` }, `${pendentes.length} relatórios prontos para enviar.`),
      jaExistentes.length ? h('div', { class: 'aviso aviso--alerta' }, `${jaExistentes.length} já existem no Hourglass e serão pulados: ${jaExistentes.join(', ')}`) : null,
      listaPendentes(pendentes)];

  const podeEnviar = !erros.length && pendentes.length > 0;
  const rodape = podeEnviar ? [h('span', { class: 'texto-suave' }, 'Para enviar de verdade, digite ENVIAR:'), confirmacao, fechar, enviar] : [fechar];
  const aberto = abrirDialogo(conteudo, rodape);

  fechar.addEventListener('click', aberto.fechar);
  confirmacao.addEventListener('input', () => { enviar.disabled = confirmacao.value.trim() !== 'ENVIAR'; });
  enviar.addEventListener('click', () => aoConfirmarEnvio(aberto));
}

export function mostrarProgresso({ dialogo, corpo, areaRodape }) {
  dialogo.addEventListener('cancel', evento => evento.preventDefault());
  const barra = h('div', { class: 'progresso__barra' });
  const contador = h('div', { class: 'texto-suave', id: 'progresso-contador' }, 'Iniciando…');
  const log = h('ul', { class: 'lista-simples', id: 'progresso-log' });
  substituir(corpo, h('h2', { class: 'cartao__titulo' }, 'Enviando ao Hourglass'), h('div', { class: 'progresso' }, barra), contador, log);
  substituir(areaRodape, h('span', { class: 'texto-suave' }, 'Não feche esta janela até terminar.'));

  return {
    progresso({ feitos, total, nome, ok, erro, jaExistia }) {
      barra.style.width = `${Math.round((feitos / total) * 100)}%`;
      contador.textContent = `${feitos} de ${total}`;
      log.prepend(h('li', { class: ok ? '' : 'celula-alertas__item--erro' }, jaExistia ? `↺ ${nome} — já estava no Hourglass` : ok ? `✔ ${nome}` : `✖ ${nome}: ${erro}`));
    },
    concluir({ enviados, falhas, jaExistiam }, aoFechar) {
      barra.style.width = '100%';
      contador.textContent = `Concluído: ${enviados} enviados${jaExistiam ? `, ${jaExistiam} já estavam no Hourglass` : ''}${falhas ? `, ${falhas} falharam` : ''}.`;
      const botao = h('button', { class: 'botao botao--primario', id: 'botao-ver-faltantes' }, 'Ver faltantes');
      botao.addEventListener('click', aoFechar);
      substituir(areaRodape, botao);
    },
  };
}
