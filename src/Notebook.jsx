import { useEffect, useState } from 'react';
import { closeNotebookTab, duplicateNotebookTab, normalizeNotebook, restoreClosedNotebookTab, sortNotebookTabs } from './notebook-data.js';

const STORAGE_KEY = 'work-tools:notebook-v1';
const LEGACY_KEY = 'work-tools:notes';

function readStored(key) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? null : JSON.parse(value);
  } catch {
    return null;
  }
}

export default function Notebook() {
  const [notebook, setNotebook] = useState(() => normalizeNotebook(readStored(STORAGE_KEY), readStored(LEGACY_KEY)));
  const { notes, activeId } = notebook;
  const [recentlyClosed, setRecentlyClosed] = useState(null);
  const orderedNotes = sortNotebookTabs(notes);
  const current = notes.find((note) => note.id === activeId) ?? notes[0];

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook)); }
    catch { /* Browser storage may be disabled or full. */ }
  }, [notebook]);

  function selectNote(id) {
    setNotebook((previous) => ({ ...previous, activeId: id }));
  }

  function updateNote(field, value) {
    setNotebook((previous) => ({
      ...previous,
      notes: previous.notes.map((note) => note.id === previous.activeId ? { ...note, [field]: value } : note),
    }));
  }

  function addNote() {
    const note = {
      id: 'note:' + crypto.randomUUID(),
      title: 'פתק ' + (notes.length + 1),
      phone: '',
      text: '',
      createdAt: new Date().toISOString(),
      pinned: false,
    };
    setNotebook((previous) => ({
      notes: [...previous.notes, note],
      activeId: note.id,
    }));
  }

  function closeNote(noteId) {
    const note = notes.find((item) => item.id === noteId);
    if (!note) return;
    if ((note.text.trim() || note.phone.trim()) && !window.confirm('למחוק את הפתק הזה?')) return;
    // The notebook always keeps one editable blank tab, even when the last tab closes.
    const blankReplacement = {
      id: 'note:' + crypto.randomUUID(),
      title: 'פתק 1',
      phone: '',
      text: '',
      createdAt: new Date().toISOString(),
    };
    setRecentlyClosed({ note, index: notes.findIndex((item) => item.id === noteId), blankId: notes.length === 1 ? blankReplacement.id : null });
    setNotebook((previous) => closeNotebookTab(previous, noteId, blankReplacement));
  }

  function duplicateNote() {
    setNotebook((previous) => duplicateNotebookTab(previous, current.id, 'note:' + crypto.randomUUID(), new Date().toISOString()));
  }
  function togglePin() {
    updateNote('pinned', !current.pinned);
  }
  async function copyPhone() {
    if (!current.phone.trim()) return;
    try { await navigator.clipboard.writeText(current.phone.trim()); }
    catch { window.alert('לא ניתן להעתיק. יש לאפשר גישה ללוח בדפדפן.'); }
  }
  function undoClose() {
    if (!recentlyClosed) return;
    setNotebook((previous) => restoreClosedNotebookTab(previous, recentlyClosed));
    setRecentlyClosed(null);
  }
  function handleKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !event.altKey) {
      event.preventDefault();
      addNote();
    }
  }

  return <section className="card notes-card notebook-card" onKeyDown={handleKeyDown}>
    <div className="card-heading drag-handle">
      <div><p className="eyebrow">NOTES</p><h2>פתקים</h2></div>
      <span className="save-note">שמירה אוטומטית</span>
    </div>
    <div className="notebook-tab-bar">
      <div className="notebook-tabs" role="tablist" aria-label="כותרות פתקים">
        {orderedNotes.map((note) => <div
          key={note.id}
          className={note.id === current.id ? 'notebook-tab active' : 'notebook-tab'}
          role="presentation"
        >
          <button
            type="button"
            role="tab"
            aria-selected={note.id === current.id}
            className="notebook-tab-select"
            onClick={() => selectNote(note.id)}
            title={note.title || 'ללא כותרת'}
          >{note.pinned && <span aria-hidden="true">📌 </span>}{note.title.trim() || 'ללא כותרת'}</button>
          <button
            type="button"
            className="notebook-tab-close"
            onClick={() => closeNote(note.id)}
            title="סגור פתק"
            aria-label={`סגור פתק: ${note.title.trim() || 'ללא כותרת'}`}
          >×</button>
        </div>)}
        <button type="button" className="notebook-add" onClick={addNote} title="פתק חדש" aria-label="הוסף פתק">＋</button>
      </div>
    </div>
    <div className="notebook-fields">
      <label>כותרת
        <input type="text" maxLength={120} value={current.title} onChange={(event) => updateNote('title', event.target.value)} placeholder="כותרת הפתק" aria-label="כותרת הפתק" />
      </label>
      <label>מספר טלפון
        <input type="tel" dir="ltr" value={current.phone} onChange={(event) => updateNote('phone', event.target.value)} placeholder="אופציונלי" aria-label="מספר טלפון" />
      </label>
    </div>
    <textarea className="notebook-editor" dir="auto" aria-label="תוכן הפתק" value={current.text}
      onChange={(event) => updateNote('text', event.target.value)} placeholder="כתוב כאן את הפתק שלך..." />
    <div className="notebook-footer">
      <span>נוצר: {new Date(current.createdAt).toLocaleString('he-IL')}</span>
      <div className="notebook-footer-actions">
        <button type="button" onClick={togglePin} aria-pressed={current.pinned === true}>{current.pinned ? 'בטל נעיצה' : '📌 נעץ'}</button>
        <button type="button" onClick={duplicateNote}>שכפל</button>
        <button type="button" onClick={copyPhone} disabled={!current.phone.trim()}>העתק טלפון</button>
        {recentlyClosed && <button type="button" className="notebook-undo" onClick={undoClose}>בטל סגירת פתק</button>}
      </div>
    </div>
  </section>;
}
