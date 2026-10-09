const listeners = new Set();

export const state = {
  period: defaultPeriod(),
  session: null,
  publishers: [],
  items: [],
  withoutAnswer: [],
  extension: { present: false, active: false },
  syncingExtension: false,
  extensionResult: null,
};

function defaultPeriod() {
  const today = new Date();
  const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { month: previous.getMonth() + 1, year: previous.getFullYear() };
}

export function update(partial) {
  Object.assign(state, partial);
  listeners.forEach(listener => listener(state, partial));
}

export function observe(listener) {
  listeners.add(listener);
}

export const STATUSES = ['send', 'review', 'not_found', 'already_sent', 'ignore'];
export const PIONEERS = ['Regular', 'Auxiliary', 'Special'];
export const MONTHLY_LIMIT_WITH_CREDIT = 55;

export function isMonthSubmitted({ period, session }) {
  const last = session?.account?.lastSubmittedMonth;
  if (!last) return false;
  const [year, month] = last.split('-').map(Number);
  return period.year * 12 + period.month <= year * 12 + month;
}
