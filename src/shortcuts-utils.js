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
