// Local browser backup format. Never reads arbitrary keys or Vercel environment secrets.
const KEYS = new Set([
  'work-tools:notes', 'work-tools:notebook-v1', 'work-tools:commands-v1',
  'work-tools:shortcuts-v1', 'work-tools:network-targets-v1',
  'work-tools:personal-sessions', 'work-tools:translation-history',
  'work-tools:drawing', 'work-tools:dashboard-layout-v3',
  'work-tools:active-widgets-v1', 'work-tools:mobile-dashboard-layout-v2',
  'work-tools:mobile-active-widgets-v1', 'work-tools:time-alert-settings-v1',
]);
export const MAX_BACKUP_BYTES = 12_000_000;

export function isBackupKey(key) {
  return KEYS.has(key) || /^work-tools:drawing:[A-Za-z0-9:_-]{1,120}$/.test(key);
}
export function createDashBackup(storage) {
  const data = Object.create(null);
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!isBackupKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return { app: 'DashDash', version: 1, exportedAt: new Date().toISOString(), data };
}
export function parseDashBackup(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || parsed.app !== 'DashDash' || parsed.version !== 1
      || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new Error('קובץ גיבוי לא תקין או גרסה לא נתמכת.');
  }
  const rows = Object.entries(parsed.data);
  if (!rows.length || rows.length > 500) throw new Error('הגיבוי ריק או מכיל יותר מדי רשומות.');
  let total = 0;
  for (const [key, value] of rows) {
    if (!isBackupKey(key) || typeof value !== 'string') throw new Error('הגיבוי מכיל נתון לא נתמך: ' + key);
    total += key.length + value.length;
    if (total > MAX_BACKUP_BYTES) throw new Error('הקובץ גדול מדי.');
    try { JSON.parse(value); } catch { throw new Error('נתון פגום בגיבוי: ' + key); }
  }
  return Object.fromEntries(rows);
}
export function restoreDashBackup(storage, validatedData) {
  // Writes only validated, allowlisted keys and rolls them back on storage failures.
  const rows = Object.entries(validatedData);
  const previous = rows.map(([key]) => [key, storage.getItem(key)]);
  try {
    for (const [key, value] of rows) storage.setItem(key, value);
  } catch (error) {
    for (const [key, previousValue] of previous) {
      try {
        if (previousValue === null) storage.removeItem(key);
        else storage.setItem(key, previousValue);
      } catch { /* Storage quota/browser restrictions may also prevent rollback. */ }
    }
    throw new Error('השחזור נכשל. בדוק הרשאות ושטח אחסון בדפדפן.');
  }
  return rows.length;
}
