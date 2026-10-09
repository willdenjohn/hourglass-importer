import { h, replace } from '../dom.js';
import { t, currentLocale } from '../i18n.js';

const toIndex = ({ month, year }) => year * 12 + (month - 1);
const fromIndex = value => ({ year: Math.floor(value / 12), month: (value % 12) + 1 });

function fromLabel(label) {
  if (!label) return null;
  const [year, month] = label.split('-').map(Number);
  return { year, month };
}

function monthText(month, format) {
  const text = new Date(2000, month - 1, 1).toLocaleDateString(currentLocale(), { month: format }).replace('.', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function createMonthPicker(target, onChoose) {
  let selected = null;
  let openMonth = null;
  let lastSubmitted = null;
  let visibleYear = new Date().getFullYear();
  let expanded = false;

  const allowed = period => !openMonth || toIndex(period) <= toIndex(openMonth);

  function choose(period) {
    if (!allowed(period)) return;
    expanded = false;
    selected = period;
    render();
    onChoose(period);
  }

  function move(step) {
    const next = fromIndex(toIndex(selected) + step);
    if (allowed(next)) choose(next);
  }

  function toggle() {
    expanded = !expanded;
    visibleYear = selected.year;
    render();
  }

  function monthButton(number) {
    const period = { year: visibleYear, month: number };
    const classes = ['month-picker__month'];
    if (selected && toIndex(period) === toIndex(selected)) classes.push('month-picker__month--selected');
    if (openMonth && toIndex(period) === toIndex(openMonth)) classes.push('month-picker__month--open');
    const submitted = lastSubmitted && toIndex(period) <= toIndex(lastSubmitted);
    if (submitted) classes.push('month-picker__month--submitted');
    return h('button', {
      class: classes.join(' '), type: 'button', role: 'gridcell',
      disabled: !allowed(period),
      'aria-label': `${monthText(number, 'long')} ${visibleYear}${submitted ? ` (${t('monthPicker.submitted')})` : ''}`,
      title: submitted ? t('monthPicker.submitted') : null,
      onClick: () => choose(period),
    }, monthText(number, 'short'));
  }

  function panel() {
    const nextYearBlocked = openMonth && visibleYear >= openMonth.year;
    return h('div', { class: 'month-picker__panel', role: 'dialog', 'aria-label': t('monthPicker.choose') },
      h('div', { class: 'month-picker__header' },
        h('button', { class: 'month-picker__arrow', type: 'button', 'aria-label': t('monthPicker.previousYear'), onClick: () => { visibleYear--; render(); } }, '‹'),
        h('strong', {}, visibleYear),
        h('button', { class: 'month-picker__arrow', type: 'button', 'aria-label': t('monthPicker.nextYear'), disabled: nextYearBlocked, onClick: () => { visibleYear++; render(); } }, '›')),
      h('div', { class: 'month-picker__grid', role: 'grid' }, Array.from({ length: 12 }, (_, i) => monthButton(i + 1))),
      openMonth ? h('div', { class: 'month-picker__footer' },
        h('div', {},
          h('span', { class: 'month-picker__legend' }, h('span', { class: 'month-picker__dot' }), t('monthPicker.openMonth')),
          lastSubmitted ? h('span', { class: 'month-picker__legend' }, h('span', { class: 'month-picker__strike' }), t('monthPicker.submitted')) : null),
        h('button', { class: 'button button--small', type: 'button', onClick: () => choose(openMonth) }, t('monthPicker.goToOpen'))) : null);
  }

  function render() {
    if (!selected) return;
    const isOpenMonth = openMonth && toIndex(selected) === toIndex(openMonth);
    replace(target,
      h('div', { class: 'month-picker' },
        h('button', { class: 'month-picker__arrow', type: 'button', 'aria-label': t('monthPicker.previousMonth'), onClick: () => move(-1) }, '‹'),
        h('button', { class: 'month-picker__current', type: 'button', id: 'period', 'aria-expanded': String(expanded), onClick: toggle },
          h('span', { class: 'month-picker__label' }, t('monthPicker.label')),
          h('span', { class: 'month-picker__value' }, `${monthText(selected.month, 'long')} ${selected.year}`,
            isOpenMonth ? h('span', { class: 'month-picker__dot', title: t('monthPicker.openMonth') }) : null)),
        h('button', { class: 'month-picker__arrow', type: 'button', 'aria-label': t('monthPicker.nextMonth'), disabled: !allowed(fromIndex(toIndex(selected) + 1)), onClick: () => move(1) }, '›'),
        expanded ? panel() : null));
  }

  document.addEventListener('click', event => {
    if (expanded && !event.composedPath().includes(target)) {
      expanded = false;
      render();
    }
  });
  document.addEventListener('keydown', event => {
    if (expanded && event.key === 'Escape') {
      expanded = false;
      render();
    }
  });

  return {
    set(period) {
      selected = { ...period };
      render();
    },
    setOpenMonth(label) {
      openMonth = fromLabel(label);
      render();
    },
    setLastSubmitted(label) {
      lastSubmitted = fromLabel(label);
      render();
    },
    render,
  };
}
