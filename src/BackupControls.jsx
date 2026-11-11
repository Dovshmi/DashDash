import { useState } from 'react';
import { createDashBackup, MAX_BACKUP_BYTES, parseDashBackup, restoreDashBackup } from './backup.js';

function saveJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupControls() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  function backup() {
    try {
      const data = createDashBackup(localStorage);
      if (!Object.keys(data.data).length) throw new Error('אין עדיין מידע מקומי לגיבוי.');
      saveJson('dashdash-backup-' + new Date().toISOString().slice(0,10) + '.json', data);
      setStatus('קובץ הגיבוי נוצר. שמור אותו במקום פרטי.');
    } catch (error) { setStatus(error.message); }
  }
  async function restore(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('קובץ הגיבוי גדול מדי.');
      const data = parseDashBackup(await file.text());
      const count = Object.keys(data).length;
      if (!window.confirm('לשחזר ' + count + ' סוגי נתונים? נתונים קיימים באותם סוגים יוחלפו. מומלץ ליצור גיבוי לפני השחזור.')) return;
      restoreDashBackup(localStorage, data);
      window.location.reload();
    } catch (error) { setStatus(error.message); }
    finally { event.target.value = ''; }
  }
  return <div className="widget-add-control">
    <button type="button" className="widget-add" onClick={() => setOpen((visible) => !visible)} aria-expanded={open}>גיבוי ושחזור</button>
    {open && <div className="widget-menu backup-menu">
      <p>גיבוי מקומי לפתקים, פקודות, קישורים ונתיבים ידניים, חלונות והגדרות. הפניות והרשאות לקבצים ותיקיות שנבחרו בדפדפן נשמרות ב־IndexedDB ואינן נכללות בגיבוי JSON; יש לבחור אותן מחדש במכשיר אחר. הקובץ עשוי להכיל מידע רגיש.</p>
      <button type="button" onClick={backup}><strong>ייצא גיבוי JSON</strong><small>הורדה ידנית למחשב</small></button>
      <label className="backup-import">ייבוא גיבוי JSON<input type="file" accept=".json,application/json" onChange={restore} /></label>
      {status && <p role="status">{status}</p>}
    </div>}
  </div>;
}
