import { useEffect, useState } from 'react';
import { normalizeShortcutTarget, shortcutAction, SHORTCUT_KINDS } from './shortcuts-utils.js';
import {
  deleteLocalShortcut, listLocalShortcuts, readDirectoryEntries, saveLocalShortcut,
  supportsLocalFilePicker, supportsLocalFolderPicker, validatePreviewFile,
  verifyReadPermission, MAX_LOCAL_SHORTCUTS,
} from './local-shortcut-files.js';

const KEY = 'work-tools:shortcuts-v1';
const EMPTY_DRAFT = { name: '', kind: 'url', url: '' };
const LABEL = { url: 'אתר', file: 'קובץ', folder: 'תיקייה' };
const FILE_NOTE = 'האתר לא מקבל נתיב מלא מהדפדפן עבור קובץ שנבחר, ולכן ניתן להעתיק רק את שם הקובץ.';

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
function errorText(error, fallback) {
  if (error?.name === 'AbortError') return 'בחירת הקובץ או התיקייה בוטלה.';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'הדפדפן לא נתן הרשאת קריאה. בחר "אפשר" בחלונית ההרשאות ונסה שוב.';
  }
  if (error?.name === 'NotFoundError') {
    return 'הקובץ או התיקייה אינם זמינים. ייתכן ששמם או מיקומם השתנו; בחר אותם מחדש.';
  }
  return error?.message || fallback;
}

