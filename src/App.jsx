import { useEffect, useRef, useState } from 'react';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import { verticalCompactor } from 'react-grid-layout/core';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { createDefaultDashboardLayout, formatAlertDuration, formatDuration, formatPersonalTotal, formatSessionDuration, keyboardTranslate, normalizeDashboardLayout, normalizeWidgetIds, removeHistoryItem, shouldSendPersonalTimeAlert, toDateKey } from './utils.js';

const STORAGE = {
  notes: 'work-tools:notes',
  sessions: 'work-tools:personal-sessions',
  translations: 'work-tools:translation-history',
  drawing: 'work-tools:drawing',
  layout: 'work-tools:dashboard-layout-v3',
  widgets: 'work-tools:active-widgets-v1',
  mobileLayout: 'work-tools:mobile-dashboard-layout-v2',
  mobileWidgets: 'work-tools:mobile-active-widgets-v1',
  timeAlert: 'work-tools:time-alert-settings-v1',
};
const BSMART_URL = 'https://smartest/';
const WIDGETS = [
  { id: 'translate', name: 'Translate', description: 'תיקון שפת מקלדת' },
  { id: 'timer', name: 'זמן אישי', description: 'מדידת זמן והיסטוריה' },
  { id: 'notes', name: 'דף קשקוש', description: 'פתקים מהירים', repeatable: true },
  { id: 'drawing', name: 'כתיבה וציור', description: 'לוח ציור', repeatable: true },
];
const WIDGET_IDS = WIDGETS.map((widget) => widget.id);
const DASHBOARD_LAYOUT = [
  { i: 'timer', x: 0, y: 0, w: 6, h: 11, minW: 3, minH: 7 },
  { i: 'translate', x: 6, y: 0, w: 6, h: 11, minW: 3, minH: 7 },
  { i: 'notes', x: 0, y: 11, w: 6, h: 14, minW: 4, minH: 6 },
  { i: 'drawing', x: 6, y: 11, w: 6, h: 14, minW: 5, minH: 10 },
];

const MOBILE_WIDGET_IDS = ['timer', 'notes', 'drawing'];
const MOBILE_DASHBOARD_LAYOUT = [
  { i: 'timer', x: 0, y: 0, w: 4, h: 11, minW: 1, minH: 7 },
  { i: 'notes', x: 0, y: 11, w: 4, h: 14, minW: 1, minH: 6 },
  { i: 'drawing', x: 0, y: 25, w: 4, h: 14, minW: 1, minH: 10 },
  { i: 'translate', x: 0, y: 39, w: 4, h: 11, minW: 1, minH: 7 },
];

const DEFAULT_TIMER_PRESETS = [
  { id: 'personal', name: 'זמן אישי', minutes: 6, seconds: 0 },
  { id: 'break', name: 'זמן הפסקה', minutes: 26, seconds: 0 },
];

