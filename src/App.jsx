import { useEffect, useRef, useState } from 'react';
import { formatDuration, formatPersonalTotal, formatSessionDuration, keyboardTranslate, removeHistoryItem, toDateKey } from './utils.js';

const STORAGE = {
  notes: 'work-tools:notes',
  sessions: 'work-tools:personal-sessions',
  translations: 'work-tools:translation-history',
  drawing: 'work-tools:drawing',
};
const BSMART_URL = 'https://smartest/';

function load(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

function formatClock(iso) {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

function DrawingBoard() {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [color, setColor] = useState('#1e293b');
  const [size, setSize] = useState(4);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const saved = localStorage.getItem(STORAGE.drawing);
    if (saved) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = saved;
    }
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (event.clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  }

  function start(event) {
    event.preventDefault();
    const context = canvasRef.current.getContext('2d');
    const { x, y } = point(event);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(x, y);
  }

  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = canvasRef.current.getContext('2d');
    const { x, y } = point(event);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = color;
    context.lineWidth = size;
    context.lineTo(x, y);
    context.stroke();
  }

  function stop() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    localStorage.setItem(STORAGE.drawing, canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    if (!window.confirm('לנקות את כל הציור?')) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem(STORAGE.drawing);
  }

  return <section className="card drawing-card">
    <div className="card-heading"><div><p className="eyebrow">קשקוש</p><h2>כתיבה וציור</h2></div><span className="save-note">נשמר בדפדפן</span></div>
    <div className="drawing-tools">
      <label>צבע <input aria-label="צבע העט" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <label>עובי <input aria-label="עובי העט" type="range" min="1" max="22" value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
      <button className="secondary-button" onClick={clear}>נקה ציור</button>
    </div>
    <canvas ref={canvasRef} className="canvas" width="1200" height="650"
      onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} />
  </section>;
}

