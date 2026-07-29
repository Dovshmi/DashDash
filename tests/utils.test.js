import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatPersonalTotal,
  formatSessionDuration,
  keyboardTranslate,
  removeHistoryItem,
  toDateKey,
  totalPersonalMinutes,
} from '../src/utils.js';

describe('keyboardTranslate', () => {
  it('converts English keystrokes accidentally typed with a Hebrew layout intended', () => {
    expect(keyboardTranslate('tbh rumv kf,uc')).toBe('אני רוצה לכתוב');
  });

  it('converts Hebrew keystrokes accidentally typed with an English layout intended', () => {
    expect(keyboardTranslate('אני רוצה לכתוב')).toBe('tbh rumv kf,uc');
  });

  it('keeps numbers and punctuation that do not have a keyboard mapping', () => {
    expect(keyboardTranslate('tbh 123!')).toBe('אני 123!');
  });
});

describe('history helpers', () => {
  it('removes only the history item selected by its id', () => {
    const history = [{ id: 'first' }, { id: 'remove-me' }, { id: 'last' }];
    expect(removeHistoryItem(history, 'remove-me')).toEqual([{ id: 'first' }, { id: 'last' }]);
  });
});

describe('time helpers', () => {
  it('formats elapsed time as hours, minutes and seconds', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('calculates the duration of one personal-time session', () => {
    expect(formatSessionDuration({
      startedAt: '2026-07-29T08:00:00.000Z',
      endedAt: '2026-07-29T09:23:07.000Z',
    })).toBe('01:23:07');
  });

  it('uses a local calendar date as a stable key', () => {
    expect(toDateKey(new Date(2026, 6, 29, 12))).toBe('2026-07-29');
  });

  it('formats the personal-time daily total with minutes and seconds', () => {
    const sessions = [
      { startedAt: '2026-07-29T08:00:00.000Z', endedAt: '2026-07-29T08:45:00.000Z' },
      { startedAt: '2026-07-29T12:00:00.000Z', endedAt: '2026-07-29T12:15:30.000Z' },
    ];
    expect(formatPersonalTotal(sessions)).toBe('60:30');
  });

  it('totals completed personal-time sessions in minutes', () => {
    const sessions = [
      { startedAt: '2026-07-29T08:00:00.000Z', endedAt: '2026-07-29T08:45:00.000Z' },
      { startedAt: '2026-07-29T12:00:00.000Z', endedAt: '2026-07-29T12:15:30.000Z' },
    ];
    expect(totalPersonalMinutes(sessions)).toBe(61);
  });
});
