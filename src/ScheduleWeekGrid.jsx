import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cleanText } from './work-schedule-parser.js';
import { buildScheduleGrid, filterScheduleGridRows, readableTextOnColor, scheduleCellKind } from './schedule-grid.js';

const STEP = 120;
const distinct = (values) => [...new Set(values.map(cleanText).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

export default function ScheduleWeekGrid({ sheet, mapping, query, setQuery }) {
  const grid = useMemo(() => buildScheduleGrid(sheet, mapping), [sheet, JSON.stringify(mapping)]);
  const [manager, setManager] = useState('');
  const [employee, setEmployee] = useState('');
  const [role, setRole] = useState('');
  const [day, setDay] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(STEP);
  useEffect(() => { setManager(''); setEmployee(''); setRole(''); setDay(''); setVisible(STEP); }, [sheet]);
  useEffect(() => {
    if (!expanded) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKeyDown); };
  }, [expanded]);

  const filtered = useMemo(() => filterScheduleGridRows(grid?.rows || [], { manager, employee, role, query }), [grid, manager, employee, role, query]);
  if (!grid) return null;

  const managerOptions = distinct(grid.rows.map((r) => r.manager));
  const employeeOptions = distinct(grid.rows.map((r) => r.employee));
  const roleOptions = distinct(grid.rows.map((r) => r.role));
  const days = grid.columns.filter((column) => column.day);
  const displayedColumns = grid.columns.filter((column) => !column.day || !day || column.day === day);
  let pinRight = 42;
  let pinnedCount = 0;
  let reachedDay = false;
  const columns = displayedColumns.map((column) => {
    if (column.day) reachedDay = true;
    const pin = !reachedDay && pinnedCount < 3;
    const pinned = pin ? pinRight : null;
    if (pin) { pinRight += column.width; pinnedCount += 1; }
    return { ...column, pinned };
  });
  const tableWidth = 42 + columns.reduce((sum, col) => sum + col.width, 0);
  const shown = filtered.slice(0, visible);

  const toolbar = <div className="schedule-week-toolbar" dir="rtl">
    {managerOptions.length > 0 && <label>מנהל צוות<select value={manager} onChange={(event) => { setManager(event.target.value); setVisible(STEP); }}><option value="">כל המנהלים</option>{managerOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
    {roleOptions.length > 0 && <label>סקיל / תפקיד<select value={role} onChange={(event) => { setRole(event.target.value); setVisible(STEP); }}><option value="">כל התפקידים</option>{roleOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
    {employeeOptions.length > 0 && <label>עובד<select value={employee} onChange={(event) => { setEmployee(event.target.value); setVisible(STEP); }}><option value="">כל העובדים</option>{employeeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
    <label>תצוגת ימים<select value={day} onChange={(event) => setDay(event.target.value)}><option value="">כל השבוע</option>{days.map((column) => <option key={column.index} value={column.day}>{column.header}</option>)}</select></label>
    <button type="button" className="schedule-week-reset" onClick={() => { setManager(''); setRole(''); setEmployee(''); setDay(''); setVisible(STEP); }} disabled={!manager && !employee && !role && !day}>נקה סינון</button>
  </div>;

  const table = <>
    <p className="schedule-week-count">מוצגים {shown.length} מתוך {filtered.length} עובדים / שורות · {day || 'כל ימי השבוע'} · הסידור מוצג לפי סדר השורות המקורי</p>
    <div className="schedule-week-scroll" tabIndex={0} role="region" aria-label="טבלת סידור שבועית — גלילה אופקית ואנכית">
      <table className="schedule-week-grid" dir="rtl" style={{ minWidth: tableWidth }}>
        <colgroup><col style={{ width: 42 }} />{columns.map((col) => <col key={col.index} style={{ width: col.width }} />)}</colgroup>
        <thead><tr><th scope="col" className="schedule-week-index">#</th>
          {columns.map((col) => <th scope="col" key={col.index} className={['schedule-week-heading', col.day ? 'schedule-week-heading-day' : 'schedule-week-heading-person', col.pinned != null ? 'schedule-week-pinned' : ''].join(' ')} style={col.pinned != null ? { '--pin-right': col.pinned + 'px' } : undefined}>{col.header}</th>)}
        </tr></thead>
        <tbody>
          {shown.map((row) => <tr key={row.number}>
            <th scope="row" className="schedule-week-index">{row.number}</th>
            {columns.map((column) => {
              const value = row.cells[column.index] || '';
              const bg = row.colors?.[column.index];
              const kind = column.day ? scheduleCellKind(value) : 'person';
              const style = {
                ...(column.pinned != null ? { '--pin-right': column.pinned + 'px' } : {}),
                ...(bg ? { backgroundColor: bg, color: readableTextOnColor(bg) } : {}),
              };
              return <td key={column.index} title={value || undefined} className={['schedule-week-cell', 'schedule-week-cell-' + kind, column.pinned != null ? 'schedule-week-pinned' : '', column.field === 'employee' ? 'schedule-week-employee' : ''].join(' ')} style={style}><span dir="auto">{value || '—'}</span></td>;
            })}
          </tr>)}
        </tbody>
      </table>
      {!shown.length && <div className="schedule-week-empty">אין עובדים התואמים לסינון. אפשר לנקות את המסננים ולנסות שוב.</div>}
    </div>
    {filtered.length > visible && <button type="button" className="schedule-more" onClick={() => setVisible((count) => count + STEP)}>הצג עוד {Math.min(STEP, filtered.length - visible)} עובדים</button>}
  </>;

  return <>
    <div className="schedule-week-head">
      <div><strong>סידור שבועי</strong><small>עובד אחד בשורה · ימים בעמודות · צבעים לפי סוג משמרת</small></div>
      <button type="button" className="schedule-week-expand" onClick={() => setExpanded(true)} aria-label="פתח טבלת סידור במסך מלא">⛶ פתח במסך מלא</button>
    </div>
    {toolbar}
    {!expanded && table}
    {expanded && createPortal(<div className="schedule-week-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <section className="schedule-week-dialog" role="dialog" aria-modal="true" aria-label="סידור עבודה שבועי">
        <div className="schedule-week-dialog-head" dir="rtl"><div><h2>סידור עבודה שבועי</h2><small>טבלת המשמרות המלאה, כפי שהיא מסודרת באקסל</small></div><button type="button" onClick={() => setExpanded(false)} aria-label="סגור תצוגה מלאה">✕ סגור</button></div>
        <label className="schedule-week-modal-search" dir="rtl">חיפוש עובד, שעה או תפקיד<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(STEP); }} placeholder="חיפוש בכל הסידור" /></label>
        {toolbar}
        {table}
      </section>
    </div>, document.body)}
  </>;
}