function load(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeTimerSettings(saved) {
  const savedPresets = Array.isArray(saved?.presets) ? saved.presets : [];
  const presets = savedPresets
    .filter((preset) => preset && typeof preset.id === 'string')
    .map((preset, index) => ({
      id: preset.id,
      name: typeof preset.name === 'string' && preset.name.trim() ? preset.name : `זמן ${index + 1}`,
      minutes: clampInteger(preset.minutes, 0, 999),
      seconds: clampInteger(preset.seconds, 0, 59),
    }));
  const normalizedPresets = presets.length ? presets : DEFAULT_TIMER_PRESETS.map((preset) => ({ ...preset }));
  const selectedPresetId = normalizedPresets.some((preset) => preset.id === saved?.selectedPresetId)
    ? saved.selectedPresetId
    : normalizedPresets[0].id;
  return {
    recipientEmail: typeof saved?.recipientEmail === 'string' ? saved.recipientEmail : '',
    presets: normalizedPresets,
    selectedPresetId,
  };
}

function presetSeconds(preset) {
  if (!preset) return 0;
  return clampInteger(preset.minutes, 0, 999) * 60 + clampInteger(preset.seconds, 0, 59);
}

function formatClock(iso) {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

function DrawingBoard({ widgetId }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const drawingStorageKey = widgetId === 'drawing' ? STORAGE.drawing : `${STORAGE.drawing}:${widgetId}`;
  const [color, setColor] = useState('#1e293b');
  const [size, setSize] = useState(4);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const saved = localStorage.getItem(drawingStorageKey);
    if (saved) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = saved;
    }
  }, [drawingStorageKey]);

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
    localStorage.setItem(drawingStorageKey, canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    if (!window.confirm('לנקות את כל הציור?')) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem(drawingStorageKey);
  }

  return <section className="card drawing-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">קשקוש</p><h2>כתיבה וציור</h2></div><span className="save-note">נשמר בדפדפן</span></div>
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
  const [notesById, setNotesById] = useState(() => {
    const savedNotes = load(STORAGE.notes, '');
    return typeof savedNotes === 'string' ? { notes: savedNotes } : savedNotes && typeof savedNotes === 'object' ? savedNotes : {};
  });
  const [sessions, setSessions] = useState(() => load(STORAGE.sessions, []));
  const [translations, setTranslations] = useState(() => load(STORAGE.translations, []));
  const [startedAt, setStartedAt] = useState(null);
  const [runningPreset, setRunningPreset] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [timerSettings, setTimerSettings] = useState(() => normalizeTimerSettings(load(STORAGE.timeAlert, null)));
  const [timeAlertStatus, setTimeAlertStatus] = useState('');
  const sentAlertSessionRef = useRef(null);
  const [translation, setTranslation] = useState('');
  const [message, setMessage] = useState('');
  const [showTranslationHistory, setShowTranslationHistory] = useState(false);
  const [showTimerHistory, setShowTimerHistory] = useState(false);
  const [showTimeAlertSettings, setShowTimeAlertSettings] = useState(false);
  const [activeWidgetIds, setActiveWidgetIds] = useState(() => normalizeWidgetIds(load(STORAGE.widgets, null), WIDGET_IDS));
  const [mobileWidgetIds, setMobileWidgetIds] = useState(() => normalizeWidgetIds(load(STORAGE.mobileWidgets, MOBILE_WIDGET_IDS), WIDGET_IDS));
  const [showWidgetMenu, setShowWidgetMenu] = useState(false);
  const [layout, setLayout] = useState(() => normalizeDashboardLayout(load(STORAGE.layout, null), DASHBOARD_LAYOUT, activeWidgetIds));
  const [mobileLayout, setMobileLayout] = useState(() => normalizeDashboardLayout(load(STORAGE.mobileLayout, null), MOBILE_DASHBOARD_LAYOUT, mobileWidgetIds));
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1180 });
  const isMobile = width <= 700;
  const currentWidgetIds = isMobile ? mobileWidgetIds : activeWidgetIds;
  const currentLayout = isMobile ? mobileLayout : layout;
  const currentTemplates = isMobile ? MOBILE_DASHBOARD_LAYOUT : DASHBOARD_LAYOUT;
  const selectedPreset = timerSettings.presets.find((preset) => preset.id === timerSettings.selectedPresetId) ?? timerSettings.presets[0];
  const timerPreset = runningPreset ?? selectedPreset;
  const timerThresholdSeconds = presetSeconds(timerPreset);

  useEffect(() => { localStorage.setItem(STORAGE.notes, JSON.stringify(notesById)); }, [notesById]);
  useEffect(() => { localStorage.setItem(STORAGE.sessions, JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem(STORAGE.translations, JSON.stringify(translations)); }, [translations]);
  useEffect(() => { localStorage.setItem(STORAGE.layout, JSON.stringify(layout)); }, [layout]);
  useEffect(() => { localStorage.setItem(STORAGE.mobileLayout, JSON.stringify(mobileLayout)); }, [mobileLayout]);
  useEffect(() => { localStorage.setItem(STORAGE.widgets, JSON.stringify(activeWidgetIds)); }, [activeWidgetIds]);
  useEffect(() => { localStorage.setItem(STORAGE.mobileWidgets, JSON.stringify(mobileWidgetIds)); }, [mobileWidgetIds]);
  useEffect(() => { localStorage.setItem(STORAGE.timeAlert, JSON.stringify(timerSettings)); }, [timerSettings]);
  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const today = toDateKey(new Date());
  const todaySessions = sessions.filter((session) => toDateKey(new Date(session.startedAt)) === today);
  const elapsed = startedAt ? now - new Date(startedAt).getTime() : 0;

  useEffect(() => {
    if (!startedAt) {
      sentAlertSessionRef.current = null;
      setTimeAlertStatus('');
      return;
    }
    if (!shouldSendPersonalTimeAlert({
      elapsedMilliseconds: elapsed,
      thresholdSeconds: timerThresholdSeconds,
      recipientEmail: timerSettings.recipientEmail,
      alreadySent: sentAlertSessionRef.current === startedAt,
    })) return;

    sentAlertSessionRef.current = startedAt;
    setTimeAlertStatus('שולח התראה למייל...');
    fetch('/api/send-time-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientEmail: timerSettings.recipientEmail,
        thresholdSeconds: timerThresholdSeconds,
        timerName: timerPreset?.name ?? 'זמן אישי',
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error);
        setTimeAlertStatus('התראת המייל נשלחה.');
      })
      .catch(() => setTimeAlertStatus('לא הצלחנו לשלוח התראה. בדוק את הגדרת שירות המייל.'));
  }, [elapsed, startedAt, timerPreset, timerSettings.recipientEmail, timerThresholdSeconds]);
  const availableWidgets = WIDGETS.filter((widget) => widget.repeatable || !currentWidgetIds.includes(widget.id));

  function addWidget(type) {
    const definition = WIDGETS.find((widget) => widget.id === type);
    if (!definition) return;
    const widgetId = definition.repeatable ? `${type}:${crypto.randomUUID()}` : type;
    const setWidgetIds = isMobile ? setMobileWidgetIds : setActiveWidgetIds;
    const setCurrentLayout = isMobile ? setMobileLayout : setLayout;
    setWidgetIds((current) => current.includes(widgetId) ? current : [...current, widgetId]);
    setCurrentLayout((current) => {
      if (current.some((item) => item.i === widgetId)) return current;
      const template = currentTemplates.find((item) => item.i === type);
      const nextY = Math.max(0, ...current.map((item) => item.y + item.h));
      return [...current, { ...template, i: widgetId, x: 0, y: nextY }];
    });
    setShowWidgetMenu(false);
  }

  function removeWidget(id) {
    const setWidgetIds = isMobile ? setMobileWidgetIds : setActiveWidgetIds;
    const setCurrentLayout = isMobile ? setMobileLayout : setLayout;
    setWidgetIds((current) => current.filter((widgetId) => widgetId !== id));
    setCurrentLayout((current) => current.filter((item) => item.i !== id));
  }

  function resetDashboard() {
    if (isMobile) {
      setMobileWidgetIds(MOBILE_WIDGET_IDS);
      setMobileLayout(createDefaultDashboardLayout(MOBILE_WIDGET_IDS, MOBILE_DASHBOARD_LAYOUT));
      return;
    }
    setLayout(createDefaultDashboardLayout(activeWidgetIds, DASHBOARD_LAYOUT));
  }

  function updatePreset(id, patch) {
    setTimerSettings((current) => ({
      ...current,
      presets: current.presets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset),
    }));
  }

  function addTimerPreset() {
    const id = `custom:${crypto.randomUUID()}`;
    setTimerSettings((current) => ({
      ...current,
      presets: [...current.presets, { id, name: 'זמן חדש', minutes: 10, seconds: 0 }],
      selectedPresetId: id,
    }));
  }

  function removeTimerPreset(id) {
    if (startedAt || !id.startsWith('custom:')) return;
    setTimerSettings((current) => {
      const presets = current.presets.filter((preset) => preset.id !== id);
      return {
        ...current,
        presets,
        selectedPresetId: current.selectedPresetId === id ? presets[0].id : current.selectedPresetId,
      };
    });
  }

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
      if (!selectedPreset || presetSeconds(selectedPreset) <= 0) {
        setTimeAlertStatus('יש להגדיר זמן גדול מאפס.');
        return;
      }
      sentAlertSessionRef.current = null;
      setTimeAlertStatus('');
      setRunningPreset({ ...selectedPreset });
      setStartedAt(new Date().toISOString());
      setNow(Date.now());
      return;
    }
    const endedAt = new Date().toISOString();
    setSessions((current) => [{
      id: crypto.randomUUID(),
      startedAt,
      endedAt,
      timerName: runningPreset?.name ?? selectedPreset?.name ?? 'זמן אישי',
      presetId: runningPreset?.id ?? selectedPreset?.id,
    }, ...current]);
    setStartedAt(null);
    setRunningPreset(null);
    setNow(Date.now());
  }

  return <main className="app-shell">
    <header className="topbar">
      <div><h1>דאש דאש</h1></div>
      <div className="topbar-actions">
        <span className="layout-hint">גרור כותרת · החלונות יסתדרו בלי חפיפה</span>
        <button className="layout-reset" onClick={resetDashboard}>איפוס חלונות</button>
        <div className="widget-add-control">
          <button className="widget-add" onClick={() => setShowWidgetMenu((visible) => !visible)} aria-expanded={showWidgetMenu}>＋ הוספה</button>
          {showWidgetMenu && <div className="widget-menu">
            {availableWidgets.length === 0 ? <p>כל הכלים כבר מוצגים.</p> : availableWidgets.map((widget) => <button key={widget.id} onClick={() => addWidget(widget.id)}><strong>{widget.name}</strong><small>{widget.description}</small></button>)}
          </div>}
        </div>
        <button className="bsmart" onClick={() => window.open(BSMART_URL, '_blank', 'noopener,noreferrer')}>BSMART ↗</button>
      </div>
    </header>

    <div ref={containerRef} className="dashboard-shell">
      {mounted && <ReactGridLayout
        layout={currentLayout}
        width={width}
        gridConfig={isMobile ? { cols: 4, rowHeight: 28, margin: [12, 12], containerPadding: [0, 0] } : { cols: 12, rowHeight: 32, margin: [14, 14], containerPadding: [0, 0] }}
        dragConfig={{ enabled: true, bounded: true, handle: '.drag-handle' }}
        resizeConfig={{ enabled: true, handles: ['se'] }}
        compactor={verticalCompactor}
        onLayoutChange={isMobile ? setMobileLayout : setLayout}
        className="dashboard-grid"
      >
      {currentWidgetIds.includes('translate') && <div key="translate" className="dashboard-widget"><button className="widget-remove" onClick={() => removeWidget('translate')} aria-label="הסר כלי תיקון שפת מקלדת" title="הסר כלי">×</button><section className="card translate-card">
        <div className="card-heading drag-handle"><div><p className="eyebrow">TRANSLATE</p><h2>תיקון שפת מקלדת</h2></div></div>
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
      </section></div>}

      {currentWidgetIds.includes('timer') && <div key="timer" className="dashboard-widget"><button className="widget-remove" onClick={() => removeWidget('timer')} aria-label="הסר כלי זמן אישי" title="הסר כלי">×</button><button className="widget-settings" onClick={() => setShowTimeAlertSettings((visible) => !visible)} aria-expanded={showTimeAlertSettings} aria-controls="time-alert-popup" aria-label="הגדרות זמנים והתראת מייל" title="הגדרות זמנים והתראת מייל">⚙</button><section className="card timer-card">
        <div className="card-heading drag-handle"><div><p className="eyebrow">זמן אישי</p><h2>מד זמן בלחיצה</h2></div><select className={startedAt ? 'timer-preset-select running' : 'timer-preset-select'} value={timerSettings.selectedPresetId} disabled={Boolean(startedAt)} onChange={(event) => setTimerSettings((current) => ({ ...current, selectedPresetId: event.target.value }))} aria-label="בחירת סוג הזמן">{timerSettings.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {formatAlertDuration(presetSeconds(preset))}</option>)}</select></div>
        <div className="timer">{formatDuration(elapsed)}</div>
        <button className={startedAt ? 'stop-button' : 'primary-button'} onClick={toggleTimer}>{startedAt ? `סיים ${timerPreset?.name ?? 'זמן'}` : `התחל ${selectedPreset?.name ?? 'זמן'}`}</button>
        <div className="summary"><span>סה״כ זמן היום</span><strong>{formatPersonalTotal(todaySessions)}</strong></div>
        <button className="history-toggle" onClick={() => setShowTimerHistory((visible) => !visible)} aria-expanded={showTimerHistory}>
          <span className="sr-only">היסטוריית זמן ({sessions.length})</span><span className={showTimerHistory ? 'arrow open' : 'arrow'}>⌄</span>
        </button>
        {showTimerHistory && <div className="history-panel">
          {sessions.length === 0 ? <p className="empty-history">עדיין אין זמנים בהיסטוריה.</p> : <ul className="personal-history">
            {sessions.map((session) => <li key={session.id}>
              <button className="history-delete" onClick={() => removeSession(session.id)} aria-label="מחק זמן זה" title="מחק">×</button>
              <small>{formatDate(session.startedAt)} · {session.timerName ?? 'זמן אישי'}</small>
              <div className="personal-time-row"><span>התחלה <b>{formatClock(session.startedAt)}</b></span><span>סיום <b>{formatClock(session.endedAt)}</b></span><strong>{formatSessionDuration(session)}</strong></div>
            </li>)}
          </ul>}
        </div>}
      </section>
      {showTimeAlertSettings && <aside id="time-alert-popup" className="time-alert-popup timer-settings-popup" aria-label="הגדרות זמנים והתראת מייל">
        <div className="time-alert-popup-heading"><h3>זמנים והתראת מייל</h3><button onClick={() => setShowTimeAlertSettings(false)} aria-label="סגור הגדרות" title="סגור">×</button></div>
        <div className="timer-presets-settings">
          {timerSettings.presets.map((preset) => <div className="timer-preset-row" key={preset.id}>
            <input className="timer-preset-name" type="text" value={preset.name} disabled={Boolean(startedAt)} onChange={(event) => updatePreset(preset.id, { name: event.target.value })} aria-label="שם הזמן" />
            <div className="timer-duration-fields" dir="ltr">
              <input type="text" inputMode="numeric" maxLength="3" value={String(preset.minutes).padStart(2, '0')} disabled={Boolean(startedAt)} onFocus={(event) => event.target.select()} onChange={(event) => updatePreset(preset.id, { minutes: clampInteger(event.target.value.replace(/\D/g, ''), 0, 999) })} aria-label={`דקות עבור ${preset.name}`} />
              <span>:</span>
              <input type="text" inputMode="numeric" maxLength="2" value={String(preset.seconds).padStart(2, '0')} disabled={Boolean(startedAt)} onFocus={(event) => event.target.select()} onChange={(event) => updatePreset(preset.id, { seconds: clampInteger(event.target.value.replace(/\D/g, ''), 0, 59) })} aria-label={`שניות עבור ${preset.name}`} />
            </div>
            {preset.id.startsWith('custom:') && <button className="timer-preset-delete" disabled={Boolean(startedAt)} onClick={() => removeTimerPreset(preset.id)} aria-label={`מחק ${preset.name}`} title="מחק זמן">×</button>}
          </div>)}
          <button className="timer-preset-add" disabled={Boolean(startedAt)} onClick={addTimerPreset}>＋ הוסף זמן</button>
        </div>
        <label className="timer-email-setting">כתובת מייל<input type="email" value={timerSettings.recipientEmail} onChange={(event) => setTimerSettings((current) => ({ ...current, recipientEmail: event.target.value }))} placeholder="you@example.com" /></label>
        <p>{startedAt ? 'הזמן שנבחר נעול עד לעצירת הטיימר.' : 'הבחירה וההגדרות נשמרות בדפדפן הזה.'}</p>
        {timeAlertStatus && <p className="time-alert-status" role="status">{timeAlertStatus}</p>}
      </aside>}
      </div>}

      {currentWidgetIds.filter((widgetId) => widgetId.split(':', 1)[0] === 'notes').map((widgetId) => <div key={widgetId} className="dashboard-widget"><button className="widget-remove" onClick={() => removeWidget(widgetId)} aria-label="הסר כלי דף קשקוש" title="הסר כלי">×</button><section className="card notes-card">
        <div className="card-heading drag-handle"><div><p className="eyebrow">NOTES</p><h2>דף קשקוש</h2></div><span className="save-note">נשמר אוטומטית</span></div>
        <textarea aria-label="דף קשקוש לכתיבה" value={notesById[widgetId] ?? ''} onChange={(event) => setNotesById((current) => ({ ...current, [widgetId]: event.target.value }))} placeholder="כתוב כאן כל מה שצריך..." />
      </section></div>)}
      {currentWidgetIds.filter((widgetId) => widgetId.split(':', 1)[0] === 'drawing').map((widgetId) => <div key={widgetId} className="dashboard-widget"><button className="widget-remove" onClick={() => removeWidget(widgetId)} aria-label="הסר כלי כתיבה וציור" title="הסר כלי">×</button><DrawingBoard widgetId={widgetId} /></div>)}
      </ReactGridLayout>}
    </div>
    <footer>המידע נשמר מקומית בדפדפן הזה בלבד.</footer>
  </main>;
}
