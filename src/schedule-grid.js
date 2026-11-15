import { cleanText, columnName } from './work-schedule-parser.js';

// Keeps the original row and column positions. Each employee appears once with
// the complete week beside them, even when a day is blank or marked Day Off.
export function buildScheduleGrid(sheet, mapping) {
  if (!sheet || mapping?.type !== 'calendar') return null;
  const heading = sheet.rows.find((row) => row.number === mapping.rowNumber);
  const days = new Map(mapping.days);
  const headerEntries = Object.entries(heading?.cells || {});
  const findHeading = (rx) => {
    const hit = headerEntries.find(([, value]) => rx.test(cleanText(value)));
    return hit ? Number(hit[0]) : undefined;
  };
  const employee = Number.isInteger(mapping.employee) ? mapping.employee :
    findHeading(/^(?:שם|שם עובד|שם העובד|שם נציג|עובד|נציג|employee)$/i);
  const manager = Number.isInteger(mapping.manager) ? mapping.manager :
    findHeading(/^(?:מנהל צוות|ראש צוות|מנהל ישיר|team lead|manager)$/i);
  const role = findHeading(/^(?:סקיל|תפקיד|תחום|מקצוע|skill|role|department)$/i);

  const allRows = sheet.rows.filter((row) => row.number > mapping.rowNumber);
  const present = new Set([...Object.keys(heading?.cells || {}), ...allRows.flatMap((row) => Object.keys(row.cells))].map(Number));
  const sorted = [...present].filter((index) => Number.isInteger(index) && index >= 0 && index < 300).sort((a, b) => a - b);
  const columns = sorted.map((index) => ({
    index, header: heading?.cells[index] || columnName(index),
    day: days.get(index) || '',
    field: index === employee ? 'employee' : index === manager ? 'manager' : index === role ? 'role' : '',
    width: days.has(index) ? 122 : index === employee ? 176 : index === manager ? 122 : 116,
  }));
  const rows = allRows.filter((row) => Object.keys(row.cells).length > 0).map((row) => ({
    ...row,
    employee: employee === undefined ? '' : (row.cells[employee] || ''),
    manager: manager === undefined ? '' : (row.cells[manager] || ''),
    role: role === undefined ? '' : (row.cells[role] || ''),
    searchText: Object.values(row.cells).join(' '),
  }));
  return { columns, rows, employee, manager, role };
}

export function filterScheduleGridRows(rows, { employee = '', manager = '', role = '', query = '' } = {}) {
  const includes = (value, wanted) => !wanted || cleanText(value).toLocaleLowerCase().includes(cleanText(wanted).toLocaleLowerCase());
  return rows.filter((row) =>
    (!employee || row.employee === employee) &&
    (!manager || row.manager === manager) &&
    (!role || row.role === role) &&
    includes(row.searchText, query)
  );
}

export function scheduleCellKind(value) {
  const text = cleanText(value);
  if (!text) return 'empty';
  if (/^(?:day off|off|יום חופשי|לא עובד|חופש|חופשה|מחלה|מילואים|היעדרות|העדרות)$/i.test(text)) return 'off';
  if (/(?:^|[^\d])(?:[01]?\d|2[0-3]):[0-5]\d/.test(text)) return 'shift';
  if (/^(?:בבית|עבודה מהבית|הדרכה|לימודים|השתלמות)$/i.test(text)) return 'other';
  return 'other';
}

export function readableTextOnColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '#1f2937';
  const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.28 ? '#15243a' : '#f8fafc';
}
