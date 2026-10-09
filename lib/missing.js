'use strict';

const xlsx = require('xlsx');
const { fullName } = require('./matching');

const NO_GROUP = '__none__';

function formatMonth(month) {
  const [year, number] = month.split('-');
  return `${number}/${year}`;
}

function describe(publisher, groups, months) {
  const group = groups.get(publisher?.group_id);
  return {
    group: group?.name ?? NO_GROUP,
    overseer: group?.overseer ?? '',
    name: publisher ? fullName(publisher) : '',
    status: publisher?.status ?? '',
    phone: publisher?.cellphone || publisher?.homephone || '',
    monthsMissing: months.length,
    months: months.map(formatMonth).join(', '),
  };
}

function mapGroups(groups, byId) {
  return new Map(groups.map(group => [group.id, { name: group.name, overseer: byId.get(group.overseer_id) ? fullName(byId.get(group.overseer_id)) : '' }]));
}

function sortByGroupAndName(list) {
  return list.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

async function collectMissing(client) {
  const [publishers, groups, missing, totals] = await Promise.all([
    client.publishers(), client.groups(), client.missingReports(), client.monthTotals(),
  ]);
  const byId = new Map(publishers.map(publisher => [publisher.id, publisher]));
  const groupMap = mapGroups(groups, byId);
  const inactive = new Set(totals.inactiveUserIds ?? []);
  const rows = missing.missing.map(entry => ({ id: entry.user.id, ...describe(byId.get(entry.user.id), groupMap, entry.months) }));

  return {
    month: totals.month,
    totals: {
      active: totals.userCount,
      submitted: (totals.enteredByAdminUserIds?.length ?? 0) + (totals.enteredBySelfUserIds?.length ?? 0),
      missing: totals.missingUserIds?.length ?? 0,
      inactive: inactive.size,
    },
    missing: sortByGroupAndName(rows.filter(row => !inactive.has(row.id))),
    inactive: sortByGroupAndName(rows.filter(row => inactive.has(row.id))),
  };
}

const groupLabel = (t, group) => (group === NO_GROUP ? t('missing.noGroup') : group);
const statusLabel = (t, status) => (status ? t(`registry.${status}`) : '');

function printMissing(t, { month, totals, missing, inactive }, write) {
  write(`\n═══ ${t('missing.title', { month: formatMonth(month) })} ═══`);
  write(t('missing.totalsLine', totals));
  let currentGroup;
  for (const row of missing) {
    if (row.group !== currentGroup) {
      currentGroup = row.group;
      write(`\n${groupLabel(t, row.group)}${row.overseer ? ` — ${t('missing.overseer', { name: row.overseer })}` : ''}`);
    }
    const late = row.monthsMissing > 1 ? ` — ${t('missing.lateMonths', { count: row.monthsMissing, months: row.months })}` : '';
    write(`  - ${row.name} (${statusLabel(t, row.status)})${row.phone ? ` — ${row.phone}` : ''}${late}`);
  }
  if (inactive.length) write(`\n${t('missing.inactiveLine', { names: inactive.map(row => row.name).join('; ') })}`);
}

function saveMissing(file, t, { missing, inactive }) {
  const columns = [['group', 12], ['overseer', 28], ['name', 38], ['status', 26], ['phone', 18], ['monthsMissing', 14], ['months', 60]];
  const value = (row, key) => (key === 'group' ? groupLabel(t, row.group) : key === 'status' ? statusLabel(t, row.status) : row[key]);
  const book = xlsx.utils.book_new();
  for (const [title, list] of [[t('missing.sheet.missing'), missing], [t('missing.sheet.inactive'), inactive]]) {
    const sheet = xlsx.utils.aoa_to_sheet([columns.map(([key]) => t(`missing.column.${key}`)), ...list.map(row => columns.map(([key]) => value(row, key)))]);
    sheet['!cols'] = columns.map(([, width]) => ({ wch: width }));
    xlsx.utils.book_append_sheet(book, sheet, title);
  }
  xlsx.writeFile(book, file);
}

function shareMessage(t, { month, missing }) {
  const groups = new Map();
  missing.forEach(row => groups.set(row.group, [...(groups.get(row.group) || []), row]));
  const blocks = [...groups.entries()].map(([group, members]) =>
    [`*${groupLabel(t, group)}*`, ...members.map(member => `• ${member.name}${member.monthsMissing > 1 ? ` (${t('missing.months', { count: member.monthsMissing })})` : ''}`)].join('\n'));
  return [
    t('message.greeting'),
    t('message.intro', { month: formatMonth(month), count: missing.length }),
    ...blocks,
    t('message.closing'),
  ].join('\n\n');
}

module.exports = { collectMissing, printMissing, saveMissing, shareMessage, formatMonth, NO_GROUP };
