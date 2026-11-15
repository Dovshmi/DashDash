// Reads a table explicitly copied from Excel. Nothing is uploaded or persisted.
// Plain text is preferable to HTML because it preserves the logical cell order
// of RTL Excel worksheets, even when the visual layout runs right-to-left.
import { cleanText, weekFromText } from './work-schedule-parser.js';

const MAX_TEXT_LENGTH = 3_000_000;
const MAX_COLUMNS = 300;
const MAX_ROWS = 20_000;
const MAX_CELLS = 150_000;

// Excel copies cells as TSV. Quoted fields may contain tabs/newlines and
// doubled quotation marks, so a simple split('\n').split('\t') is unsafe.
export function splitClipboardTable(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('הלוח ריק. יש לבחור את כל הטבלה ב-Excel ולהעתיק עם Ctrl+C.');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error('הטבלה שהועתקה גדולה מדי. יש לבחור טווח מצומצם יותר.');
  }

  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let atStart = true;

  function addCell() {
    row.push(cell);
    if (row.length > MAX_COLUMNS) throw new Error('הטבלה מכילה יותר מ-300 עמודות.');
    cell = '';
    atStart = true;
  }
  function addRow() {
    addCell();
    rows.push(row);
    if (rows.length > MAX_ROWS) throw new Error('הטבלה מכילה יותר מדי שורות.');
    row = [];
  }

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atStart) { quoted = true; atStart = false; }
    else if (ch === '\t') addCell();
    else if (ch === '\n') addRow();
    else { cell += ch; atStart = false; }
  }
  if (quoted) throw new Error('הטבלה שהועתקה מכילה תא עם מרכאות לא סגורות.');
  if (cell || row.length) addRow(); // Ignore Excel's final line break.

  while (rows.length && rows[rows.length - 1].every((value) => !cleanText(value))) rows.pop();
  if (rows.length < 2 || !rows.some((r) => r.length >= 2)) {
    throw new Error('לא זוהתה טבלת Excel. יש להעתיק לפחות שתי שורות ושתי עמודות.');
  }
  return rows;
}

export function readScheduleClipboard(text) {
  const matrix = splitClipboardTable(text);
  const rows = [];
  let cellCount = 0;
  let gridCellCount = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    const cells = {};
    gridCellCount += matrix[i].length;
    if (gridCellCount > MAX_CELLS) throw new Error('הטבלה גדולה מדי (מעל 150,000 תאים).');
    matrix[i].forEach((value, col) => {
      const cleaned = cleanText(value);
      if (cleaned) { cells[col] = cleaned; cellCount += 1; }
    });
    if (Object.keys(cells).length) rows.push({ number: i + 1, cells, colors: {} });
  }
  if (!rows.length || !cellCount) throw new Error('לא נמצאו תאים עם מידע בלוח.');
  const sheet = { name: 'טבלה שהודבקה', rows, cellCount, merges: [] };
  return {
    filename: 'טבלה שהודבקה מהלוח',
    sourceType: 'clipboard',
    sheets: [sheet],
    cellCount,
    week: weekFromText(text.slice(0, 10000)),
    unresolvedFormulas: 0,
  };
}
