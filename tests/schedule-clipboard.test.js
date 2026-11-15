import { describe, expect, it } from 'vitest';
import { getScheduleEntries, guessMapping } from '../src/work-schedule-parser.js';
import { readScheduleClipboard, splitClipboardTable } from '../src/schedule-clipboard.js';

describe('Excel clipboard import', () => {
  it('preserves the Excel columns and recognizes a Hebrew shift calendar', () => {
    const text = 'מנהל צוות\tתפקיד\tשם\tיום א\tיום ב\r\n' +
      'דנה\tמוקד IP\tרותם\t08:00 - 16:30\tDay Off\r\n' +
      'דנה\tמוקד IP\tליאור\t09:30 - 18:00\t10:00 - 18:00\r\n';
    const result = readScheduleClipboard(text);
    expect(result.sourceType).toBe('clipboard');
    expect(result.cellCount).toBe(15);
    expect(result.sheets[0].rows[1].cells[0]).toBe('דנה');
    expect(result.sheets[0].rows[1].cells[3]).toBe('08:00 - 16:30');
    expect(guessMapping(result.sheets[0]).type).toBe('calendar');
    const entries = getScheduleEntries(result.sheets[0]);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ day: 'ראשון', shift: '08:00 - 16:30' });
    expect(entries[1]).toMatchObject({ day: 'שני', shift: 'Day Off' });
  });

  it('keeps blank columns and source row positions', () => {
    const result = readScheduleClipboard('עובד\t\tמשמרת\n\nמיכל\t\t07:00-15:00\n');
    const sheet = result.sheets[0];
    expect(sheet.rows.map((row) => row.number)).toEqual([1, 3]);
    expect(sheet.rows[1].cells).toEqual({ 0: 'מיכל', 2: '07:00-15:00' });
  });

  it('parses quoted Excel fields with tabs, line breaks and escaped quotes', () => {
    const data = 'שם\tהערה\n"דנה"\t"כותרת\nשנייה\tעם ""ציטוט"""\n';
    expect(splitClipboardTable(data)).toEqual([['שם', 'הערה'], ['דנה', 'כותרת\nשנייה\tעם "ציטוט"']]);
    expect(readScheduleClipboard(data).sheets[0].rows[1].cells[1]).toContain('ציטוט');
  });

  it('recognizes a week number when copied with the table', () => {
    const result = readScheduleClipboard('סידור עבודה - שבוע 47\tנציג\nיום ראשון\t08:00-16:00');
    expect(result.week).toBe(47);
  });

  it('rejects empty, invalid, and oversized clipboard data clearly', () => {
    expect(() => readScheduleClipboard('')).toThrow(/הלוח ריק/);
    expect(() => readScheduleClipboard('Some protected content')).toThrow(/טבלת Excel/);
    expect(() => readScheduleClipboard('א\tב\n"unclosed\tvalue')).toThrow(/מרכאות/);
    expect(() => readScheduleClipboard('a\t'.repeat(302) + '\n1\t2')).toThrow(/300 עמודות/);
  });
});