export default function QuickShortcuts() {
  const [links, setLinks] = useState(readShortcuts);
  const [localLinks, setLocalLinks] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [rename, setRename] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [folderView, setFolderView] = useState(null);
  const [message, setMessage] = useState('');

  const fileSupported = supportsLocalFilePicker();
  const folderSupported = supportsLocalFolderPicker();

  useEffect(() => {
    let active = true;
    listLocalShortcuts()
      .then((saved) => { if (active) setLocalLinks(saved); })
      .catch((error) => { if (active) setMessage(errorText(error, 'לא ניתן לקרוא קיצורי קבצים מקומיים.')); })
      .finally(() => { if (active) setLocalLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(links)); }
    catch { setMessage('לא ניתן לשמור קיצורים באחסון הדפדפן.'); }
  }, [links]);
  useEffect(() => () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
  }, [viewer]);

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
        if (links.length + localLinks.length >= MAX_LOCAL_SHORTCUTS) {
          throw new Error('ניתן לשמור עד ' + MAX_LOCAL_SHORTCUTS + ' קיצורים.');
        }
        setLinks((current) => [...current, { id: crypto.randomUUID(), ...next }]);
      }
      setSelected(null);
      setDraft(EMPTY_DRAFT);
      setMessage(draft.kind === 'url' ? 'קישור האתר נשמר.' : 'נתיב ' + LABEL[draft.kind] + ' נשמר להעתקה בלבד.');
    } catch (error) { setMessage(errorText(error, 'לא ניתן לשמור את הקיצור.')); }
  }
  function open(link) {
    if (shortcutAction(link.kind) !== 'open') return copy(link);
    try {
      window.open(normalizeShortcutTarget('url', link.url), '_blank', 'noopener,noreferrer');
      setMessage('');
    } catch (error) { setMessage(errorText(error, 'לא ניתן לפתוח קישור.')); }
  }
  async function copyText(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(what + ' הועתק ל־Clipboard.');
    } catch (error) { setMessage(errorText(error, 'לא ניתן להעתיק. בדוק הרשאות Clipboard.')); }
  }
  function copy(link) {
    try {
      return copyText(normalizeShortcutTarget(link.kind, link.url),
        link.kind === 'url' ? 'הקישור' : 'הנתיב');
    } catch (error) { setMessage(errorText(error, 'ההעתקה נכשלה.')); }
  }
  function remove(item) {
    if (!window.confirm('למחוק את הקיצור ' + item.name + '?')) return;
    setLinks((current) => current.filter((entry) => entry.id !== item.id));
    if (item.id === selected) { setSelected(null); setDraft(EMPTY_DRAFT); }
  }

  async function rememberHandle(handle) {
    if (!handle || !['file', 'directory'].includes(handle.kind)) {
      throw new Error('בחר קובץ או תיקייה תקינים.');
    }
    if (links.length + localLinks.length >= MAX_LOCAL_SHORTCUTS) {
      throw new Error('ניתן לשמור עד ' + MAX_LOCAL_SHORTCUTS + ' קיצורים.');
    }
    const entry = {
      id: 'handle:' + crypto.randomUUID(),
      kind: handle.kind,
      name: String(handle.name || 'פריט מקומי').slice(0, 100),
      handle,
    };
    await saveLocalShortcut(entry);
    setLocalLinks((current) => [...current,entry].sort((a,b) => a.name.localeCompare(b.name,'he')));
    setMessage('נשמר ' + (handle.kind === 'directory' ? 'קיצור לתיקייה' : 'קיצור לקובץ') +
      ' ב־IndexedDB במחשב הזה. לא הועלו קבצים לאתר.');
  }
  async function pickLocal(kind) {
    // Picker invocation must be the first async browser operation from the click.
    try {
      if (kind === 'file') {
        if (!fileSupported) throw new Error('בחירת קובץ אינה נתמכת בדפדפן הזה. השתמש ב־Chrome או Edge.');
        const picked = await window.showOpenFilePicker({ multiple: false });
        if (picked?.[0]) await rememberHandle(picked[0]);
      } else {
        if (!folderSupported) throw new Error('בחירת תיקייה אינה נתמכת בדפדפן הזה. השתמש ב־Chrome או Edge.');
        const handle = await window.showDirectoryPicker({mode:'read'});
        if (handle) await rememberHandle(handle);
      }
    } catch (error) { setMessage(errorText(error, 'לא ניתן לשמור קובץ מקומי.')); }
  }
  async function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const items = [...(event.dataTransfer?.items || [])].filter((item) => item.kind === 'file');
    if (items.length !== 1 || typeof items[0].getAsFileSystemHandle !== 'function') {
      setMessage('גרירה נתמכת עבור פריט אחד ב־Chrome/Edge. אפשר גם להשתמש בכפתורי הבחירה.');
      return;
    }
    try {
      const handle = await items[0].getAsFileSystemHandle();
      if (handle) await rememberHandle(handle);
    } catch (error) { setMessage(errorText(error, 'לא ניתן להוסיף את הפריט שנגרר.')); }
  }
  async function renameLocal(event) {
    event.preventDefault();
    if (!rename) return;
    const original = localLinks.find((entry) => entry.id === rename.id);
    if (!original) return;
    const name = rename.name.trim();
    if (!name || name.length > 100) { setMessage('שם קיצור חייב להכיל 1–100 תווים.'); return; }
    try {
      const updated = {...original,name};
      await saveLocalShortcut(updated);
      setLocalLinks((current) => current.map((entry) => entry.id === original.id ? updated : entry));
      setRename(null); setMessage('שם הקיצור עודכן.');
    } catch (error) { setMessage(errorText(error, 'לא ניתן לשנות את שם הקיצור.')); }
  }
  async function removeLocal(item) {
    if (!window.confirm('למחוק את הקיצור ' + item.name + '? הקובץ או התיקייה עצמם לא יימחקו.')) return;
    try {
      await deleteLocalShortcut(item.id);
      setLocalLinks((current) => current.filter((entry) => entry.id !== item.id));
      setRename(null); setViewer(null); setFolderView(null);
      setMessage('הקיצור הוסר. לא בוצע שינוי בקבצים במחשב.');
    } catch (error) { setMessage(errorText(error, 'לא ניתן למחוק את הקיצור.')); }
  }
  async function previewFile(handle) {
    try {
      if (!(await verifyReadPermission(handle))) throw new Error('הרשאת הקריאה לא אושרה.');
      const file = await handle.getFile();
      const kind = validatePreviewFile(file);
      if (kind === 'text') {
        const content = await file.text();
        setViewer({name:file.name,kind,content});
      } else {
        // The object URL is local to this browser; no network request/uploads.
        const url = URL.createObjectURL(file);
        setViewer({name:file.name,kind,url});
      }
      setMessage('');
    } catch (error) { setMessage(errorText(error, 'לא ניתן להציג את הקובץ.')); }
  }
  async function browseFolder(handle, breadcrumb = []) {
    try {
      if (!(await verifyReadPermission(handle))) throw new Error('הרשאת הקריאה לא אושרה.');
      const listing = await readDirectoryEntries(handle);
      setFolderView({breadcrumb:[...breadcrumb,{handle,name:handle.name}], ...listing});
      setViewer(null);
      setMessage('');
    } catch (error) { setMessage(errorText(error, 'לא ניתן לפתוח את התיקייה.')); }
  }
  function openLocal(entry) {
    if (entry.kind === 'file') {
      setFolderView(null);
      return previewFile(entry.handle);
    }
    return browseFolder(entry.handle);
  }
  function openFolderEntry(entry) {
    if (entry.kind === 'file') return previewFile(entry.handle);
    return browseFolder(entry.handle,folderView?.breadcrumb || []);
  }
  function folderBack() {
    if (!folderView) return;
    if (folderView.breadcrumb.length <= 1) { setFolderView(null); return; }
    const parent = folderView.breadcrumb.at(-2);
    browseFolder(parent.handle,folderView.breadcrumb.slice(0,-2));
  }
  function closeViewer() { setViewer(null); setFolderView(null); }

  return <section className="card pocket-widget-card shortcuts-card">
    <div className="card-heading drag-handle">
      <div><p className="eyebrow">SHORTCUTS · PWA</p><h2>קיצורי דרך</h2></div>
    </div>
    <div className="commands-actions shortcut-picker-actions">
      <button type="button" onClick={() => pickLocal('file')} disabled={!fileSupported}>＋ בחר קובץ</button>
      <button type="button" onClick={() => pickLocal('directory')} disabled={!folderSupported}>＋ בחר תיקייה</button>
    </div>
    {!fileSupported || !folderSupported ? <p className="pocket-widget-hint">
      בחירת קבצים ותיקיות דורשת Chrome או Edge מעודכנים ב־HTTPS. שמירת נתיבים להעתקה עדיין זמינה.
    </p> : <p className="pocket-widget-hint">
      בחר פריט פעם אחת כדי לשמור גישה מקומית. פתיחה חוזרת עשויה לבקש הרשאה; פרטי הקובץ לא נשלחים לשרת.
    </p>}
    <div className="shortcut-local-drop" onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop} role="group" aria-label="גרור קובץ או תיקייה">
      גרור לכאן קובץ או תיקייה מ־Explorer, או השתמש בכפתורי הבחירה
    </div>
    <div className="shortcut-list">
      {!links.length && !localLinks.length && !localLoading &&
        <p className="pocket-widget-hint">אין עדיין קיצורים. הוסף אתר, נתיב להעתקה או קובץ/תיקייה עם הרשאה.</p>}
      {links.map((link) => <div className="shortcut-item" key={link.id}>
        <button className="shortcut-open" onClick={() => open(link)} type="button" title={link.url}
          aria-label={(link.kind === 'url' ? 'פתח ' : 'העתק נתיב ') + link.name}>
          <strong>{link.name} <span className="shortcut-kind">{LABEL[link.kind]} · {link.kind === 'url' ? 'פתיחה' : 'נתיב'}</span></strong>
          <small dir="ltr">{link.url}</small>
        </button>
        <button className="shortcut-icon-button" title={link.kind === 'url' ? 'העתק קישור' : 'העתק נתיב'}
          aria-label={'העתק ' + link.name} onClick={() => copy(link)} type="button">⧉</button>
        <button className="shortcut-icon-button" title="ערוך" aria-label={'ערוך ' + link.name}
          onClick={() => edit(link)} type="button">✎</button>
        <button className="shortcut-icon-button" title="מחק" aria-label={'מחק ' + link.name}
          onClick={() => remove(link)} type="button">×</button>
      </div>)}
      {localLinks.map((link) => <div className="shortcut-item" key={link.id}>
        <button className="shortcut-open" type="button" onClick={() => openLocal(link)}
          aria-label={'הצג ' + link.name} title={link.handle.name}>
          <strong>{link.name} <span className="shortcut-kind">
            {link.kind === 'directory' ? 'תיקייה · עיון' : 'קובץ · תצוגה'}
          </span></strong>
          <small dir="ltr">{link.handle.name} · IndexedDB</small>
        </button>
        <button className="shortcut-icon-button" title="העתק שם (לא נתיב)"
          aria-label={'העתק שם ' + link.name} onClick={() => copyText(link.handle.name,'שם הפריט')}
          type="button">⧉</button>
        <button className="shortcut-icon-button" title="שנה שם קיצור"
          aria-label={'שנה שם ' + link.name} onClick={() => setRename({id:link.id,name:link.name})}
          type="button">✎</button>
        <button className="shortcut-icon-button" title="הסר קיצור"
          aria-label={'הסר ' + link.name} onClick={() => removeLocal(link)} type="button">×</button>
      </div>)}
    </div>
    {rename && <form className="shortcut-rename" onSubmit={renameLocal}>
      <label className="pocket-widget-label">שינוי שם קיצור מקומי (לא משנה את הקובץ)
        <input value={rename.name} maxLength={100} onChange={(e) =>
          setRename((old) => ({...old,name:e.target.value}))} aria-label="שם קיצור מקומי"/>
      </label>
      <div className="commands-actions">
        <button type="submit">שמור שם</button>
        <button type="button" onClick={() => setRename(null)}>ביטול</button>
      </div>
    </form>}
    {folderView && !viewer && <div className="shortcut-browser">
      <div className="shortcut-browser-head">
        <strong>תיקייה: {folderView.breadcrumb.map((part) => part.name).join(' / ')}</strong>
        <button type="button" onClick={closeViewer} aria-label="סגור עיון">×</button>
      </div>
      <div className="commands-actions">
        <button type="button" onClick={folderBack}>↩ {folderView.breadcrumb.length > 1 ? 'תיקיית אב' : 'סגור תיקייה'}</button>
      </div>
      <div className="shortcut-directory-entries">
        {folderView.entries.map((entry) => <button type="button"
          key={entry.kind + ':' + entry.name} onClick={() => openFolderEntry(entry)}>
          <span aria-hidden="true">{entry.kind === 'directory' ? '📁' : '📄'}</span>
          <span dir="auto">{entry.name}</span>
          <span className="shortcut-kind">{entry.kind === 'directory' ? 'פתח תיקייה' : 'הצג קובץ'}</span>
        </button>)}
        {!folderView.entries.length && <p className="pocket-widget-hint">התיקייה ריקה.</p>}
      </div>
      {folderView.truncated && <p className="pocket-widget-hint">מוצגים רק 150 הפריטים הראשונים בתיקייה.</p>}
    </div>}
    {viewer && <div className="shortcut-browser">
      <div className="shortcut-browser-head">
        <strong>תצוגה מקומית: {viewer.name}</strong>
        <button type="button" onClick={() => setViewer(null)}
          aria-label={folderView ? 'חזרה לתיקייה' : 'סגור תצוגה'}>
          {folderView ? '↩ חזרה' : '×'}
        </button>
      </div>
      {viewer.kind === 'text' && <div className="commands-actions">
        <button type="button" onClick={() => copyText(viewer.content,'תוכן הקובץ')}>העתק תוכן ל־Clipboard</button>
      </div>}
      {viewer.kind === 'text' && <pre className="shortcut-text-preview" dir="ltr">{viewer.content}</pre>}
      {viewer.kind === 'image' && <img className="shortcut-image-preview" src={viewer.url}
        alt={'תצוגה מקומית של ' + viewer.name}/>}
      {viewer.kind === 'pdf' && <iframe className="shortcut-pdf-preview" src={viewer.url}
        title={'PDF ' + viewer.name}/>}
      <p className="pocket-widget-hint">תצוגת קריאה בלבד בדפדפן. הקובץ לא מועלה לשרת.</p>
    </div>}
    <form className="shortcut-form" onSubmit={save}>
      <label className="pocket-widget-label">הוסף אתר או נתיב להעתקה
        <select value={draft.kind} aria-label="סוג קיצור" onChange={(e) =>
          setDraft((previous) => ({ ...previous, kind: e.target.value, url: '' }))}>
          <option value="url">אתר אינטרנט (פתיחה והעתקה)</option>
          <option value="file">נתיב קובץ (העתקה בלבד)</option>
          <option value="folder">נתיב תיקייה (העתקה בלבד)</option>
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
        ב־Explorer בחר ״העתק כנתיב״ והדבק כאן. נתיב שמוקלד ידנית אינו מעניק הרשאת קריאה.
        לשם צפייה בקובץ/תיקייה יש לבחור אותו באמצעות הכפתורים למעלה.
      </p>}
      <div className="commands-actions">
        <button type="submit">{selected ? 'שמור שינויים' : '＋ הוסף קיצור'}</button>
        {selected && <button type="button" onClick={() => {
          setSelected(null); setDraft(EMPTY_DRAFT);
        }}>ביטול</button>}
      </div>
    </form>
    {localLinks.length > 0 && <p className="pocket-widget-hint">{FILE_NOTE}</p>}
    {message && <p className="pocket-widget-hint" role="status">{message}</p>}
    <p className="pocket-widget-hint">
      קישורים/נתיבים ידניים נשמרים ב־localStorage ונכללים בגיבוי JSON.
      הרשאות קבצים/תיקיות נשמרות ב־IndexedDB במכשיר זה בלבד ולא נכללות בגיבוי.
      האתר אינו מפעיל תוכנות או פותח Windows Explorer.
    </p>
  </section>;
}
