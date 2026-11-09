import { useEffect, useState } from 'react';
import { COMMAND_CATEGORIES, commandTemplateFields, fillCommandTemplate, normalizeCommandCategory } from './command-utils.js';

const STORAGE_KEY = 'work-tools:commands-v1';
const empty = { machine:'', description:'', command:'', category:'Cisco', favorite:false };
function sanitizeRow(row, id) {
  return {
    id, machine: typeof row.machine === 'string' ? row.machine.slice(0,100) : '',
    description: typeof row.description === 'string' ? row.description.slice(0,300) : '',
    command: typeof row.command === 'string' ? row.command.slice(0,10000) : '',
    category: normalizeCommandCategory(row.category),
    favorite: row.favorite === true,
  };
}
function readCommands() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((row) => row && typeof row.id === 'string')
      .slice(0,1000).map((row) => sanitizeRow(row,row.id)) : [];
  } catch { return []; }
}
function sanitizeImport(data) {
  const rows = Array.isArray(data) ? data : data?.commands;
  if (!Array.isArray(rows) || rows.length > 500) throw new Error('בחר קובץ JSON עם עד 500 פקודות.');
  return rows.filter((row) => row && typeof row === 'object')
    .map((row) => sanitizeRow(row,'command:' + crypto.randomUUID()))
    .filter((row) => row.command.trim());
}

export default function CommandsHelper() {
  const [entries, setEntries] = useState(readCommands);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [values, setValues] = useState({IP:'',VLAN:''});
  const [status, setStatus] = useState('');
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const fields = commandTemplateFields(selected?.command ?? '');
  const filtered = entries.filter((entry) =>
    (category === 'All' || entry.category === category) &&
    (!favoritesOnly || entry.favorite) &&
    (entry.machine + ' ' + entry.description + ' ' + entry.command).toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a,b) => Number(b.favorite) - Number(a.favorite));

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
    catch { setStatus('לא ניתן לשמור בדפדפן. בדוק שטח אחסון.'); }
  }, [entries]);

  function add() {
    const row = { ...empty,id:'command:' + crypto.randomUUID() };
    setEntries((old) => [...old, row]);
    setSelectedId(row.id); setValues({IP:'',VLAN:''}); setStatus('');
  }
  function edit(field, value) {
    setEntries((old) => old.map((entry) => entry.id === selectedId ? { ...entry, [field]: value } : entry));
  }
  function select(id) {
    setSelectedId(id); setValues({IP:'',VLAN:''}); setStatus('');
  }
  async function copy() {
    if (!selected?.command.trim()) return;
    try {
      const text = fillCommandTemplate(selected.command,values);
      await navigator.clipboard.writeText(text);
      setStatus('הפקודה הועתקה. היא לא הורצה.');
    } catch (error) { setStatus(error.message || 'העתקה נכשלה.'); }
  }
  function remove() {
    if (!selected || !window.confirm('למחוק את הפקודה?')) return;
    setEntries((old) => old.filter((entry) => entry.id !== selectedId));
    setSelectedId(null);
  }
  async function importCommands(event) {
    const file=event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('הקובץ גדול מדי.');
      const incoming=sanitizeImport(JSON.parse(await file.text()));
      if (entries.length + incoming.length > 1000) throw new Error('ניתן לשמור עד 1000 פקודות.');
      setEntries((old) => [...old,...incoming]);
      setSelectedId(incoming[0]?.id ?? null);
      setStatus('יובאו '+incoming.length+' פקודות מקומית.');
    } catch (error) { setStatus(error.message || 'שגיאה בייבוא קובץ.'); }
    event.target.value='';
  }
  function backup() {
    const blob=new Blob([JSON.stringify({commands:entries},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a'); link.href=url; link.download='dashdash-commands-backup.json'; link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus('קובץ הגיבוי נוצר.');
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
    <div className="commands-filters">
      <select aria-label="סוג מכשיר" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="All">כל המכשירים</option>
        {COMMAND_CATEGORIES.map((item)=><option key={item} value={item}>{item}</option>)}
      </select>
      <label><input type="checkbox" checked={favoritesOnly} onChange={(e)=>setFavoritesOnly(e.target.checked)}/> מועדפים בלבד</label>
    </div>
    <div className="commands-list" role="list" aria-label="פקודות שמורות">
      {filtered.length === 0 ? <p className="pocket-widget-hint">{entries.length ? 'אין תוצאות.' : 'הוסף פקודה או ייבא JSON.'}</p>
        : filtered.map((entry) => <div className="command-list-row" key={entry.id}>
          <button type="button" className={entry.id === selectedId ? 'command-list-item active' : 'command-list-item'}
            onClick={() => select(entry.id)}><strong>{entry.description || 'ללא כותרת'}</strong><small>{entry.category} · {entry.machine || 'מכונה לא הוגדרה'}</small></button>
          <button type="button" className="command-favorite" onClick={() => setEntries((old)=>old.map((row)=>row.id===entry.id?{...row,favorite:!row.favorite}:row))}
            aria-label={entry.favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'} aria-pressed={entry.favorite} title="מועדפים">{entry.favorite ? '★' : '☆'}</button>
        </div>)}
    </div>
    {selected && <div className="command-editor">
      <div className="command-fields">
        <input value={selected.machine} onChange={(event) => edit('machine', event.target.value)} placeholder="מכונה" aria-label="מכונה" maxLength={100}/>
        <input value={selected.description} onChange={(event) => edit('description', event.target.value)} placeholder="תיאור" aria-label="תיאור פקודה" maxLength={300}/>
      </div>
      <select className="command-category-select" aria-label="קטגוריית הפקודה" value={selected.category} onChange={(e)=>edit('category',e.target.value)}>
        {COMMAND_CATEGORIES.map((item)=><option key={item} value={item}>{item}</option>)}
      </select>
      <textarea dir="ltr" spellCheck={false} value={selected.command} onChange={(event) => edit('command', event.target.value)}
        placeholder="CLI command... Use {{IP}} or {{VLAN}} for a template" aria-label="פקודת CLI" />
      {fields.length>0 && <div className="command-template-fields">
        {fields.filter((field)=>field==='IP'||field==='VLAN').map((field)=><label key={field}>{field}
          <input dir="ltr" placeholder={field==='IP'?'192.168.1.1':'100'} value={values[field]??''}
            onChange={(e)=>setValues((old)=>({...old,[field]:e.target.value}))} aria-label={'ערך '+field+' לתבנית'} />
        </label>)}
        <p className="pocket-widget-hint">ערכי התבנית לא נשמרים; יוחלפו רק בהעתקה.</p>
      </div>}
      <div className="commands-actions">
        <button type="button" onClick={copy} disabled={!selected.command.trim()}>העתק פקודה</button>
        <button type="button" onClick={remove}>מחק</button>
      </div>
    </div>}
    {status && <p className="pocket-widget-hint" role="status">{status}</p>}
    <p className="pocket-widget-hint">רק צפייה, עריכה והעתקה · ללא הרצת פקודות או גישה לשרת</p>
  </section>;
}
