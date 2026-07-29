import { describe, expect, it } from 'vitest';
import {
  createDefaultDashboardLayout,
  isValidEmail,
  formatAlertDuration,
  parseAlertDuration,
  shouldSendPersonalTimeAlert,
  formatDuration,
  formatPersonalTotal,
  formatSessionDuration,
  keyboardTranslate,
  normalizeDashboardLayout,
  normalizeWidgetIds,
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

describe('dashboard layout helpers', () => {
  it('restores only valid saved positions and keeps every dashboard panel', () => {
    const defaults = [
      { i: 'translate', x: 0, y: 0, w: 6, h: 8, minW: 3 },
      { i: 'timer', x: 6, y: 0, w: 6, h: 8, minW: 3 },
    ];
    const saved = [
      { i: 'translate', x: 3, y: 4, w: 7, h: 10 },
      { i: 'unknown', x: 0, y: 0, w: 1, h: 1 },
      { i: 'timer', x: 'bad', y: 0, w: 6, h: 8 },
    ];
    expect(normalizeDashboardLayout(saved, defaults)).toEqual([
      { i: 'translate', x: 3, y: 4, w: 7, h: 10, minW: 3 },
      { i: 'timer', x: 6, y: 0, w: 6, h: 8, minW: 3 },
    ]);
  });

  it('restores saved layouts for added widgets instead of falling back to tiny auto-layouts', () => {
    const defaults = [{ i: 'notes', x: 0, y: 0, w: 12, h: 9, minW: 4, minH: 6 }];
    const saved = [{ i: 'notes:extra', x: 2, y: 13, w: 1, h: 1 }];
    expect(normalizeDashboardLayout(saved, defaults, ['notes', 'notes:extra'])).toEqual([
      { i: 'notes', x: 0, y: 0, w: 12, h: 9, minW: 4, minH: 6 },
      { i: 'notes:extra', x: 2, y: 13, w: 4, h: 6, minW: 4, minH: 6 },
    ]);
  });

  it('resets primary windows to the requested defaults and places added pages below them', () => {
    const templates = [
      { i: 'timer', x: 0, y: 0, w: 6, h: 11 },
      { i: 'translate', x: 6, y: 0, w: 6, h: 11 },
      { i: 'notes', x: 0, y: 11, w: 6, h: 14 },
      { i: 'drawing', x: 6, y: 11, w: 6, h: 14 },
    ];
    expect(createDefaultDashboardLayout(['timer', 'translate', 'notes', 'drawing', 'notes:extra'], templates)).toEqual([
      ...templates,
      { i: 'notes:extra', x: 0, y: 25, w: 6, h: 14 },
    ]);
  });

  it('builds a one-column mobile reset with only the requested tools in order', () => {
    const templates = [
      { i: 'timer', x: 0, y: 0, w: 1, h: 11 },
      { i: 'notes', x: 0, y: 11, w: 1, h: 14 },
      { i: 'drawing', x: 0, y: 25, w: 1, h: 14 },
      { i: 'translate', x: 0, y: 39, w: 1, h: 11 },
    ];
    expect(createDefaultDashboardLayout(['timer', 'notes', 'drawing'], templates)).toEqual(templates.slice(0, 3));
  });

  it('keeps only known widget ids and allows unique instances of repeatable tools', () => {
    expect(normalizeWidgetIds(['timer', 'notes:one', 'unknown', 'notes:one', 'drawing:two'], ['translate', 'timer', 'notes', 'drawing']))
      .toEqual(['timer', 'notes:one', 'drawing:two']);
  });
});

describe('history helpers', () => {
  it('removes only the history item selected by its id', () => {
    const history = [{ id: 'first' }, { id: 'remove-me' }, { id: 'last' }];
    expect(removeHistoryItem(history, 'remove-me')).toEqual([{ id: 'first' }, { id: 'last' }]);
  });
});

describe('personal-time email alerts', () => {
  it('accepts a basic recipient email and rejects malformed values', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('parses and formats the selected alert threshold as minutes and seconds', () => {
    expect(parseAlertDuration('01:30')).toBe(90);
    expect(parseAlertDuration('10:75')).toBeNull();
    expect(formatAlertDuration(90)).toBe('01:30');
  });

  it('sends once when the running timer reaches the selected time threshold', () => {
    expect(shouldSendPersonalTimeAlert({
      elapsedMilliseconds: 90_000,
      thresholdSeconds: 90,
      recipientEmail: 'user@example.com',
      alreadySent: false,
    })).toBe(true);
    expect(shouldSendPersonalTimeAlert({
      elapsedMilliseconds: 91_000,
      thresholdSeconds: 90,
      recipientEmail: 'user@example.com',
      alreadySent: true,
    })).toBe(false);
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
