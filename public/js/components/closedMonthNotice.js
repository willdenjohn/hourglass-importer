import { h } from '../dom.js';
import { state, isMonthSubmitted } from '../state.js';
import { t } from '../i18n.js';

export function closedMonthNotice() {
  if (!isMonthSubmitted(state)) return null;
  return h('div', { class: 'notice notice--danger', id: 'submitted-month-notice' },
    h('strong', {}, `${t('closedMonth.title')} `),
    t('closedMonth.description'));
}
