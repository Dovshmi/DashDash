import { useEffect, useMemo, useRef, useState } from 'react';
import { cleanText, columnName, findWeekMismatch, getScheduleEntries, guessMapping, pdfLinesFromItems, PDF_CATEGORIES, readScheduleExcel, weekFromText } from './work-schedule-parser.js';
import { readScheduleClipboard } from './schedule-clipboard.js';
import ScheduleWeekGrid from './ScheduleWeekGrid.jsx';
import './work-schedule.css';

const MAX_VISIBLE = 120;
function unique(values) { return [...new Set(values.filter(Boolean).map(cleanText))].sort((a, b) => a.localeCompare(b, 'he')); }
function match(value, query) { return !query || cleanText(value).toLowerCase().includes(cleanText(query).toLowerCase()); }
function FileDrop({ title, hint, icon, accept, filename, onFile, onClear, required, children }) {
  return <div className="schedule-import">
    <div className="schedule-import-head"><span aria-hidden="true">{icon}</span><div><strong>{title}</strong><small>{hint}</small></div></div>
    {filename ? <div className="schedule-file"><span title={filename}>{filename}</span><button type="button" onClick={onClear} aria-label={'הסר ' + title}>×</button></div>
      : <label className="schedule-file-button">＋ בחר קובץ
        <input aria-label={'בחר ' + title} type="file" accept={accept} onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; if (f) onFile(f); }} />
      </label>}
    {required && <small className="schedule-help">נדרש קובץ Excel או טבלה שהועתקה</small>}
    {children}
  </div>;
}

async function readPdf(file, progress) {
  // Lazy-loaded only when PDF is selected. No server-side PDF processing or upload.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      progress(number, pdf.numPages);
      const page = await pdf.getPage(number);
      const text = await page.getTextContent();
      const lines = pdfLinesFromItems(text.items, number);
      pages.push({ number, lines, noText: !lines.length });
      page.cleanup();
    }
  } finally { await pdf.destroy(); }
  const all = pages.flatMap((page) => page.lines);
  return {
    name: file.name, pages, lines: all,
    week: weekFromText(pages.slice(0, 2).flatMap((page) => page.lines.map((l) => l.text)).join(' ')) || weekFromText(file.name),
    blankPages: pages.filter((page) => page.noText).map((page) => page.number),
  };
}

