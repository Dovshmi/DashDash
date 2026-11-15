import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildScheduleGrid, filterScheduleGridRows, readableTextOnColor, scheduleCellKind } from '../src/schedule-grid.js';
import ScheduleWeekGrid from '../src/ScheduleWeekGrid.jsx';
import { guessMapping } from '../src/work-schedule-parser.js';
import { readScheduleClipboard } from '../src/schedule-clipboard.js';

const copied = [
  'מנהל צוות\tסקיל\tשם\tיום א -15/11\tיום ב -16/11\tיום ג -17/11\tיום ד -18/11\tיום ה -19/11\tיום ו -20/11\tשבת -21/11',
  'מנהל א\tמוקד IP\tעובד ראשון\t08:00 - 16:30\t09:30 - 18:00\tחופש\t07:00 - 15:30\t08:00 - 16:30\tDay Off\tDay Off',
  'מנהל ב\tSOC\tעובד שני\t23:00 - 07:00\tDay Off\tDay Off\t15:00 - 23:00\tDay Off\t08:00 - 16:30\tDay Off',
  'מנהל א\tמוקד IP\tעובד שלישי\t08:00 - 16:30\t08:00 - 16:30\t08:00 - 16:30\t08:00 - 16:30\t08:00 - 16:30\tDay Off\tDay Off',
].join('\r\n');

describe('Excel-style weekly schedule grid', () => {
  const worksheet = readScheduleClipboard(copied).sheets[0];
  const mapping = guessMapping(worksheet);
  const grid = buildScheduleGrid(worksheet, mapping);

  it('shows one row per employee with days in original column order', () => {
    expect(mapping.type).toBe('calendar');
    expect(grid.rows).toHaveLength(3);
    expect(grid.columns.map((col) => col.index)).toEqual([0,1,2,3,4,5,6,7,8,9]);
    expect(grid.columns.slice(0,3).map((col) => col.header)).toEqual(['מנהל צוות','סקיל','שם']);
    expect(grid.columns.slice(3).map((col) => col.day)).toEqual(['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']);
    expect(grid.rows[0]).toMatchObject({ manager:'מנהל א', role:'מוקד IP', employee:'עובד ראשון' });
    expect(grid.rows[0].cells[8]).toBe('Day Off');
    expect(grid.rows[1].cells[3]).toBe('23:00 - 07:00');
  });

  it('filters team lead, role, employee and free-text without expanding into daily rows', () => {
    expect(filterScheduleGridRows(grid.rows,{ manager:'מנהל א' })).toHaveLength(2);
    expect(filterScheduleGridRows(grid.rows,{ role:'SOC' })).toHaveLength(1);
    expect(filterScheduleGridRows(grid.rows,{ employee:'עובד שלישי' })).toHaveLength(1);
    expect(filterScheduleGridRows(grid.rows,{ manager:'מנהל א', query:'07:00' })).toHaveLength(1);
  });

  it('categorizes shifts, off days and notes consistently', () => {
    expect(scheduleCellKind('23:00 - 07:00')).toBe('shift');
    expect(scheduleCellKind('Day Off')).toBe('off');
    expect(scheduleCellKind('חופש')).toBe('off');
    expect(scheduleCellKind('הדרכה')).toBe('other');
    expect(readableTextOnColor('#ffff00')).toBe('#15243a');
    expect(readableTextOnColor('#112233')).toBe('#f8fafc');
  });

  it('renders a Hebrew weekly grid instead of repeated rows per shift', () => {
    const html = renderToStaticMarkup(<ScheduleWeekGrid sheet={worksheet} mapping={mapping} query="" setQuery={() => {}} />);
    expect(html).toContain('סידור שבועי');
    expect(html).toContain('פתח במסך מלא');
    expect(html).toContain('מוקד IP');
    expect(html).toContain('08:00 - 16:30');
    expect(html).toContain('Day Off');
    expect((html.match(/<tr>/g) || []).length).toBe(4); // header + 3 employees
  });

  it('retains original spreadsheet row numbers even when there are gaps', () => {
    const separate = { ...worksheet, rows: worksheet.rows.map((row,i) => ({ ...row, number: i === 0 ? 2 : 12 + i })) };
    const mapped = guessMapping(separate);
    expect(buildScheduleGrid(separate, mapped).rows.map((row) => row.number)).toEqual([13,14,15]);
  });
});
