'use strict';

const xlsx = require('xlsx');

const COLUMNS = [['name', 34], ['participated', 24], ['studies', 16], ['auxiliaryPioneer', 17], ['hours', 8], ['credit', 16], ['notes', 36]];
const EXAMPLES = [
  ['template.example.publisher', true, 1, false, '', '', ''],
  ['template.example.inactive', false, '', false, '', '', ''],
  ['template.example.auxiliary', true, 2, true, 30, '', ''],
  ['template.example.regular', true, 1, false, 40, 15, 'template.example.creditNote'],
];
const INSTRUCTION_ROWS = ['name', 'participated', 'studies', 'auxiliaryPioneer', 'hours', 'credit', 'notes'];
const TIPS = ['template.tip.oneRow', 'template.tip.numbers', 'template.tip.duplicates', 'template.tip.otherColumns'];

function sheet(rows, widths) {
  const result = xlsx.utils.aoa_to_sheet(rows);
  result['!cols'] = widths.map(wch => ({ wch }));
  return result;
}

function exampleRow(t, [name, participated, studies, auxiliary, hours, credit, notes]) {
  const yesNo = value => t(value ? 'common.yes' : 'common.no');
  return [t(name), yesNo(participated), studies, yesNo(auxiliary), hours, credit, notes ? t(notes) : ''];
}

function instructions(t) {
  return [
    [t('template.instructions.column'), t('template.instructions.howTo'), t('template.instructions.required')],
    ...INSTRUCTION_ROWS.map(key => [t(`template.column.${key}`), t(`template.help.${key}`), t(`template.required.${key}`)]),
    [],
    [t('template.instructions.tips'), '', ''],
    ...TIPS.map(key => ['', t(key), '']),
  ];
}

function generateTemplate(t) {
  const book = xlsx.utils.book_new();
  const reports = sheet([COLUMNS.map(([key]) => t(`template.column.${key}`)), ...EXAMPLES.map(row => exampleRow(t, row))], COLUMNS.map(([, width]) => width));
  reports['!autofilter'] = { ref: reports['!ref'] };
  xlsx.utils.book_append_sheet(book, reports, t('template.sheet.reports'));
  xlsx.utils.book_append_sheet(book, sheet(instructions(t), [26, 100, 20]), t('template.sheet.instructions'));
  return xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
}

const templateColumns = t => COLUMNS.map(([key]) => t(`template.column.${key}`));

module.exports = { generateTemplate, templateColumns };