export default function WorkSchedule() {
  const [excel, setExcel] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const urlRef = useRef('');
  const requestRef = useRef(0);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [status, setStatus] = useState('');
  const [excelError, setExcelError] = useState('');
  const [showClipboardInput, setShowClipboardInput] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [view, setView] = useState('week');
  const [mappingType, setMappingType] = useState('auto');
  const [customMapping, setCustomMapping] = useState({});
  const [query, setQuery] = useState('');
  const [employee, setEmployee] = useState('');
  const [manager, setManager] = useState('');
  const [day, setDay] = useState('');
  const [visibleExcel, setVisibleExcel] = useState(MAX_VISIBLE);
  const [visiblePdf, setVisiblePdf] = useState(MAX_VISIBLE);
  const [pdfCategory, setPdfCategory] = useState('הכול');
  const [pdfPage, setPdfPage] = useState(0);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const sheet = excel?.sheets.find((s) => s.name === sheetName) || excel?.sheets[0];
  const guessedMapping = sheet ? guessMapping(sheet) : { type: 'raw', rowNumber: 0 };
  const cols = sheet ? Math.min(300, Math.max(1, ...sheet.rows.flatMap((r) => Object.keys(r.cells).map((k) => Number(k) + 1)))) : 1;
  const mapping = mappingType === 'auto' ? guessedMapping
    : mappingType === 'table' ? { type: 'table', rowNumber: Number(customMapping.rowNumber) || 1,
      employee: customMapping.employee === '' ? undefined : Number(customMapping.employee),
      manager: customMapping.manager === '' ? undefined : Number(customMapping.manager),
      shift: customMapping.shift === '' ? undefined : Number(customMapping.shift),
      day: customMapping.day === '' ? undefined : Number(customMapping.day) }
    : mappingType === 'raw' ? { type: 'raw' } : guessedMapping;
  const displayView = view === 'week' && mapping.type !== 'calendar' ? 'interpreted' : view;
  const entries = useMemo(() => sheet ? getScheduleEntries(sheet, mapping) : [], [sheet, JSON.stringify(mapping)]);
  const employeeOptions = useMemo(() => unique(entries.map((r) => r.employee)).slice(0, 500), [entries]);
  const managerOptions = useMemo(() => unique(entries.map((r) => r.manager)).slice(0, 500), [entries]);
  const filteredEntries = useMemo(() => entries.filter((r) =>
    match(r.employee, employee) && match(r.manager, manager) && (!day || r.day === day) &&
    (match(r.text, query) || match([r.employee, r.manager, r.day, r.shift].join(' '), query))
  ), [entries, employee, manager, day, query]);
  const filteredRows = useMemo(() => (sheet?.rows || []).filter((row) => match(Object.values(row.cells).join(' '), query)), [sheet, query]);
  const filteredPdf = useMemo(() => (pdf?.lines || []).filter((line) =>
    (pdfPage === 0 || line.page === pdfPage) &&
    (pdfCategory === 'הכול' || line.category === pdfCategory) &&
    match(line.text, query)
  ), [pdf, pdfPage, pdfCategory, query]);
  const mismatch = findWeekMismatch(excel?.week, pdf?.week);
  const unsure = sheet && mapping.type === 'raw';
  const dayOptions = useMemo(() => unique(entries.map((r) => r.day)).slice(0, 500), [entries]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const hasPdf = Boolean(pdf || pdfUrl);

  function showExcelResult(result) {
    setExcel(result); setSheetName(result.sheets[0].name);
    setView('week'); setQuery(''); setEmployee(''); setManager(''); setDay('');
    setCustomMapping({}); setMappingType('auto'); setVisibleExcel(MAX_VISIBLE);
    setStatus('נטענו ' + result.sheets.length + ' גיליונות ו-' + result.cellCount.toLocaleString('he-IL') + ' תאים עם מידע.');
  }
  async function uploadExcel(file) {
    setLoadingExcel(true); setExcelError(''); setStatus('');
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('יש להעלות קובץ XLSX. קובץ XLS או CSV אינו נתמך.');
      showExcelResult(await readScheduleExcel(file));
    } catch (error) { setExcelError(error?.message || 'לא הצלחנו לקרוא את קובץ ה-Excel.'); }
    finally { setLoadingExcel(false); }
  }
  function loadClipboardTable(text) {
    setExcelError(''); setStatus('');
    try {
      const result = readScheduleClipboard(text);
      showExcelResult(result);
      setPasteText(''); setShowClipboardInput(false);
    } catch (error) {
      setExcelError(error?.message || 'לא הצלחנו לפענח את הטבלה שהועתקה.');
      setShowClipboardInput(true);
    }
  }
  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('הדפדפן אינו תומך בקריאת הלוח ישירות.');
      const text = await navigator.clipboard.readText();
      loadClipboardTable(text);
    } catch {
      setShowClipboardInput(true);
      setExcelError('לא ניתן לקרוא את הלוח ישירות. אפשר להדביק ידנית בתיבה שלמטה באמצעות Ctrl+V.');
    }
  }
  function clearExcel() {
    setExcel(null); setSheetName(''); setExcelError(''); setEmployee(''); setManager(''); setDay(''); setStatus('');
    setPasteText(''); setShowClipboardInput(false);
  }
  function clearPdf() {
    requestRef.current += 1;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setPdfUrl(''); setPdf(null); setPdfError(''); setShowPdfPreview(false); setLoadingPdf(false);
  }
  async function uploadPdf(file) {
    clearPdf();
    const request = requestRef.current;
    setPdfError(''); setLoadingPdf(true);
    if (!/\.pdf$/i.test(file.name)) { setPdfError('יש לבחור קובץ PDF.'); setLoadingPdf(false); return; }
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setPdfUrl(url);
    try {
      const result = await readPdf(file, (n, total) => { if (request === requestRef.current) setStatus('מנתח PDF: עמוד ' + n + ' מתוך ' + total); });
      if (request !== requestRef.current) return;
      setPdf(result);
      setPdfCategory('הכול'); setPdfPage(0); setVisiblePdf(MAX_VISIBLE);
      setStatus('נטענו ' + result.pages.length + ' עמודי PDF. ניתן לחפש בכל התוכן או לפתוח את המקור.');
    } catch (error) { if (request === requestRef.current) setPdfError(error?.message || 'ניתוח ה-PDF נכשל; אפשר עדיין לפתוח את קובץ המקור.'); }
    finally { if (request === requestRef.current) setLoadingPdf(false); }
  }

  const setSheet = (name) => {
    setSheetName(name); setMappingType('auto'); setCustomMapping({}); setEmployee(''); setManager(''); setDay(''); setVisibleExcel(MAX_VISIBLE);
  };
  function updateMapping(key, value) {
    setMappingType('table'); setCustomMapping((old) => ({ ...old, rowNumber: old.rowNumber ?? guessedMapping.rowNumber ?? 1,
      employee: old.employee ?? (guessedMapping.type === 'table' ? String(guessedMapping.employee ?? '') : ''),
      manager: old.manager ?? (guessedMapping.type === 'table' ? String(guessedMapping.manager ?? '') : ''),
      shift: old.shift ?? (guessedMapping.type === 'table' ? String(guessedMapping.shift ?? '') : ''),
      day: old.day ?? (guessedMapping.type === 'table' ? String(guessedMapping.day ?? '') : ''), [key]: value }));
    setEmployee(''); setManager(''); setDay('');
  }

  return <section className="card schedule-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">SHIFT CENTER</p><h2>סידור עבודה ומשימות</h2></div></div>
    <p className="schedule-intro">אפשר להעלות XLSX או להדביק טבלת משמרות שהועתקה מ-Excel. בנוסף ניתן לצרף PDF של המייל להנחיות, הדרכות ועבודות יזומות (אופציונלי).</p>
    <div className="schedule-imports">
      <FileDrop title="סידור Excel" hint="XLSX או הדבקה מהלוח" icon="▦" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" filename={excel?.filename} onFile={uploadExcel} onClear={clearExcel}>
        <div className="schedule-paste-actions">
          <button type="button" className="schedule-file-button" onClick={pasteFromClipboard}>📋 הדבק טבלת Excel מהלוח</button>
          <button type="button" className="schedule-paste-toggle" onClick={() => { setShowClipboardInput((value) => !value); setExcelError(''); }}>{showClipboardInput ? 'סגור הדבקה ידנית' : 'הדבקה ידנית (Ctrl+V)'}</button>
        </div>
        <small className="schedule-help">ב-Excel בחר את כל טבלת הסידור, לחץ Ctrl+C ואז על כפתור ההדבקה. העיצוב והצבעים אינם מועתקים.</small>
        {showClipboardInput && <div className="schedule-paste-manual">
          <textarea aria-label="תוכן טבלת Excel מהלוח" dir="auto" rows={5} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="לחץ כאן והדבק את כל טבלת Excel באמצעות Ctrl+V..." />
          <button type="button" className="schedule-file-button" disabled={!pasteText.trim()} onClick={() => loadClipboardTable(pasteText)}>ייבא את הטבלה שהודבקה</button>
        </div>}
      </FileDrop>
      <FileDrop title="מייל / PDF" hint="PDF · אופציונלי" icon="▤" accept=".pdf,application/pdf" filename={pdf?.name || (pdfUrl ? 'PDF נטען' : '')} onFile={uploadPdf} onClear={clearPdf} />
    </div>
    <p className="schedule-local">🔒 העיבוד מתבצע בדפדפן בלבד. הקבצים ותוכן הלוח אינם נשלחים לשרת ואינם נשמרים בהיסטוריית DashDash. הדבקה אפשרית רק אם מדיניות הארגון מתירה העתקה.</p>
    {(loadingExcel || loadingPdf) && <p className="schedule-status" role="status">מעבד קובץ… {status}</p>}
    {excelError && <p className="schedule-error" role="alert">{excelError}</p>}
    {pdfError && <p className="schedule-error" role="alert">{pdfError}</p>}
    {mismatch && <p className="schedule-warning" role="alert">⚠ {mismatch} מומלץ לא לשייך אירועים מה-PDF למשמרות עד לווידוא.</p>}
    {excel?.unresolvedFormulas > 0 && <p className="schedule-warning" role="alert">⚠ {excel.unresolvedFormulas} תאים מכילים נוסחה ללא תוצאה שמורה בקובץ. חובה לבדוק את ערכם באקסל המקורי.</p>}
    {status && !loadingExcel && !loadingPdf && <p className="schedule-status" role="status">{status}</p>}

    {(excel || hasPdf) && <div className="schedule-search-line">
      <label>חיפוש בכל הקבצים <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setVisibleExcel(MAX_VISIBLE); setVisiblePdf(MAX_VISIBLE); }} placeholder="שם עובד, משמרת, לקוח או משימה" /></label>
      {query && <button type="button" className="secondary-button" onClick={() => setQuery('')}>נקה חיפוש</button>}
    </div>}

    {excel && <div className="schedule-section">
      <div className="schedule-section-head"><h3>משמרות · Excel</h3><small>{excel.sheets.length} גיליונות · {excel.cellCount.toLocaleString('he-IL')} תאים</small></div>
      <div className="schedule-filter-row">
        <label>גיליון<select value={sheet?.name || ''} onChange={(e) => setSheet(e.target.value)}>{excel.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows.length} שורות)</option>)}</select></label>
        <label>תצוגה<select value={displayView} onChange={(e) => { setView(e.target.value); setVisibleExcel(MAX_VISIBLE); }}>{mapping.type === 'calendar' && <option value="week">טבלת שבוע · כמו Excel</option>}<option value="interpreted">משמרות כרשימה</option><option value="raw">כל התאים המקוריים</option></select></label>
      </div>
      {sheet && <div className="schedule-mapping">
        <div className="schedule-mapping-heading"><strong>זיהוי מבנה הגיליון</strong><select aria-label="סוג פירוש" value={mappingType} onChange={(e) => { setMappingType(e.target.value); setEmployee(''); setManager(''); setDay(''); }}><option value="auto">זיהוי אוטומטי</option><option value="table">מיפוי עמודות ידני</option><option value="raw">ללא פירוש (מקור)</option></select></div>
        <small>זוהה: {mapping.type === 'calendar' ? 'ימים בעמודות' : mapping.type === 'table' ? 'טבלת עובדים' : 'ללא זיהוי ודאי — כל השורות עדיין זמינות'}. אם השיבוץ אינו מתאים, בחרו מיפוי ידני.</small>
        {mappingType === 'table' && <div className="schedule-manual-map">
          <label>שורת כותרת<input type="number" min="0" max="1000" value={customMapping.rowNumber ?? guessedMapping.rowNumber ?? 1} onChange={(e) => updateMapping('rowNumber', e.target.value)} /></label>
          {['employee', 'manager', 'day', 'shift'].map((field) => <label key={field}>{({employee:'עובד',manager:'מנהל צוות',day:'יום / תאריך',shift:'שעות / משמרת'})[field]}<select value={customMapping[field] ?? (guessedMapping.type === 'table' ? String(guessedMapping[field] ?? '') : '')} onChange={(e) => updateMapping(field, e.target.value)}><option value="">לא קיים</option>{Array.from({length:cols},(_,i) => <option value={String(i)} key={i}>{columnName(i)}</option>)}</select></label>)}
        </div>}
      </div>}
      {displayView === 'week' && <ScheduleWeekGrid sheet={sheet} mapping={mapping} query={query} setQuery={setQuery} />}
      {displayView === 'interpreted' && <>
        {(employeeOptions.length > 0 || managerOptions.length > 0 || dayOptions.length > 0) && <div className="schedule-filter-row">
          {employeeOptions.length > 0 && <label>עובד<select value={employee} onChange={(e) => { setEmployee(e.target.value); setVisibleExcel(MAX_VISIBLE); }}><option value="">כל העובדים</option>{employeeOptions.map((value) => <option key={value}>{value}</option>)}</select></label>}
          {managerOptions.length > 0 && <label>מנהל צוות<select value={manager} onChange={(e) => { setManager(e.target.value); setVisibleExcel(MAX_VISIBLE); }}><option value="">כל המנהלים</option>{managerOptions.map((value) => <option key={value}>{value}</option>)}</select></label>}
          {dayOptions.length > 0 && <label>יום / תאריך<select value={day} onChange={(e) => { setDay(e.target.value); setVisibleExcel(MAX_VISIBLE); }}><option value="">כל הימים</option>{dayOptions.map((d) => <option key={d}>{d}</option>)}</select></label>}
        </div>}
        {unsure && <p className="schedule-warning">לא זוהו עמודות העובדים והמשמרות באופן אמין. הרשומות מוצגות ללא שיוך משוער; אפשר למפות עמודות ידנית או לפתוח את תצוגת התאים המקוריים.</p>}
        <p className="schedule-count">מוצגות {Math.min(filteredEntries.length, visibleExcel)} מתוך {filteredEntries.length} רשומות · מקור: {sheet?.name}</p>
        <div className="schedule-table-scroll"><table className="schedule-table"><thead><tr><th>מקור</th><th>יום</th><th>עובד / תפקיד</th><th>מנהל צוות</th><th>משמרת / תוכן</th></tr></thead><tbody>
          {filteredEntries.slice(0, visibleExcel).map((entry, i) => <tr key={entry.source + ':' + i}><td className="schedule-source">{entry.source}</td><td>{entry.day || '—'}</td><td>{entry.employee || '—'}</td><td>{entry.manager || '—'}</td><td>{entry.shift || entry.text}</td></tr>)}
        </tbody></table></div>
        {!filteredEntries.length && <p className="schedule-empty">לא נמצאו רשומות התואמות לסינון. נסה תצוגת מקור.</p>}
        {filteredEntries.length > visibleExcel && <button type="button" className="schedule-more" onClick={() => setVisibleExcel((n) => n + MAX_VISIBLE)}>הצג עוד {Math.min(MAX_VISIBLE, filteredEntries.length - visibleExcel)} רשומות</button>}
      </>}
      {displayView === 'raw' && <>
        <p className="schedule-count">כל השורות שאינן ריקות · {Math.min(filteredRows.length, visibleExcel)} מתוך {filteredRows.length} שורות. צבעי רקע מסוימים נשמרים מהקובץ.</p>
        <div className="schedule-table-scroll"><table className="schedule-table schedule-raw"><thead><tr><th>שורה</th>{Array.from({length:cols},(_,i)=><th key={i}>{columnName(i)}</th>)}</tr></thead><tbody>
          {filteredRows.slice(0, visibleExcel).map((row)=><tr key={row.number}><td className="schedule-source">{row.number}</td>{Array.from({length:cols},(_,i)=><td key={i} style={row.colors[i] ? {backgroundColor:row.colors[i], color: '#17212f'}:undefined}>{row.cells[i] || ''}</td>)}</tr>)}
        </tbody></table></div>
        {filteredRows.length > visibleExcel && <button type="button" className="schedule-more" onClick={() => setVisibleExcel((n)=>n+MAX_VISIBLE)}>הצג עוד {Math.min(MAX_VISIBLE,filteredRows.length-visibleExcel)} שורות</button>}
      </>}
    </div>}

    {(pdf || pdfUrl) && <div className="schedule-section">
      <div className="schedule-section-head"><h3>משימות, אירועים והנחיות · PDF</h3><small>{pdf?.pages.length || '…'} עמודים</small></div>
      <p className="schedule-note">זיהוי אוטומטי של נושאים אינו תחליף לעיון במקור: טבלאות PDF מורכבות עלולות להיקרא בסדר שונה. כל שורת טקסט שזוהתה זמינה כאן, וגם ה-PDF המקורי.</p>
      <button type="button" className="schedule-more" onClick={() => setShowPdfPreview((s)=>!s)}>{showPdfPreview ? 'הסתר PDF מקורי' : 'הצג PDF מקורי (לאימות משימות)'}</button>
      {showPdfPreview && <iframe title="קובץ PDF מקורי" className="schedule-pdf-frame" src={pdfUrl} />}
      {pdf?.blankPages.length > 0 && <p className="schedule-warning">⚠ עמודים ללא טקסט קריא: {pdf.blankPages.join(', ')}. ייתכן שמדובר בסריקות או בתמונות; בדוק אותם בקובץ המקורי.</p>}
      {pdf && <>
        <div className="schedule-filter-row">
          <label>סוג תוכן<select value={pdfCategory} onChange={(e) => { setPdfCategory(e.target.value); setVisiblePdf(MAX_VISIBLE); }}>{PDF_CATEGORIES.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>עמוד<select value={pdfPage} onChange={(e) => { setPdfPage(Number(e.target.value)); setVisiblePdf(MAX_VISIBLE); }}><option value={0}>כל העמודים</option>{pdf.pages.map((page) => <option key={page.number} value={page.number}>עמוד {page.number}</option>)}</select></label>
        </div>
        <p className="schedule-count">מוצגות {Math.min(filteredPdf.length, visiblePdf)} מתוך {filteredPdf.length} שורות שחולצו · ללא מחיקה של שורות לפי סיווג</p>
        {filteredPdf.slice(0,visiblePdf).map((line)=><div key={line.id} className="schedule-pdf-line"><div className="schedule-pdf-line-head"><span>עמוד {line.page}</span><span>{line.category}</span></div><p dir="auto">{line.text}</p></div>)}
        {!filteredPdf.length && <p className="schedule-empty">לא נמצאו שורות התואמות לחיפוש. בחר "הכול" או פתח את המקור.</p>}
        {filteredPdf.length > visiblePdf && <button type="button" className="schedule-more" onClick={()=>setVisiblePdf((n)=>n+MAX_VISIBLE)}>הצג עוד {Math.min(MAX_VISIBLE,filteredPdf.length-visiblePdf)} שורות</button>}
      </>}
    </div>}
    {!excel && !hasPdf && <p className="schedule-empty">אפשר להדביק טבלת Excel מהלוח או להעלות קובץ XLSX. אפשר להוסיף PDF של המייל בהמשך, אם יש.</p>}
  </section>;
}
