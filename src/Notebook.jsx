import { useEffect, useState } from 'react';
import { normalizeNotebook } from './notebook-data.js';

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
    };
    setNotebook((previous) => ({
      notes: [...previous.notes, note],
      activeId: note.id,
    }));
  }

  function deleteNote() {
    if (notes.length <= 1 || !window.confirm('למחוק את הפתק הזה?')) return;
    setNotebook((previous) => {
      const remaining = previous.notes.filter((note) => note.id !== previous.activeId);
      const previousIndex = previous.notes.findIndex((note) => note.id === previous.activeId);
      return { notes: remaining, activeId: remaining[Math.max(0, previousIndex - 1)]?.id ?? remaining[0].id };
    });
  }

  return <section className="card notes-card notebook-card">
    <div className="card-heading drag-handle">
      <div><p className="eyebrow">NOTES</p><h2>פתקים</h2></div>
      <span className="save-note">שמירה אוטומטית</span>
    </div>
    <div className="notebook-tab-bar">
      <div className="notebook-tabs" role="tablist" aria-label="כותרות פתקים">
        {notes.map((note) => <button
          key={note.id}
          type="button"
          role="tab"
          aria-selected={note.id === current.id}
          className={note.id === current.id ? 'notebook-tab active' : 'notebook-tab'}
          onClick={() => selectNote(note.id)}
          title={note.title || 'ללא כותרת'}
        >{note.title.trim() || 'ללא כותרת'}</button>)}
      </div>
      <button type="button" className="notebook-add" onClick={addNote} title="פתק חדש" aria-label="הוסף פתק">＋</button>
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
      <button type="button" onClick={deleteNote} disabled={notes.length <= 1} title="מחק את הפתק הנבחר">מחק פתק</button>
    </div>
  </section>;
}
