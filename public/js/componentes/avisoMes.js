import { h } from '../dom.js';
import { estado, mesJaEnviado } from '../estado.js';

export function avisoMesEnviado() {
  if (!mesJaEnviado(estado)) return null;
  return h('div', { class: 'aviso aviso--perigo', id: 'aviso-mes-enviado' },
    h('strong', {}, 'Este mês já foi enviado à filial pelo Hourglass. '),
    'Relatórios lançados agora entram como atrasados. Confira se escolheu o mês certo no calendário.');
}
