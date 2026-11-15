import { activitiesForCell } from './schedule-mail-parser.js';

const LIMIT = 5;
const HOURS = /(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)/;

function timeOrder(value) {
  const match = String(value || '').match(HOURS);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Infinity;
}

/**
 * Preview only confirmed full-name matches and separately labeled anonymous
 * day-wide activities. Never treat assignments to other people as this
 * employee's work. More complete details stay in the click dialog.
 */
export function buildShiftHoverPreview({ mail, mailWeek, employee, day, dayLabel, shift }) {
  const state = mailWeek?.state || 'missing';
  const usableMail = Boolean(mail && state !== 'mismatch');
  const activities = usableMail ? activitiesForCell(mail, employee, day, state) : null;
  const entries = [
    ...(activities?.personal || []).map((event) => ({ ...event, assignment: 'personal' })),
    ...(activities?.dayGeneral || []).map((event) => ({ ...event, assignment: 'general' })),
  ].sort((a,b) => timeOrder(a.time) - timeOrder(b.time));
  return {
    employee: employee || 'עובד לא מזוהה',
    dayLabel: dayLabel || '',
    shift: shift || 'לא שובץ',
    mailState: state,
    hasMail: Boolean(mail),
    warning: state === 'mismatch' ? (mailWeek?.message || 'המייל שייך לשבוע אחר, ולא בוצע שיוך.') :
      state === 'unverified' ? 'התאמת השבוע בין האקסל למייל טרם אומתה.' : '',
    entries: entries.slice(0, LIMIT),
    overflow: Math.max(0, entries.length - LIMIT),
    count: activities?.personal.length || 0,
    generalCount: activities?.dayGeneral.length || 0,
  };
}

/** Places the fixed-position preview inside the viewport, above when needed. */
export function placeShiftHover(rect, viewport, entryCount = 0, overflow = 0) {
  const margin = 8, gap = 8;
  const width = Math.min(352, Math.max(0, viewport.width - 2 * margin));
  const height = Math.min(viewport.height - margin * 2, 158 + Math.min(entryCount, LIMIT) * 52 + (overflow ? 20 : 0));
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), viewport.width - width - margin);
  const below = rect.bottom + gap;
  const above = rect.top - height - gap;
  const top = below + height <= viewport.height - margin ? below :
    above >= margin ? above : Math.max(margin, Math.min(below, viewport.height - height - margin));
  return {left, top, width};
}
