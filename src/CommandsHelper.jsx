import { useEffect, useState } from 'react';

const STORAGE_KEY = 'work-tools:commands-v1';
const fields = ['machine', 'description', 'command'];

function readCommands() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((row) => row && typeof row.id === 'string')
      .map((row) => ({
        id: row.id,
        machine: typeof row.machine === 'string' ? row.machine : '',
        description: typeof row.description === 'string' ? row.description : '',
        command: typeof row.command === 'string' ? row.command : '',
      })) : [];
  } catch {
    return [];
  }
}
function sanitizeImport(data) {
  const rows = Array.isArray(data) ? data : data?.commands;
  if (!Array.isArray(rows) || rows.length > 500) throw new Error('יש לבחור קובץ JSON עם עד 500 פקודות.');
  return rows.filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: 'command:' + crypto.randomUUID(),
      machine: String(row.machine ?? '').slice(0, 100),
      description: String(row.description ?? '').slice(0, 300),
      command: String(row.command ?? '').slice(0, 10000),
    }))
    .filter((row) => row.command.trim());
}

export default function CommandsHelper() {
  const [entries, setEntries] = useState(readCommands);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const filtered = entries.filter((entry) =>
    (entry.machine + ' ' + entry.description + ' ' + entry.command).toLowerCase().includes(query.toLowerCase().trim()));

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
    catch { setStatus('לא ניתן לשמור בדפדפן. בדוק את שטח האחסון.'); }
  }, [entries]);

  function add() {
    const row = { id: 'command:' + crypto.randomUUID(), machine: '', description: '', command: '' };
    setEntries((old) => [...old, row]);
    setSelectedId(row.id);
    setStatus('');
  }
  function edit(field, value) {
    setEntries((old) => old.map((entry) => entry.id === selectedId ? { ...entry, [field]: value } : entry));
  }
  async function copy() {
    if (!selected?.command.trim()) return;
    try { await navigator.clipboard.writeText(selected.command); setStatus('הפקודה הועתקה.'); }
    catch { setStatus('לא ניתן להעתיק. בדוק הרשאות Clipboard בדפדפן.'); }
  }
  function remove() {
    if (!selected || !window.confirm('למחוק את הפקודה?')) return;
    setEntries((old) => old.filter((entry) => entry.id !== selectedId));
    setSelectedId(null);
  }
  async function importCommands(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('הקובץ גדול מדי.');
      const parsed = JSON.parse(await file.text());
      const incoming = sanitizeImport(parsed);
      setEntries((old) => [...old, ...incoming].slice(0, 1000));
      setSelectedId(incoming[0]?.id ?? null);
      setStatus('יובאו ' + incoming.length + ' פקודות. המידע נשמר בדפדפן בלבד.');
    } catch (error) { setStatus(error.message || 'שגיאה בייבוא קובץ.'); }
    event.target.value = '';
  }
  function backup() {
    const blob = new Blob([JSON.stringify({ commands: entries }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dashdash-commands-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('נוצר קובץ גיבוי להורדה.');
  }

  return <section className="card pocket-widget-card commands-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">COMMANDS</p><h2>עוזר פקודות</h2></div></div>
    <div className="commands-actions">
      <button type="button" onClick={add}>＋ פקודה</button>
      <label className="commands-import">ייבוא JSON<input type="file" accept=".json,application/json" onChange={importCommands} aria-label="ייבוא ספריית פקודות JSON" /></label>
      <button type="button" onClick={backup} disabled={!entries.length}>גיבוי</button>
    </div>
    <input className="commands-search" value={query} onChange={(event) => setQuery(event.target.value)}
      placeholder="חיפוש לפי מכונה, תיאור או פקודה" aria-label="חיפוש פקודות" />
    <div className="commands-list" role="list" aria-label="פקודות שמורות">
      {filtered.length === 0 ? <p className="pocket-widget-hint">{entries.length ? 'אין תוצאות.' : 'הוסף פקודה או ייבא קובץ JSON מקומי.'}</p>
        : filtered.map((entry) => <button type="button" key={entry.id} className={entry.id === selectedId ? 'command-list-item active' : 'command-list-item'}
          onClick={() => setSelectedId(entry.id)}><strong>{entry.description || 'ללא כותרת'}</strong><small>{entry.machine || 'מכונה לא הוגדרה'}</small></button>)}
    </div>
    {selected && <div className="command-editor">
      <div className="command-fields">
        <input value={selected.machine} onChange={(event) => edit('machine', event.target.value)} placeholder="מכונה" aria-label="מכונה" maxLength={100} />
        <input value={selected.description} onChange={(event) => edit('description', event.target.value)} placeholder="תיאור" aria-label="תיאור פקודה" maxLength={300} />
      </div>
      <textarea dir="ltr" spellCheck={false} value={selected.command} onChange={(event) => edit('command', event.target.value)} placeholder="CLI command..." aria-label="פקודת CLI" />
      <div className="commands-actions">
        <button type="button" onClick={copy} disabled={!selected.command.trim()}>העתק</button>
        <button type="button" onClick={remove}>מחק</button>
      </div>
    </div>}
    {status && <p className="pocket-widget-hint" role="status">{status}</p>}
    <p className="pocket-widget-hint">פקודות לעיון ולהעתקה בלבד · ללא הרצה וללא העלאה לשרת</p>
  </section>;
}
