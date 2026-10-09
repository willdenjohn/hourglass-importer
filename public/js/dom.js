export function h(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave.startsWith('on')) elemento.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (chave === 'class') elemento.className = valor;
    else if (chave === 'dataset') Object.assign(elemento.dataset, valor);
    else if (chave in elemento && typeof valor !== 'string') elemento[chave] = valor;
    else elemento.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue;
    elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return elemento;
}

export function substituir(alvo, ...filhos) {
  alvo.replaceChildren(...filhos.flat(Infinity).filter(Boolean));
}

export function opcoes(lista, selecionado) {
  return lista.map(([valor, rotulo]) => h('option', { value: valor, selected: String(valor) === String(selecionado ?? '') }, rotulo));
}

export function notificar(mensagem, tipo = 'info') {
  const area = document.getElementById('notificacoes');
  const aviso = h('div', { class: `notificacao${tipo === 'erro' ? ' notificacao--erro' : ''}`, role: 'status' }, mensagem);
  area.append(aviso);
  setTimeout(() => aviso.remove(), tipo === 'erro' ? 8000 : 4000);
}

export function formatarData(data) {
  return new Date(data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
