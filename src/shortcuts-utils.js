export const SHORTCUT_KINDS = Object.freeze(['url', 'file', 'folder']);

export function normalizeShortcutUrl(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) {
    throw new Error('יש להזין כתובת אתר תקינה.');
  }
  const value = input.trim();
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : 'https://' + value;
  let url;
  try { url = new URL(normalized); }
  catch { throw new Error('כתובת אתר לא תקינה.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('מותר לשמור רק קישורי HTTP/HTTPS ללא פרטי התחברות.');
  }
  return url.href;
}

// Browsers cannot open a saved local path through Windows Explorer.
// We store only the user-supplied path string for explicit copying.
export function normalizeShortcutPath(input) {
  if (typeof input !== 'string') throw new Error('יש להזין נתיב לקובץ או לתיקייה.');
  const value = input.trim().replace(/^"([\s\S]*)"$/, '$1').trim();
  if (!value || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('נתיב הקובץ או התיקייה אינו תקין.');
  }
  const windowsPath = /^[a-zA-Z]:[\\/]/.test(value);
  const networkPath = /^\\\\[^\\/\s]+\\[^\\/\s]+/.test(value);
  const posixPath = value.startsWith('/') && !value.startsWith('//');
  if (!windowsPath && !networkPath && !posixPath) {
    throw new Error('יש להזין נתיב מלא, למשל C:\\Work\\report.xlsx או \\\\server\\share.');
  }
  return value;
}
export function normalizeShortcutTarget(kind, input) {
  if (kind === 'url') return normalizeShortcutUrl(input);
  if (kind === 'file' || kind === 'folder') return normalizeShortcutPath(input);
  throw new Error('סוג קיצור דרך לא נתמך.');
}
export function shortcutAction(kind) {
  return kind === 'url' ? 'open' : 'copy';
}
