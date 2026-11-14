// A local-only reader: never uploads workbook content or retains it in browser storage.
// Imports every non-empty worksheet row; structured interpretation is optional and reversible.
const decoder = new TextDecoder();
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
const MAX_CELLS = 150000;

export function columnName(index) {
  let n = index + 1;
  let text = '';
  while (n > 0) {
    n -= 1;
    text = String.fromCharCode(65 + (n % 26)) + text;
    n = Math.floor(n / 26);
  }
  return text;
}

export function columnIndex(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return -1;
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

export function cleanText(value) {
  return String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function nodeText(parent, selector) {
  return [...(parent?.getElementsByTagName(selector) ?? [])].map((el) => el.textContent).join('');
}

function parseXml(bytes, path) {
  const document = new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('קובץ Excel מכיל XML לא תקין: ' + path);
  return document;
}

async function unzip(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length > MAX_ARCHIVE_BYTES) throw new Error('קובץ גדול מדי (מעל 40MB).');
  if (decoder.decode(data.subarray(0, 32)).includes('MSMAMARPCRYPT')) {
    throw new Error('קובץ ה-Excel מוגן באמצעות הצפנה ארגונית (Microsoft Purview / MIP). יש לייצא עותק שמותר לקרוא ללא ההצפנה; הכלי לא עוקף את ההגנה.');
  }
  const v = new DataView(buffer);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i -= 1) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('הקובץ אינו XLSX תקין או שהוא מוצפן. יש לבחור קובץ Excel פתוח בפורמט XLSX.');
  const count = v.getUint16(end + 10, true);
  let offset = v.getUint32(end + 16, true);
  if (count > 2000 || offset === 0xffffffff) throw new Error('מבנה ZIP לא נתמך.');
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    if (v.getUint32(offset, true) !== 0x02014b50) throw new Error('ארכיון Excel פגום.');
    const flags = v.getUint16(offset + 8, true);
    const method = v.getUint16(offset + 10, true);
    const compressedSize = v.getUint32(offset + 20, true);
    const uncompressedSize = v.getUint32(offset + 24, true);
    const nameLength = v.getUint16(offset + 28, true);
    const extraLength = v.getUint16(offset + 30, true);
    const commentLength = v.getUint16(offset + 32, true);
    const local = v.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name.startsWith('xl/') || name.endsWith('/')) continue;
    if (flags & 1) throw new Error('חלקי קובץ ה-Excel מוצפנים ואינם ניתנים לקריאה.');
    if (uncompressedSize > MAX_ENTRY_BYTES || compressedSize > MAX_ARCHIVE_BYTES) throw new Error('קובץ Excel גדול מדי לפענוח בדפדפן.');
    if (v.getUint32(local, true) !== 0x04034b50) throw new Error('רשומה פגומה בקובץ Excel.');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + compressedSize > data.length) throw new Error('נתוני ZIP לא שלמים.');
    const compressed = data.slice(start, start + compressedSize);
    let output;
    if (method === 0) output = compressed;
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('הדפדפן אינו תומך בפתיחת Excel. מומלץ להשתמש ב-Chrome או Edge מעודכן.');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('שיטת דחיסה לא נתמכת בקובץ Excel.');
    if (output.length !== uncompressedSize) throw new Error('גודל רשומת ZIP אינו תואם.');
    files.set(name, output);
  }
  return files;
}

