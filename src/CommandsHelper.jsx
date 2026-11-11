import { useMemo, useRef, useState } from 'react';
import {
  MAX_COMMANDS, RECENT_COMMANDS_KEY, exportCommandDocument, listCommandCategories,
  listCommandMachines, mergeCommandDocument, readCommandLibrary, readCommandRecent,
  saveCommandLibrary, searchCommandLibrary, updateCommandRecent,
} from './command-library.js';
import {
  TEMPLATE_FIELD_TYPES, defaultTemplateFields, renderSmartTemplate,
  smartTemplateState, suggestSmartTemplate, templateFieldNames, validateSmartTemplate,
} from './smart-command-templates.js';

const INITIAL_MACHINE = 'All machines';
const INITIAL_CATEGORY = 'All categories';

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CommandsHelper() {
  const [library, setLibrary] = useState(() => readCommandLibrary(localStorage));
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [machine, setMachine] = useState(INITIAL_MACHINE);
  const [category, setCategory] = useState(INITIAL_CATEGORY);
  const [mode, setMode] = useState('all');
  const [recent, setRecent] = useState(() => readCommandRecent(localStorage));
  const [status, setStatus] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(null);
  const [templateValues, setTemplateValues] = useState({});
  const templateEditorRef = useRef(null);

  const machines = useMemo(() => listCommandMachines(library), [library]);
  const categories = useMemo(() => listCommandCategories(library, machine), [library, machine]);
  const selected = library.commands.find((row) => row.id === selectedId) || null;
  const templateState = smartTemplateState(selected);
  const suggestedTemplate = useMemo(() => suggestSmartTemplate(selected?.command || ''), [selected?.command]);
  const found = useMemo(() => searchCommandLibrary(library, {query,machine,category,mode,recent}),
    [library,query,machine,category,mode,recent]);

  function persist(next, feedback = '') {
    try {
      saveCommandLibrary(localStorage, next);
      setLibrary(next);
      if (feedback) setStatus(feedback);
      return true;
    } catch {
      setStatus('לא ניתן לשמור את ספריית הפקודות בדפדפן. בדוק שטח אחסון והרשאות.');
      return false;
    }
  }
  function select(id) {
    setSelectedId(id);
    setTemplateOpen(false);
    setTemplateDraft(null);
    setTemplateValues({});
    setStatus('');
  }
  function add() {
    if (library.commands.length >= MAX_COMMANDS) {
      setStatus('הספרייה מלאה. ניתן לשמור עד ' + MAX_COMMANDS + ' פקודות.');
      return;
    }
    const row = {
      id: 'user:' + crypto.randomUUID().replaceAll('-', ''),
      machine: machine === INITIAL_MACHINE ? (machines[0] || 'Cisco') : machine,
      category: category === INITIAL_CATEGORY ? 'Other' : category,
      description: '', command: '', favorite: false,
    };
    if (persist({...library,commands:[...library.commands,row]})) select(row.id);
  }
  function updateSelected(change) {
    if (!selected) return;
    const updated = library.commands.map((row) => row.id === selected.id ? {...row,...change} : row);
    persist({...library,commands:updated});
  }
  function updateField(key, value) {
    updateSelected({[key]:value});
    if (key === 'command') {
      setTemplateOpen(false);
      setTemplateDraft(null);
      setTemplateValues({});
    }
  }
  function toggleFavorite(id) {
    const updated = library.commands.map((row) => row.id === id ? {...row,favorite:!row.favorite} : row);
    persist({...library,commands:updated});
  }
  function remove() {
    if (!selected || !window.confirm('למחוק את הפקודה מהספרייה המקומית?')) return;
    if (persist({...library,commands:library.commands.filter((row) => row.id !== selected.id)})) select(null);
  }
  async function importCommands(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('קובץ JSON גדול מדי (מעל 4MB).');
      const input = JSON.parse(await file.text());
      const merged = mergeCommandDocument(library, input);
      if (persist(merged.document)) {
        setMachine(INITIAL_MACHINE); setCategory(INITIAL_CATEGORY); setMode('all'); setQuery('');
        if (merged.added) select(merged.document.commands[library.commands.length].id);
        setStatus('יובאו ' + merged.added + ' פקודות. ' +
          (merged.duplicates ? merged.duplicates + ' כפולות דולגו. ' : '') +
          (merged.rejected ? merged.rejected + ' רשומות לא תקינות דולגו. ' : '') +
          'נשמר מקומית בדפדפן.');
      }
    } catch (error) {
      setStatus(error.message || 'שגיאה בייבוא ספריית הפקודות.');
    } finally {
      event.target.value = '';
    }
  }
  function backup() {
    try {
      downloadJson('commands.json', exportCommandDocument(library));
      setStatus('ספריית הפקודות יוצאה לקובץ JSON, כולל מכונות וטמפלייטים.');
    } catch {
      setStatus('לא ניתן לייצא את ספריית הפקודות.');
    }
  }
  function rememberCopy(id) {
    const changed = updateCommandRecent(recent,id);
    setRecent(changed);
    try { localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(changed)); }
    catch { /* Copy remains possible without recent tracking */ }
  }
  async function copyCommand(text) {
    if (!selected || !text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      rememberCopy(selected.id);
      setStatus('הפקודה הועתקה בלבד. לא בוצעה הרצה.');
    } catch (error) { setStatus(error.message || 'לא ניתן להעתיק. בדוק הרשאות לוח.'); }
  }
  function openTemplate(useSuggestion = false) {
    if (!selected) return;
    const base = useSuggestion ? suggestedTemplate : (selected.template || suggestedTemplate);
    const format = typeof base?.format === 'string' ? base.format : selected.command;
    setTemplateDraft({format,fields:defaultTemplateFields(format,base?.fields)});
    setTemplateOpen(true);
    setTemplateValues({});
    setStatus('');
  }
  function editTemplateFormat(format) {
    setTemplateDraft((previous) => ({
      format, fields:defaultTemplateFields(format,previous?.fields),
    }));
  }
  function insertTemplateVariable() {
    if (!templateDraft) return;
    const current = templateDraft.format;
    const existing = new Set(templateFieldNames(current));
    if (existing.size >= 12) {
      setStatus('ניתן להגדיר עד 12 משתנים בטמפלייט אחד.');
      return;
    }
    let number = 1;
    while (existing.has('FIELD_' + number)) number++;
    const name = 'FIELD_' + number;
    const editor = templateEditorRef.current;
    const start = Number.isInteger(editor?.selectionStart) ? editor.selectionStart : current.length;
    const end = Number.isInteger(editor?.selectionEnd) ? editor.selectionEnd : current.length;
    const inserted = '{{' + name + '}}';
    editTemplateFormat(current.slice(0, start) + inserted + current.slice(end));
    setStatus('נוסף המשתנה ' + inserted + '. אפשר לשנות את שמו ואת סוגו.');
    editor?.focus();
  }
  function editTemplateField(name, values) {
    setTemplateDraft((old) => ({
      ...old,fields:old.fields.map((field) => field.name === name ? {...field,...values} : field),
    }));
  }
  function saveTemplate() {
    if (!selected || !templateDraft) return;
    try {
      const template = validateSmartTemplate(templateDraft,selected.command);
      const updated = library.commands.map((row) => row.id === selected.id ? {...row,template} : row);
      if (persist({...library,commands:updated},'הטמפלייט אושר ונשמר עם הפקודה המקורית.')) {
        setTemplateOpen(false);
        setTemplateDraft(null);
        setTemplateValues({});
      }
    } catch (error) { setStatus(error.message); }
  }
  function removeTemplate() {
    if (!selected || !selected.template || !window.confirm('להסיר את הטמפלייט? הפקודה המקורית תישמר.')) return;
    const updated = library.commands.map((row) => {
      if (row.id !== selected.id) return row;
      const {template, ...plain} = row;
      return plain;
    });
    if (persist({...library,commands:updated},'הטמפלייט הוסר. הפקודה המקורית נשמרה.')) {
      setTemplateOpen(false);
      setTemplateDraft(null);
      setTemplateValues({});
    }
  }
  let preview = '';
  let previewError = '';
  if (templateState === 'configured' && selected &&
      Object.values(templateValues).some((value) => String(value).trim())) {
    try { preview = renderSmartTemplate(selected,templateValues); }
    catch (error) { previewError = error.message; }
  }

  return <section className="card pocket-widget-card commands-card">
    <div className="card-heading drag-handle">
      <div><p className="eyebrow">COMMANDS · POCKET LIBRARY</p><h2>עוזר פקודות</h2></div>
    </div>
    <div className="commands-actions">
      <button type="button" onClick={add}>＋ פקודה</button>
      <label className="commands-import">ייבוא JSON
        <input type="file" accept=".json,application/json" onChange={importCommands}
          aria-label="ייבוא ספריית פקודות JSON" />
      </label>
      <button type="button" onClick={backup} disabled={!library.commands.length}>גיבוי JSON</button>
    </div>
    <p className="pocket-widget-hint" role="status">
      {library.commands.length.toLocaleString('en-US')} פקודות · {machines.length} מכונות · ספרייה מקומית בדפדפן
    </p>
    <input className="commands-search" value={query} onChange={(event) => setQuery(event.target.value)}
      placeholder="חיפוש: מכונה, פקודה, תיאור, ממשק, IP..." aria-label="חיפוש פקודות" />
    <div className="commands-filters">
      <select aria-label="מכונה" value={machine} onChange={(event) => {setMachine(event.target.value);setCategory(INITIAL_CATEGORY);}}>
        <option value={INITIAL_MACHINE}>כל המכונות</option>
        {machines.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select aria-label="קטגוריה" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value={INITIAL_CATEGORY}>כל הקטגוריות</option>
        {categories.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select aria-label="סינון פקודות" value={mode} onChange={(event) => setMode(event.target.value)}>
        <option value="all">הכול</option>
        <option value="favorites">מועדפים</option>
        <option value="recent">אחרונים שהועתקו</option>
      </select>
    </div>
    <div className="commands-results-count">
      {found.total.toLocaleString('en-US')} תוצאות
      {found.total > found.rows.length ? ' · מוצגות ' + found.rows.length + ' הראשונות' : ''}
    </div>
    <div className="commands-list" role="list" aria-label="פקודות שמורות">
      {found.rows.length === 0
        ? <p className="pocket-widget-hint">{library.commands.length ? 'אין תוצאות לסינון הנבחר.' : 'ייבא commands.json או צור פקודה.'}</p>
        : found.rows.map((row) => <div className="command-list-row" key={row.id} role="listitem">
          <button type="button" className={row.id === selectedId ? 'command-list-item active' : 'command-list-item'}
            onClick={() => select(row.id)}>
            <strong>{row.description || 'פקודה חדשה'}</strong>
            <code className="command-list-preview" dir="ltr" title={row.command || 'עדיין לא הוגדרה פקודה'}>{row.command || '—'}</code>
            <small>{row.machine} · {row.category}{smartTemplateState(row) === 'configured' ? ' · Template' : ''}</small>
          </button>
          <button type="button" className="command-favorite" aria-label={row.favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            aria-pressed={row.favorite} onClick={() => toggleFavorite(row.id)} title="מועדפים">{row.favorite ? '★' : '☆'}</button>
        </div>)}
    </div>
    {selected && <div className="command-editor" key={selected.id}>
      <div className="command-fields">
        <label>מכונה
          <input value={selected.machine} list="commands-machine-options" maxLength={90}
            onChange={(event) => updateField('machine',event.target.value)} aria-label="מכונה לפקודה" />
        </label>
        <label>קטגוריה
          <input value={selected.category} list="commands-category-options" maxLength={100}
            onChange={(event) => updateField('category',event.target.value)} aria-label="קטגוריית הפקודה" />
        </label>
      </div>
      <datalist id="commands-machine-options">{machines.map((name) => <option key={name} value={name}/>)}</datalist>
      <datalist id="commands-category-options">{categories.map((name) => <option key={name} value={name}/>)}</datalist>
      <label className="pocket-widget-label">תיאור הפקודה
        <input value={selected.description} onChange={(event) => updateField('description',event.target.value)}
          maxLength={300} placeholder="מה הפקודה עושה?" aria-label="תיאור פקודה" />
      </label>
      <label className="pocket-widget-label">פקודה מקורית (CLI)
        <textarea dir="ltr" spellCheck={false} value={selected.command}
          onChange={(event) => updateField('command',event.target.value)}
          placeholder="show ip route" aria-label="פקודת CLI" maxLength={10000} />
      </label>
      <div className="commands-actions">
        <button type="button" onClick={() => copyCommand(selected.command)} disabled={!selected.command.trim()}>העתק פקודה מקורית</button>
        <button type="button" onClick={() => openTemplate(false)} disabled={!selected.command.trim()}>
          {selected.template ? 'ערוך טמפלייט' : 'צור טמפלייט'}
        </button>
        <button type="button" onClick={remove}>מחק פקודה</button>
      </div>
      {selected.template && templateState === 'needs-review' &&
        <p className="pocket-widget-error" role="alert">הפקודה השתנתה או שהטמפלייט אינו תקין. יש לבדוק ולאשר אותו מחדש לפני שימוש.</p>}
      {!selected.template && suggestedTemplate && !templateOpen &&
        <p className="pocket-widget-hint">זוהו שדות אפשריים לטמפלייט. אפשר לאשר הצעה בלי לשנות את הפקודה המקורית.</p>}
      {templateOpen && templateDraft && <div className="command-smart-editor">
        <strong>הגדרת טמפלייט · אישור ידני בלבד</strong>
        <p className="pocket-widget-hint">הפורמט להעתקה נפרד מהפקודה המקורית. אפשר להגדיר כמה משתנים שונים, למשל {"{{IP}}"}, {"{{SOURCE_IP}}"}, {"{{VLAN}}"} וגם {"{{1/11}}"}. כל משתנה מקבל שדה מילוי משלו.</p>
        <p className="pocket-widget-hint">{templateDraft.fields.length} משתנים מזוהים · שמות שחוזרים כמה פעמים מקבלים שדה אחד משותף.</p>
        <label className="pocket-widget-label">פורמט הטמפלייט
          <textarea dir="ltr" spellCheck={false} value={templateDraft.format} maxLength={6000}
            ref={templateEditorRef} aria-label="פורמט הטמפלייט"
            onChange={(event) => editTemplateFormat(event.target.value)} />
        </label>
        <div className="commands-actions">
          <button type="button" onClick={insertTemplateVariable} disabled={templateDraft.fields.length >= 12}
            title="הוסף משתנה למקום שבו נמצא הסמן בפורמט">＋ הוסף משתנה במיקום הסמן</button>
          {suggestedTemplate && <button type="button" onClick={() => openTemplate(true)}>השתמש בהצעה חכמה</button>}
        </div>
        {templateDraft.fields.map((field) => <div className="command-template-config-row" key={field.name}>
          <strong dir="ltr">{'{{' + field.name + '}}'}</strong>
          <input value={field.label} aria-label={'שם שדה ' + field.name} maxLength={80}
            onChange={(event) => editTemplateField(field.name,{label:event.target.value})}/>
          <select value={field.type} aria-label={'סוג שדה ' + field.name}
            onChange={(event) => editTemplateField(field.name,{type:event.target.value})}>
            {TEMPLATE_FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          {field.type === 'choice' && <input className="command-template-choice"
            aria-label={'אפשרויות שדה ' + field.name}
            placeholder="אפשרות 1, אפשרות 2" value={(field.options || []).join(', ')}
            onChange={(event) => editTemplateField(field.name,{
              options:event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
            })}/>}
        </div>)}
        <div className="commands-actions">
          <button type="button" onClick={saveTemplate}>שמור ואשר טמפלייט</button>
          <button type="button" onClick={() => {setTemplateOpen(false);setTemplateDraft(null);}}>ביטול</button>
          {selected.template && <button type="button" onClick={removeTemplate}>הסר טמפלייט</button>}
        </div>
      </div>}
      {templateState === 'configured' && !templateOpen && <div className="command-smart-fill">
        <strong>מילוי טמפלייט מאושר</strong>
        <div className="command-template-fields">
          {selected.template.fields.map((field) => <label key={field.name}>{field.label} ({field.type})
            {field.type === 'choice' ? <select value={templateValues[field.name] || ''}
              onChange={(event) => setTemplateValues((old) => ({...old,[field.name]:event.target.value}))}
              aria-label={'ערך תבנית ' + field.name}>
              <option value="">בחר ערך</option>
              {field.options.map((value) => <option key={value} value={value}>{value}</option>)}
            </select> : <input dir="ltr" value={templateValues[field.name] || ''}
              onChange={(event) => setTemplateValues((old) => ({...old,[field.name]:event.target.value}))}
              placeholder={field.type === 'ipv4' ? '192.168.1.1' : field.type === 'vlan' ? '100' : field.name}
              aria-label={'ערך תבנית ' + field.name} />}
          </label>)}
        </div>
        {preview && <label className="pocket-widget-label">תצוגה מקדימה
          <textarea dir="ltr" readOnly value={preview} aria-label="תצוגה מקדימה של הפקודה" />
        </label>}
        {previewError && <p className="pocket-widget-error">{previewError}</p>}
        <div className="commands-actions">
          <button type="button" disabled={!preview} onClick={() => copyCommand(preview)}>מלא והעתק פקודה</button>
        </div>
        <p className="pocket-widget-hint">הערכים שאתה ממלא אינם נשמרים בספרייה.</p>
      </div>}
    </div>}
    {status && <p className="pocket-widget-hint" role="status">{status}</p>}
    <p className="pocket-widget-hint">המידע נשמר בדפדפן הזה בלבד; ניתן לייצא גיבוי JSON. הפקודות לעולם אינן מורצות.</p>
  </section>;
}
