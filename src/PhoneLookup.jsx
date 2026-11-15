import { useEffect, useMemo, useRef, useState } from 'react';
import { externalPhoneLinks, parseIsraeliPhone } from './phone-lookup-utils.js';
import './phone-lookup.css';

const ERRORS = {
  invalid_phone: 'מספר הטלפון אינו בפורמט ישראלי נתמך.',
  invalid_api_key: 'מפתח API לא תקין. צריך להדביק מפתח אישי שמתחיל ב־nol_.',
  json_required: 'בקשה לא תקינה.',
  key_rejected: 'הספק דחה את המפתח. בדוק שהוא פעיל והועתק במלואו.',
  key_not_allowed: 'למפתח אין הרשאה לבדיקת מספרים.',
  provider_payment_required: 'החשבון חורג מהמכסה החינמית או דורש תשלום אצל הספק.',
  provider_rate_limit: 'הגעת למגבלת החיפושים החינמית אצל הספק.',
  provider_unavailable: 'שירות הזיהוי אינו זמין כרגע.',
  invalid_provider_response: 'התקבלה תשובה לא תקינה מהספק.',
  provider_timeout: 'החיפוש התארך מדי. אפשר לנסות שוב.',
  request_too_large: 'הבקשה גדולה מדי.'
};
const KEY_TAB_STORAGE = 'work-tools:phone-lookup-session-key-v1';
const AUTO_LOOKUP_DELAY = 1500; // Avoid consuming a free lookup while the user is still typing.
const KEY_PATTERN = /^nol_[a-zA-Z0-9_-]{8,220}$/;
const SERVICES = [
  {id:'index',name:'THE INDEX',note:'ספר טלפונים ישראלי · שתי בדיקות חינם בביקור',main:true},
  {id:'truecaller',name:'Truecaller',note:'חיפוש שם ודיווחי ספאם · מוגבל'},
  {id:'nocall',name:'NoCall',note:'דיווחי קהילה על מספרים חשודים'},
  {id:'me',name:'Me',note:'חיפוש חינמי באפליקציה לנייד'},
  {id:'google',name:'Google',note:'חיפוש אזכורים פומביים של המספר'}
];

function Row({label,value}) {
  return <div className="phone-result-row"><span>{label}</span><strong dir="auto">{value || 'לא ידוע'}</strong></div>;
}

