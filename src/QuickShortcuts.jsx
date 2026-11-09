import { useEffect, useState } from 'react';
import { normalizeShortcutUrl } from './shortcuts-utils.js';

const KEY = 'work-tools:shortcuts-v1';
function readShortcuts() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((item) => item && typeof item.id === 'string' && typeof item.url === 'string')
      .slice(0, 100).map((item) => ({ id: item.id, name: typeof item.name === 'string' ? item.name : '', url: item.url })) : [];
  } catch { return []; }
}

export default function QuickShortcuts() {
  const [links, setLinks] = useState(readShortcuts);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ name: '', url: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(links)); }
    catch { setMessage('לא ניתן לשמור קיצורים באחסון הדפדפן.'); }
  }, [links]);

  function edit(item) {
    setSelected(item.id);
    setDraft({ name: item.name, url: item.url });
    setMessage('');
  }
  function save(event) {
    event.preventDefault();
    try {
      const url = normalizeShortcutUrl(draft.url);
      const name = draft.name.trim().slice(0, 100) || new URL(url).hostname;
      if (selected) setLinks((current) => current.map((link) => link.id === selected ? { ...link, name, url } : link));
      else {
        if (links.length >= 100) throw new Error('ניתן לשמור עד 100 קיצורים.');
        setLinks((current) => [...current, { id: crypto.randomUUID(), name, url }]);
      }
      setSelected(null);
      setDraft({ name: '', url: '' });
      setMessage('הקיצור נשמר בדפדפן.');
    } catch (error) { setMessage(error.message); }
  }
  function open(link) {
    try { window.open(normalizeShortcutUrl(link.url), '_blank', 'noopener,noreferrer'); setMessage(''); }
    catch (error) { setMessage(error.message); }
  }
  function remove(item) {
    if (!window.confirm('למחוק את הקיצור ' + item.name + '?')) return;
    setLinks((current) => current.filter((entry) => entry.id !== item.id));
    if (item.id === selected) { setSelected(null); setDraft({ name: '', url: '' }); }
  }
  return <section className="card pocket-widget-card shortcuts-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">SHORTCUTS</p><h2>קיצורי דרך</h2></div></div>
    <div className="shortcut-list">
      {links.length === 0 && <p className="pocket-widget-hint">אין עדיין קיצורים. הוסף אתר כדי לפתוח אותו בלחיצה.</p>}
      {links.map((link) => <div className="shortcut-item" key={link.id}>
        <button className="shortcut-open" onClick={() => open(link)} type="button" title={link.url}>
          <strong>{link.name}</strong><small dir="ltr">{link.url}</small>
        </button>
        <button className="shortcut-icon-button" title="ערוך" aria-label={'ערוך ' + link.name} onClick={() => edit(link)} type="button">✎</button>
        <button className="shortcut-icon-button" title="מחק" aria-label={'מחק ' + link.name} onClick={() => remove(link)} type="button">×</button>
      </div>)}
    </div>
    <form className="shortcut-form" onSubmit={save}>
      <input value={draft.name} maxLength={100} onChange={(e) => setDraft((previous) => ({ ...previous, name: e.target.value }))} placeholder="שם הקיצור" aria-label="שם הקיצור" />
      <input dir="ltr" value={draft.url} onChange={(e) => setDraft((previous) => ({ ...previous, url: e.target.value }))} placeholder="https://example.com" aria-label="כתובת הקישור" />
      <div className="commands-actions">
        <button type="submit">{selected ? 'שמור שינויים' : '＋ הוסף קיצור'}</button>
        {selected && <button type="button" onClick={() => { setSelected(null); setDraft({ name:'', url:'' }); }}>ביטול</button>}
      </div>
    </form>
    {message && <p className="pocket-widget-hint" role="status">{message}</p>}
    <p className="pocket-widget-hint">קישורים לאתרים בלבד · פתיחה רק בלחיצה · ללא סנכרון לענן</p>
  </section>;
}
