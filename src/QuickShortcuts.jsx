import { useEffect, useState } from 'react';
import { normalizeShortcutTarget, shortcutAction, SHORTCUT_KINDS } from './shortcuts-utils.js';

const KEY = 'work-tools:shortcuts-v1';
const EMPTY_DRAFT = { name: '', kind: 'url', url: '' };
const LABEL = { url: 'אתר', file: 'קובץ', folder: 'תיקייה' };
function readShortcuts() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(rows) ? rows
      .filter((item) => item && typeof item.id === 'string' && typeof item.url === 'string')
      .slice(0, 100)
      .map((item) => ({
        id: item.id,
        name: typeof item.name === 'string' ? item.name.slice(0, 100) : '',
        kind: SHORTCUT_KINDS.includes(item.kind) ? item.kind : 'url',
        url: item.url.slice(0, 2048),
      })) : [];
  } catch { return []; }
}
function defaultName(kind, target) {
  if (kind === 'url') return new URL(target).hostname;
  const segments = target.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || target;
}

export default function QuickShortcuts() {
  const [links, setLinks] = useState(readShortcuts);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [message, setMessage] = useState('');

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(links)); }
    catch { setMessage('לא ניתן לשמור קיצורים באחסון הדפדפן.'); }
  }, [links]);

  function edit(item) {
    setSelected(item.id);
    setDraft({ name: item.name, kind: item.kind, url: item.url });
    setMessage('');
  }
  function save(event) {
    event.preventDefault();
    try {
      const url = normalizeShortcutTarget(draft.kind, draft.url);
      const name = draft.name.trim().slice(0, 100) || defaultName(draft.kind, url);
      const next = { name, kind: draft.kind, url };
      if (selected) setLinks((current) =>
        current.map((link) => link.id === selected ? { ...link, ...next } : link));
      else {
        if (links.length >= 100) throw new Error('ניתן לשמור עד 100 קיצורים.');
        setLinks((current) => [...current, { id: crypto.randomUUID(), ...next }]);
      }
      setSelected(null);
      setDraft(EMPTY_DRAFT);
      setMessage(draft.kind === 'url' ? 'קישור האתר נשמר.' : 'נתיב ' + LABEL[draft.kind] + ' נשמר להעתקה בלבד.');
    } catch (error) { setMessage(error.message); }
  }
  function open(link) {
    if (shortcutAction(link.kind) !== 'open') return copy(link);
    try {
      const url = normalizeShortcutTarget('url', link.url);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      // With noopener, browsers may return null even when a tab opened.
      void opened;
      setMessage('');
    } catch (error) { setMessage(error.message); }
  }
  async function copy(link) {
    try {
      const text = normalizeShortcutTarget(link.kind, link.url);
      await navigator.clipboard.writeText(text);
      setMessage((link.kind === 'url' ? 'הקישור' : 'הנתיב') + ' הועתק ל־Clipboard.');
    } catch (error) {
      setMessage(error?.message || 'לא ניתן להעתיק. בדוק הרשאות Clipboard בדפדפן.');
    }
  }
  function remove(item) {
    if (!window.confirm('למחוק את הקיצור ' + item.name + '?')) return;
    setLinks((current) => current.filter((entry) => entry.id !== item.id));
    if (item.id === selected) { setSelected(null); setDraft(EMPTY_DRAFT); }
  }
  return <section className="card pocket-widget-card shortcuts-card">
    <div className="card-heading drag-handle">
      <div><p className="eyebrow">SHORTCUTS</p><h2>קיצורי דרך</h2></div>
    </div>
    <div className="shortcut-list">
      {links.length === 0 &&
        <p className="pocket-widget-hint">הוסף אתר לפתיחה, או נתיב קובץ / תיקייה להעתקה.</p>}
      {links.map((link) => <div className="shortcut-item" key={link.id}>
        <button className="shortcut-open" onClick={() => open(link)} type="button" title={link.url}
          aria-label={(link.kind === 'url' ? 'פתח ' : 'העתק נתיב ') + link.name}>
          <strong>{link.name} <span className="shortcut-kind">{LABEL[link.kind]}</span></strong>
          <small dir="ltr">{link.url}</small>
        </button>
        <button className="shortcut-icon-button" title={link.kind === 'url' ? 'העתק קישור' : 'העתק נתיב'}
          aria-label={'העתק ' + link.name} onClick={() => copy(link)} type="button">⧉</button>
        <button className="shortcut-icon-button" title="ערוך" aria-label={'ערוך ' + link.name}
          onClick={() => edit(link)} type="button">✎</button>
        <button className="shortcut-icon-button" title="מחק" aria-label={'מחק ' + link.name}
          onClick={() => remove(link)} type="button">×</button>
      </div>)}
    </div>
    <form className="shortcut-form" onSubmit={save}>
      <label className="pocket-widget-label">סוג קיצור
        <select value={draft.kind} aria-label="סוג קיצור" onChange={(e) =>
          setDraft((previous) => ({ ...previous, kind: e.target.value, url: '' }))}>
          <option value="url">אתר אינטרנט (פתיחה והעתקה)</option>
          <option value="file">קובץ מקומי (העתקת נתיב)</option>
          <option value="folder">תיקייה (העתקת נתיב)</option>
        </select>
      </label>
      <input value={draft.name} maxLength={100} onChange={(e) =>
        setDraft((previous) => ({ ...previous, name: e.target.value }))}
        placeholder="שם הקיצור" aria-label="שם הקיצור" />
      <input dir="ltr" value={draft.url} onChange={(e) =>
        setDraft((previous) => ({ ...previous, url: e.target.value }))}
        placeholder={draft.kind === 'url' ? 'https://example.com'
          : draft.kind === 'file' ? 'C:\\Work\\report.xlsx' : 'C:\\Work\\Projects'}
        aria-label={draft.kind === 'url' ? 'כתובת הקישור' : 'נתיב קובץ או תיקייה'} />
      {draft.kind !== 'url' && <p className="pocket-widget-hint">
        ב־Windows Explorer לחץ Shift + קליק ימני על קובץ/תיקייה ובחר ״העתק כנתיב״.
        הדבק כאן את הנתיב המלא. האתר שומר טקסט להעתקה בלבד ולא פותח קבצים או תיקיות במחשב.
      </p>}
      <div className="commands-actions">
        <button type="submit">{selected ? 'שמור שינויים' : '＋ הוסף קיצור'}</button>
        {selected && <button type="button" onClick={() => {
          setSelected(null); setDraft(EMPTY_DRAFT);
        }}>ביטול</button>}
      </div>
    </form>
    {message && <p className="pocket-widget-hint" role="status">{message}</p>}
    <p className="pocket-widget-hint">הקיצורים נשמרים רק בדפדפן שלך · פתיחה בלחיצה לאתרים בלבד · קבצים ותיקיות מועתקים כנתיבים</p>
  </section>;
}
