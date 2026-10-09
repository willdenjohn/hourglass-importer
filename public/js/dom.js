import { currentLocale } from './i18n.js';

export function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key in element && typeof value !== 'string') element[key] = value;
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

export function replace(target, ...children) {
  target.replaceChildren(...children.flat(Infinity).filter(Boolean));
}

export function options(list, selected) {
  return list.map(([value, label]) => h('option', { value, selected: String(value) === String(selected ?? '') }, label));
}

export function notify(message, type = 'info') {
  const area = document.getElementById('toasts');
  const toast = h('div', { class: `toast${type === 'error' ? ' toast--error' : ''}`, role: 'status' }, message);
  area.append(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 8000 : 4000);
}

export function formatDate(date) {
  return new Date(date).toLocaleString(currentLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
}