function resolvePath(target) {
  const pieces = ('xl/' + String(target).replace(/^\/?xl\//, '')).split('/');
  const output = [];
  for (const p of pieces) {
    if (p === '..') output.pop();
    else if (p !== '.') output.push(p);
  }
  return output.join('/');
}

function isTimeFormat(format) {
  return /(?:h{1,2}\s*:\s*m{1,2}|h{1,2}\s*:\s*s{1,2})/i.test(format);
}
function isDateFormat(format) {
  return /(?:d{1,2}[\/\-.]m{1,2}|m{1,2}[\/\-.]d{1,2}|yyyy|dd\/mm)/i.test(format);
}
function formatExcelNumber(value, format, date1904) {
  if (!Number.isFinite(value)) return String(value);
  if (isTimeFormat(format) && !isDateFormat(format)) {
    const seconds = Math.round(((value % 1) + 1) % 1 * 86400) % 86400;
    return String(Math.floor(seconds / 3600)).padStart(2, '0') + ':' + String(Math.floor(seconds % 3600 / 60)).padStart(2, '0');
  }
  if (isDateFormat(format)) {
    const days = Math.floor(value);
    const base = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
    const date = new Date(base + days * 86400000);
    if (Number.isNaN(date.getTime())) return String(value);
    return String(date.getUTCDate()).padStart(2, '0') + '/' + String(date.getUTCMonth() + 1).padStart(2, '0') + '/' + date.getUTCFullYear();
  }
  return String(value);
}

function readStyles(files) {
  const bytes = files.get('xl/styles.xml');
  if (!bytes) return { formats: new Map(), colors: new Map() };
  const doc = parseXml(bytes, 'styles.xml');
  const nums = new Map([[14, 'mm/dd/yy'], [15, 'd-mmm-yy'], [20, 'h:mm'], [21, 'h:mm:ss'], [22, 'm/d/yy h:mm']]);
  for (const n of doc.getElementsByTagName('numFmt')) nums.set(Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode') || '');
  const fills = [...doc.getElementsByTagName('fills')[0]?.getElementsByTagName('fill') ?? []];
  const xs = [...doc.getElementsByTagName('cellXfs')[0]?.getElementsByTagName('xf') ?? []];
  const formats = new Map();
  const colors = new Map();
  xs.forEach((xf, i) => {
    formats.set(i, nums.get(Number(xf.getAttribute('numFmtId'))) || '');
    const fill = fills[Number(xf.getAttribute('fillId'))];
    const fg = fill?.getElementsByTagName('fgColor')[0];
    const rgb = fg?.getAttribute('rgb');
    const indexed = fg?.getAttribute('indexed');
    const indexedColors = { 2: '#ff0000', 3: '#00ff00', 4: '#0000ff', 5: '#ffff00', 6: '#ff00ff', 7: '#00ffff' };
    if (rgb && /^[\da-f]{8}$/i.test(rgb)) colors.set(i, '#' + rgb.slice(2));
    else if (indexed !== null && indexed !== undefined && indexedColors[Number(indexed)]) colors.set(i, indexedColors[Number(indexed)]);
  });
  return { formats, colors };
}

function getCellValue(cell, shared, style, date1904) {
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') return cleanText(nodeText(cell, 't'));
  const raw = cell.getElementsByTagName('v')[0]?.textContent;
  if (type === 's') return cleanText(shared[Number(raw)] ?? '');
  if (type === 'b') return raw === '1' ? 'כן' : 'לא';
  if (type === 'e') return 'שגיאה: ' + String(raw || '');
  if (type === 'str') return cleanText(raw);
  if (raw == null) {
    const formula = cell.getElementsByTagName('f')[0]?.textContent;
    return formula ? '[נוסחה ללא ערך מחושב: ' + formula + ']' : cleanText(nodeText(cell, 't'));
  }
  if (!isNaN(Number(raw))) return formatExcelNumber(Number(raw), style, date1904);
  return cleanText(raw);
}

function parseSheet(bytes, name, shared, styles, date1904) {
  const doc = parseXml(bytes, name);
  const rows = [];
  let cellCount = 0;
  const rowElements = [...doc.getElementsByTagName('sheetData')[0]?.getElementsByTagName('row') ?? []];
  for (const row of rowElements) {
    const cells = {};
    const colors = {};
    for (const cell of row.getElementsByTagName('c')) {
      const column = columnIndex(cell.getAttribute('r'));
      if (column < 0) continue;
      if (column >= 300) throw new Error('גיליון מכיל יותר מ-300 עמודות ולא ניתן לוודא שכל המידע נקלט.');
      const styleId = Number(cell.getAttribute('s') || 0);
      const value = getCellValue(cell, shared, styles.formats.get(styleId) || '', date1904);
      if (value !== '') {
        cells[column] = value;
        if (styles.colors.has(styleId)) colors[column] = styles.colors.get(styleId);
        cellCount += 1;
      }
      if (cellCount > MAX_CELLS) throw new Error('יותר מדי תאים בקובץ. יש לצמצם את הקובץ.');
    }
    if (Object.keys(cells).length) rows.push({ number: Number(row.getAttribute('r')) || rows.length + 1, cells, colors });
  }
  return { name, rows, cellCount, merges: [...doc.getElementsByTagName('mergeCell')].map((m) => m.getAttribute('ref')) };
}

export async function readScheduleExcel(file) {
  const files = await unzip(await file.arrayBuffer());
  if (!files.has('xl/workbook.xml')) throw new Error('חסר מידע על גיליונות ה-Excel בקובץ.');
  const book = parseXml(files.get('xl/workbook.xml'), 'workbook.xml');
  const relDoc = files.has('xl/_rels/workbook.xml.rels') ? parseXml(files.get('xl/_rels/workbook.xml.rels'), 'workbook relationships') : null;
  const relationships = new Map([...relDoc?.getElementsByTagName('Relationship') ?? []].map((r) => [r.getAttribute('Id'), resolvePath(r.getAttribute('Target'))]));
  const sharedDoc = files.has('xl/sharedStrings.xml') ? parseXml(files.get('xl/sharedStrings.xml'), 'sharedStrings.xml') : null;
  const shared = [...sharedDoc?.getElementsByTagName('si') ?? []].map((si) => nodeText(si, 't'));
  const styles = readStyles(files);
  const date1904 = book.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904') === '1';
  const sheets = [];
  for (const sheet of book.getElementsByTagName('sheet')) {
    const id = sheet.getAttribute('r:id') ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const path = relationships.get(id);
    if (!path || !files.has(path)) continue;
    sheets.push(parseSheet(files.get(path), sheet.getAttribute('name') || path, shared, styles, date1904));
  }
  if (!sheets.length) throw new Error('לא נמצאו גיליונות קריאים בקובץ Excel.');
  return { filename: file.name, sheets, week: weekFromText(file.name), cellCount: sheets.reduce((n, s) => n + s.cellCount, 0),
    unresolvedFormulas: sheets.reduce((n, sheet) => n + sheet.rows.reduce((count, row) => count + Object.values(row.cells).filter((value) => value.startsWith('[נוסחה ללא ערך מחושב:')).length, 0), 0) };
}

const DAY_TESTS = [
  /^(?:יום\s*)?(?:ראשון|א(?:['׳.]|$)|sunday|sun)$/i,
  /^(?:יום\s*)?(?:שני|ב(?:['׳.]|$)|monday|mon)$/i,
  /^(?:יום\s*)?(?:שלישי|ג(?:['׳.]|$)|tuesday|tue)$/i,
  /^(?:יום\s*)?(?:רביעי|ד(?:['׳.]|$)|wednesday|wed)$/i,
  /^(?:יום\s*)?(?:חמישי|ה(?:['׳.]|$)|thursday|thu)$/i,
  /^(?:יום\s*)?(?:שישי|ו(?:['׳.]|$)|friday|fri)$/i,
  /^(?:יום\s*)?(?:שבת|saturday|sat)$/i,
];
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export function dayFromText(value) {
  const text = cleanText(value);
  const simple = text.replace(/\s*[-–]?\s*\d{1,2}[.\/\-]\d{1,2}(?:[.\/\-]\d{2,4})?/, '').trim();
  const index = DAY_TESTS.findIndex((r) => r.test(simple));
  return index < 0 ? '' : DAY_NAMES[index];
}

export function guessMapping(sheet) {
  let best = null;
  for (const row of sheet.rows.slice(0, 20)) {
    const entries = Object.entries(row.cells);
    const days = entries.filter(([, text]) => dayFromText(text));
    if (days.length >= 2 && (!best || days.length > best.days.length)) best = { type: 'calendar', rowNumber: row.number, days: days.map(([col, text]) => [Number(col), dayFromText(text)]) };
  }
  if (best) return best;
  const nameRx = /(?:^|\s)(?:שם עובד|שם נציג|עובד|נציג|employee)(?:\s|$)/i;
  const teamRx = /(?:מנהל צוות|ראש צוות|מנהל ישיר|team lead|manager)/i;
  const shiftRx = /(?:משמרת|שעות עבודה|shift|שעות)/i;
  const dayRx = /(?:תאריך|יום|date|day)/i;
  for (const row of sheet.rows.slice(0, 25)) {
    const entries = Object.entries(row.cells);
    const mapping = {};
    for (const [index, value] of entries) {
      if (nameRx.test(value)) mapping.employee = Number(index);
      if (teamRx.test(value)) mapping.manager = Number(index);
      if (shiftRx.test(value)) mapping.shift = Number(index);
      if (dayRx.test(value)) mapping.day = Number(index);
    }
    if (mapping.employee !== undefined && (mapping.shift !== undefined || mapping.day !== undefined || mapping.manager !== undefined)) {
      return { type: 'table', rowNumber: row.number, ...mapping };
    }
  }
  return { type: 'raw', rowNumber: 0 };
}

// Deliberately keeps all source rows visible in the raw tab; these are only interpreted views.
export function getScheduleEntries(sheet, override = null) {
  const mapping = override || guessMapping(sheet);
  if (mapping.type === 'calendar') {
    return sheet.rows.filter((r) => r.number > mapping.rowNumber).flatMap((row) => {
      const label = Object.entries(row.cells).filter(([col]) => !mapping.days.some(([idx]) => idx === Number(col))).map(([, val]) => val).join(' · ');
      return mapping.days.filter(([col]) => row.cells[col]).map(([col, day]) => ({
        source: sheet.name + '!'+ columnName(col) + row.number, day, employee: label, manager: '', shift: row.cells[col], text: label + ' ' + row.cells[col],
      }));
    });
  }
  if (mapping.type === 'table') {
    return sheet.rows.filter((r) => r.number > mapping.rowNumber).map((row) => ({
      source: sheet.name + '!'+ row.number,
      employee: row.cells[mapping.employee] || '',
      manager: row.cells[mapping.manager] || '',
      shift: row.cells[mapping.shift] || '',
      day: dayFromText(row.cells[mapping.day]) || row.cells[mapping.day] || '',
      text: Object.values(row.cells).join(' · '),
    })).filter((r) => r.text.trim());
  }
  return sheet.rows.map((row) => ({
    source: sheet.name + '!'+ row.number,
    employee: '', manager: '', day: '', shift: '',
    text: Object.values(row.cells).join(' · '),
  }));
}

export function weekFromText(text) {
  const clean = cleanText(text);
  const match = clean.match(/(?:שבוע|week)\s*[:#-]?\s*(\d{1,2})\b/i);
  return match && Number(match[1]) >= 1 && Number(match[1]) <= 53 ? Number(match[1]) : null;
}
export function findWeekMismatch(excelWeek, pdfWeek) {
  return excelWeek && pdfWeek && excelWeek !== pdfWeek ? 'שימו לב: קובץ Excel הוא משבוע ' + excelWeek + ' וה-PDF משבוע ' + pdfWeek + '. הקבצים לא מאותו שבוע.' : '';
}

const CATEGORY_RULES = [
  ['הודעות והנחיות', /חובה|חשוב|הנחי|תדריך|תזכורת|אילוצים|מועד|מוקד|צהוב/],
  ['הדרכות וקורסים', /הדרכ|קורס|חניכ|לומדות|הכנות|חיזוקים|SDWAN|VPLS|BWIFI|BCAM/i],
  ['עבודות ומיגרציות', /מיגרצ|עבוד|התקנ|הפעל|שדרוג|בקשת|החלפת|תעודה|FW ACCESS|BCYBERNET/i],
  ['תורנויות ותפקידים', /תורנ|תגבור|מומח|משמרת|ניטור|SOC|VC|offline/i],
  ['היעדרויות', /חופשי|חופש|מילואים|העדר|מחוץ למוקד/],
];
export function categoryForText(text) {
  const value = cleanText(text);
  return CATEGORY_RULES.find(([, rx]) => rx.test(value))?.[0] || 'מידע נוסף';
}
export const PDF_CATEGORIES = ['הכול', ...CATEGORY_RULES.map(([name]) => name), 'מידע נוסף'];

export function pdfLinesFromItems(items, pageNumber) {
  const rows = [];
  for (const item of items) {
    const str = cleanText(item.str);
    if (!str) continue;
    const y = item.transform?.[5] ?? 0;
    const x = item.transform?.[4] ?? 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row, i) => {
    const text = row.parts.sort((a, b) => b.x - a.x).map((p) => p.str).join(' · ');
    return { id: pageNumber + ':' + i, page: pageNumber, text, category: categoryForText(text) };
  }).filter((r) => r.text);
}