export default function App() {
  const [notes, setNotes] = useState(() => load(STORAGE.notes, ''));
  const [sessions, setSessions] = useState(() => load(STORAGE.sessions, []));
  const [translations, setTranslations] = useState(() => load(STORAGE.translations, []));
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [translation, setTranslation] = useState('');
  const [message, setMessage] = useState('');
  const [showTranslationHistory, setShowTranslationHistory] = useState(false);
  const [showTimerHistory, setShowTimerHistory] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE.notes, JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem(STORAGE.sessions, JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem(STORAGE.translations, JSON.stringify(translations)); }, [translations]);
  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const today = toDateKey(new Date());
  const todaySessions = sessions.filter((session) => toDateKey(new Date(session.startedAt)) === today);
  const elapsed = startedAt ? now - new Date(startedAt).getTime() : 0;

  async function translateClipboard() {
    try {
      if (!navigator.clipboard?.readText || !navigator.clipboard?.writeText) throw new Error('clipboard');
      const text = await navigator.clipboard.readText();
      if (!text) { setMessage('אין טקסט בלוח ההעתקה.'); return; }
      const converted = keyboardTranslate(text);
      await navigator.clipboard.writeText(converted);
      setTranslation(converted);
      setTranslations((current) => [{ id: crypto.randomUUID(), source: text, result: converted, createdAt: new Date().toISOString() }, ...current]);
      setMessage('הטקסט הומר והועתק ללוח ההעתקה.');
    } catch {
      setMessage('הדפדפן חסם גישה ללוח ההעתקה. אפשר הרשאת Clipboard ונסה שוב.');
    }
  }

  function removeTranslation(id) {
    setTranslations((current) => removeHistoryItem(current, id));
  }

  function removeSession(id) {
    setSessions((current) => removeHistoryItem(current, id));
  }

  function toggleTimer() {
    if (!startedAt) {
      setStartedAt(new Date().toISOString());
      setNow(Date.now());
      return;
    }
    const endedAt = new Date().toISOString();
    setSessions((current) => [{ id: crypto.randomUUID(), startedAt, endedAt }, ...current]);
    setStartedAt(null);
    setNow(Date.now());
  }

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">WORKSPACE</p><h1>כלי עבודה</h1></div>
      <button className="bsmart" onClick={() => window.open(BSMART_URL, '_blank', 'noopener,noreferrer')}>BSMART ↗</button>
    </header>

    <div className="grid">
      <section className="card translate-card">
        <div className="card-heading"><div><p className="eyebrow">TRANSLATE</p><h2>תיקון שפת מקלדת</h2></div></div>
        <p>לוחצים על הכפתור: הטקסט שב־Clipboard מומר בין עברית לאנגלית ומועתק חזרה.</p>
        <button className="primary-button" onClick={translateClipboard}>TRANSLATE מה־Clipboard</button>
        {message && <p className="status" role="status">{message}</p>}
        {translation && <div className="result"><span>תוצאה אחרונה</span><b>{translation}</b></div>}
        <button className="history-toggle" onClick={() => setShowTranslationHistory((visible) => !visible)} aria-expanded={showTranslationHistory}>
          <span className="sr-only">היסטוריית המרות ({translations.length})</span><span className={showTranslationHistory ? 'arrow open' : 'arrow'}>⌄</span>
        </button>
        {showTranslationHistory && <div className="history-panel">
          {translations.length === 0 ? <p className="empty-history">עדיין אין המרות בהיסטוריה.</p> : <ul className="translation-history">
            {translations.map((item) => <li key={item.id}>
              <button className="history-delete" onClick={() => removeTranslation(item.id)} aria-label="מחק המרה זו" title="מחק">×</button>
              <small>{formatDate(item.createdAt)} · {formatClock(item.createdAt)}</small><div><span>{item.source}</span><b>←</b><strong>{item.result}</strong></div>
            </li>)}
          </ul>}
        </div>}
      </section>

      <section className="card timer-card">
        <div className="card-heading"><div><p className="eyebrow">זמן אישי</p><h2>מד זמן בלחיצה</h2></div><span className={startedAt ? 'live-dot' : 'save-note'}>{startedAt ? 'פועל עכשיו' : 'מוכן'}</span></div>
        <div className="timer">{formatDuration(elapsed)}</div>
        <button className={startedAt ? 'stop-button' : 'primary-button'} onClick={toggleTimer}>{startedAt ? 'סיים זמן אישי' : 'התחל זמן אישי'}</button>
        <div className="summary"><span>סה״כ אישי היום</span><strong>{formatPersonalTotal(todaySessions)}</strong></div>
        <button className="history-toggle" onClick={() => setShowTimerHistory((visible) => !visible)} aria-expanded={showTimerHistory}>
          <span className="sr-only">היסטוריית זמן אישי ({sessions.length})</span><span className={showTimerHistory ? 'arrow open' : 'arrow'}>⌄</span>
        </button>
        {showTimerHistory && <div className="history-panel">
          {sessions.length === 0 ? <p className="empty-history">עדיין אין זמני אישי בהיסטוריה.</p> : <ul className="personal-history">
            {sessions.map((session) => <li key={session.id}>
              <button className="history-delete" onClick={() => removeSession(session.id)} aria-label="מחק זמן אישי זה" title="מחק">×</button>
              <small>{formatDate(session.startedAt)}</small>
              <div className="personal-time-row"><span>התחלה <b>{formatClock(session.startedAt)}</b></span><span>סיום <b>{formatClock(session.endedAt)}</b></span><strong>{formatSessionDuration(session)}</strong></div>
            </li>)}
          </ul>}
        </div>}
      </section>

      <section className="card notes-card">
        <div className="card-heading"><div><p className="eyebrow">NOTES</p><h2>דף קשקוש</h2></div><span className="save-note">נשמר אוטומטית</span></div>
        <textarea aria-label="דף קשקוש לכתיבה" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="כתוב כאן כל מה שצריך..." />
      </section>
    </div>
    <DrawingBoard />
    <footer>המידע נשמר מקומית בדפדפן הזה בלבד.</footer>
  </main>;
}
