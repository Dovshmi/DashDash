import { describe, expect, it, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { deflateRawSync } from 'node:zlib';
import {
  cleanText, columnIndex, columnName, dayFromText, findWeekMismatch,
  getScheduleEntries, guessMapping, pdfLinesFromItems, categoryForText,
  readScheduleExcel, weekFromText,
} from '../src/work-schedule-parser.js';

beforeAll(() => { globalThis.DOMParser = new JSDOM('').window.DOMParser; });

function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const bytes = Buffer.from(value);
    const compressed = deflateRawSync(bytes);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const common = {
  'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="שיבוצים" sheetId="1" r:id="rId1"/><sheet name="סידור שבועי" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>עובד</t></si><si><t>מנהל צוות</t></si><si><t>משמרת</t></si><si><t>יום</t></si><si><t>דנה</t></si><si><t>רותם</t></si><si><t>ראשון</t></si><si><t>שני</t></si></sst>',
  'xl/styles.xml': '<styleSheet><numFmts/><fills><fill><patternFill patternType="none"/></fill></fills><cellXfs><xf numFmtId="0" fillId="0"/><xf numFmtId="20" fillId="0"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" s="1"><v>0.375</v></c><c r="D2" t="s"><v>6</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>נועם</t></is></c><c r="B3" t="s"><v>5</v></c><c r="C3" t="str"><v>12:00-20:00</v></c><c r="D3" t="s"><v>7</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>עובד</t></is></c><c r="B1" t="s"><v>6</v></c><c r="C1" t="s"><v>7</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>דנה</t></is></c><c r="B2" t="str"><v>08:00-16:00</v></c><c r="C2" t="inlineStr"><is><t>חופש</t></is></c></row></sheetData></worksheet>',
};

describe('schedule parser', () => {
  it('reads every worksheet and preserves values, times and raw rows', async () => {
    const buffer = makeZip(common);
    const doc = await readScheduleExcel({ name: 'סידור עבודה - שבוע 47.2026.xlsx', arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) });
    expect(doc.week).toBe(47);
    expect(doc.sheets.map((s) => s.name)).toEqual(['שיבוצים', 'סידור שבועי']);
    expect(doc.sheets[0].rows).toHaveLength(3);
    expect(doc.sheets[0].rows[1].cells[2]).toBe('09:00');
    const entries = getScheduleEntries(doc.sheets[0]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({employee: 'דנה', manager: 'רותם', day: 'ראשון', shift: '09:00'});
    expect(entries[1].shift).toBe('12:00-20:00');
    expect(doc.cellCount).toBe(18);
  });
  it('recognizes days-as-columns without dropping day cells', async () => {
    const buffer = makeZip(common);
    const doc = await readScheduleExcel({ name: 'example.xlsx', arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) });
    const sheet = doc.sheets[1];
    expect(guessMapping(sheet).type).toBe('calendar');
    expect(getScheduleEntries(sheet).map((x) => x.day)).toEqual(['ראשון', 'שני']);
    expect(getScheduleEntries(sheet)[1].shift).toBe('חופש');
  });
  it('rejects protected enterprise workbooks without guessing', async () => {
    const bytes = new TextEncoder().encode('\u0000MSMAMARPCRYPT with protected bytes');
    await expect(readScheduleExcel({name:'private.xlsx',arrayBuffer:async()=>bytes.buffer})).rejects.toThrow(/הצפנה ארגונית/);
  });
  it('flags mismatched week numbers instead of joining unrelated documents', () => {
    expect(weekFromText('סידור עבודה לשבוע 45')).toBe(45);
    expect(findWeekMismatch(47,45)).toMatch(/לא מאותו שבוע/);
    expect(findWeekMismatch(47,47)).toBe('');
  });
  it('does not discard PDF lines that do not match categories', () => {
    const items = [
      { str:'החלפת תעודות דיגיטליות', transform:[1,0,0,1,310,600] },
      { str:'18:30-21:00', transform:[1,0,0,1,100,600] },
      { str:'טקסט בלתי מסווג', transform:[1,0,0,1,310,580] },
    ];
    const lines = pdfLinesFromItems(items,4);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toContain('18:30');
    expect(lines[0].category).toBe('עבודות ומיגרציות');
    expect(lines[1].category).toBe('מידע נוסף');
  });
  it('handles Hebrew/English day labels, letter index and key instructions', () => {
    expect(dayFromText('שלישי')).toBe('שלישי');
    expect(dayFromText('ראשון -01/11')).toBe('ראשון');
    expect(columnIndex('AA23')).toBe(26);
    expect(columnName(26)).toBe('AA');
    expect(cleanText('יום  \u200f ראשון')).toBe('יום ראשון');
    expect(categoryForText('חובה להגיע למוקד')).toBe('הודעות והנחיות');
  });
});