export default function PhoneLookup() {
  const [input,setInput] = useState('');
  const [apiKey,setApiKey] = useState(() => {
    try { return sessionStorage.getItem(KEY_TAB_STORAGE) || ''; }
    catch { return ''; }
  });
  const [rememberForTab,setRememberForTab] = useState(() => {
    try { return Boolean(sessionStorage.getItem(KEY_TAB_STORAGE)); }
    catch { return false; }
  });
  const [retryCount,setRetryCount] = useState(0);
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const lookupSequence = useRef(0);
  const parsed = useMemo(()=>parseIsraeliPhone(input),[input]);
  const links = useMemo(()=>parsed?externalPhoneLinks(parsed):null,[parsed?.national]);
  const shownResult = parsed && result?.number === parsed.national ? result : null;

  // The key is only saved in this browser tab when explicitly requested.
  // No phone number or result is stored.
  useEffect(() => {
    try {
      if (rememberForTab && KEY_PATTERN.test(apiKey.trim())) {
        sessionStorage.setItem(KEY_TAB_STORAGE, apiKey.trim());
      } else {
        sessionStorage.removeItem(KEY_TAB_STORAGE);
      }
    } catch { /* Browser storage may be disabled. */ }
  }, [rememberForTab,apiKey]);

  useEffect(() => {
    const number = parsed?.national;
    const key = apiKey.trim();
    const sequence = ++lookupSequence.current;
    if (!number || !KEY_PATTERN.test(key)) {
      setBusy(false);
      return undefined;
    }
    const controller = new AbortController();
    setBusy(false);
    setError('');
    // Delayed automatic lookup; cancelled on every edit or unmount.
    const timer = setTimeout(async () => {
      if (sequence !== lookupSequence.current) return;
      setBusy(true);
      try {
        const response = await fetch('/api/phone-lookup', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({number,apiKey:key}),
          cache:'no-store',
          signal:controller.signal
        });
        let data;
        try {data = await response.json();} catch {throw new Error('השרת לא החזיר תשובת JSON תקינה.');}
        if (!response.ok) {
          const translated = ERRORS[data?.error] || ('שגיאה בבדיקה: HTTP '+response.status);
          const retry = data?.error === 'provider_rate_limit' && data.retryAfter
            ? ' נסה שוב בעוד '+data.retryAfter+' שניות.' : '';
          throw new Error(translated+retry);
        }
        if (!data || data.number !== number) throw new Error('התקבלה תשובה לא תואמת מהשרת.');
        if (sequence === lookupSequence.current) setResult(data);
      } catch (ex) {
        if (sequence === lookupSequence.current && ex.name !== 'AbortError') {
          setError(ex.message);
        }
      } finally {
        if (sequence === lookupSequence.current) setBusy(false);
      }
    }, AUTO_LOOKUP_DELAY);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [parsed?.national,apiKey,retryCount]);

  function updateInput(value) {
    setInput(value);
    setResult(null);
    setError('');
    setBusy(false);
    setMessage('');
  }

  async function copy(text) {
    try {await navigator.clipboard.writeText(text);setMessage('המספר הועתק ללוח.');}
    catch {setMessage('ההעתקה נחסמה על ידי הדפדפן.');}
  }


  return <section className="card phone-lookup-card">
    <div className="card-heading drag-handle">
      <div><p className="eyebrow">PHONE LOOKUP · ISRAEL</p><h2>חיפוש מספר טלפון</h2></div>
    </div>
    <p className="phone-intro">בדוק מי התקשר ממקורות חיצוניים בחינם. ללא ייבוא אנשי קשר או שמירת היסטוריית חיפושים.</p>

    <label className="phone-field">מספר טלפון ישראלי
      <input dir="ltr" type="tel" inputMode="tel" autoComplete="off" spellCheck="false"
        placeholder="050-123-4567 / +972501234567"
        value={input} onChange={event=>updateInput(event.target.value)}
        aria-label="מספר טלפון ישראלי" />
    </label>

    {parsed ? <div className="phone-normalized">
      <div><small>{parsed.label}</small><strong dir="ltr">{parsed.national}</strong><span dir="ltr">{parsed.e164}</span></div>
      <button type="button" className="secondary-button" onClick={()=>copy(parsed.national)}>העתק מספר</button>
    </div> : input.trim() ? <p className="phone-invalid" role="alert">הזן מספר נייד, קווי או 07 ישראלי תקין.</p> : null}

    {parsed && <div className="phone-auto-result" aria-live="polite">
      {!KEY_PATTERN.test(apiKey.trim()) ? <>
        <strong>זיהוי שם אוטומטי אינו מופעל</strong>
        <p>לזיהוי שם בתוך DashDash יש להגדיר פעם אחת מפתח API חינמי של Numbers Online בהמשך הריבוע. החיפוש החיצוני למטה עובד גם בלי מפתח.</p>
      </> : busy ? <p className="phone-auto-progress">מחפש שם עבור <b dir="ltr">{parsed.national}</b>…</p>
      : error ? <div className="phone-auto-error">
          <p role="alert">{error}</p>
          <button type="button" className="secondary-button" onClick={()=>{setError('');setRetryCount(count=>count+1);}}>נסה שוב</button>
        </div>
      : shownResult ? <div className="phone-result">
          <small>תוצאת Numbers Online · זיהוי מתקשר אינו אימות זהות</small>
          <strong className="phone-result-name">{shownResult.name || 'לא נמצא שם במאגר'}</strong>
          <Row label="סוג קו" value={shownResult.lineType}/>
          <Row label="מפעיל (הקצאה מקורית)" value={shownResult.carrier}/>
          <Row label="מדינה" value={shownResult.country}/>
          {!shownResult.name && <p className="phone-subnote">הספק לא החזיר שם למספר הזה. אפשר להשתמש במקורות החיצוניים שלמטה.</p>}
        </div>
      : <p className="phone-auto-progress">בודק אוטומטית לאחר שההקלדה מסתיימת…</p>}
    </div>}

    <div className="phone-services">
      <div className="phone-section-title">חיפוש חיצוני ללא מפתח API</div>
      {SERVICES.map(service=><div className={'phone-service '+(service.main?'phone-service-main':'')} key={service.id}>
        <div><strong>{service.name}</strong><small>{service.note}</small></div>
        {links ? <a href={links[service.id]} target="_blank" rel="noopener noreferrer" className="phone-link"
          title={service.id==='index'?'פתיחת דף המספר ישירות':'פותח את שירות החיפוש. ייתכן שיהיה צורך להדביק מספר.'}>
          {service.main?'פתח תוצאה':'פתח אתר'} ↗
        </a> : <span className="phone-link-disabled">הזן מספר</span>}
      </div>)}
      {links && <p className="phone-subnote">THE INDEX פותח דף מספר ישיר. בשאר השירותים ייתכן שתצטרך להעתיק ולהדביק את המספר; Me מזהה מספרים באפליקציה, לא באתר החינמי.</p>}
    </div>

    <details className="phone-api-details">
      <summary>הגדרת זיהוי אוטומטי בתוך DashDash (מפתח חינמי)</summary>
      <div className="phone-api-content">
        <p>Numbers Online מציע עד 50 בדיקות חינמיות ביום, ועד 10 בדקה. אחרי הזנת מפתח תקין, DashDash יחפש לבד שם לכל מספר תקין לאחר השהיה של 1.5 שניות, כדי שלא לבזבז בדיקות בזמן הקלדה. לא מובטח שם לכל מספר בישראל.</p>
        <a className="phone-free-key-link" href="https://numbers.online/developers" target="_blank" rel="noopener noreferrer">צור מפתח אישי בחינם באתר הספק ↗</a>
        <label className="phone-field">מפתח API אישי
          <input type="password" dir="ltr" autoComplete="off" spellCheck="false"
            aria-label="Numbers Online API key" placeholder="nol_..."
            value={apiKey} onChange={event=>{setApiKey(event.target.value);setResult(null);setError('');}}
          />
        </label>
        <label className="phone-remember-label">
          <input type="checkbox" checked={rememberForTab} onChange={event=>setRememberForTab(event.target.checked)}/>
          זכור את המפתח עד לסגירת לשונית הדפדפן
        </label>
        <p className="phone-api-privacy">ברגע שהמפתח מוגדר, כל מספר תקין שתזין יישלח אוטומטית דרך שרת DashDash אל Numbers Online. המפתח אינו נשמר בשרת או בגיבוי. אפשר לשמור אותו באופן זמני בלשונית בלבד; במחשב משותף עדיף לא לסמן זאת. אין שמירת מספרים או תוצאות בדפדפן.</p>
      </div>
    </details>

    {message && <p className="phone-copy-status" role="status">{message}</p>}
    <p className="phone-disclaimer">כל תוצאה תלויה במקור החיצוני, ועשויה להיות ישנה או שגויה. חפש רק מספרים שיש לך סיבה לגיטימית לבדוק.</p>
  </section>;
}
