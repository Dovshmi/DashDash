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
  const [apiKey,setApiKey] = useState('');
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const controllerRef = useRef(null);
  const parsed = useMemo(()=>parseIsraeliPhone(input),[input]);
  const links = useMemo(()=>parsed?externalPhoneLinks(parsed):null,[parsed?.national]);
  const shownResult = parsed && result?.number === parsed.national ? result : null;

  useEffect(()=>()=>controllerRef.current?.abort(),[]);

  function updateInput(value) {
    controllerRef.current?.abort();
    controllerRef.current = null;
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

  async function lookUp(event) {
    event.preventDefault();
    if (!parsed || busy) return;
    if (!apiKey.trim()) {
      setError('כדי לקבל שם בתוך DashDash, צור מפתח API חינמי של Numbers Online והזן אותו.');
      return;
    }
    setBusy(true);setError('');setResult(null);setMessage('');
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(()=>controller.abort(),11000);
    try {
      const response = await fetch('/api/phone-lookup',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({number:parsed.national,apiKey:apiKey.trim()}),
        cache:'no-store',
        signal:controller.signal
      });
      let data;
      try {data = await response.json();} catch {throw new Error('השרת לא החזיר תשובת JSON תקינה.');}
      if (!response.ok) {
        const translated = ERRORS[data?.error] || ('שגיאה בבדיקה: HTTP '+response.status);
        const retry = data?.error === 'provider_rate_limit' && data.retryAfter ? ' נסה שוב בעוד '+data.retryAfter+' שניות.' : '';
        throw new Error(translated+retry);
      }
      if (!data || data.number !== parsed.national) throw new Error('התקבלה תשובה לא תואמת מהשרת.');
      setResult(data);
    } catch(ex) {
      if (ex.name !== 'AbortError' || controllerRef.current === controller) {
        setError(ex.name === 'AbortError' ? 'החיפוש הופסק או התארך מדי.' : ex.message);
      }
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
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
      <summary>זיהוי שם ישירות ב־DashDash · API חינמי (אופציונלי)</summary>
      <div className="phone-api-content">
        <p>Numbers Online מציע מכסה חינמית של עד 50 בדיקות ביום (10 בדקה). השירות עשוי להחזיר שם, סוג קו ומפעיל — רק אם המידע זמין, ולא בהכרח לכל מספר ישראלי.</p>
        <a className="phone-free-key-link" href="https://numbers.online/developers" target="_blank" rel="noopener noreferrer">צור מפתח אישי בחינם באתר הספק ↗</a>
        <form onSubmit={lookUp} className="phone-api-form">
          <label className="phone-field">מפתח API אישי
            <input type="password" dir="ltr" autoComplete="off" spellCheck="false"
              aria-label="Numbers Online API key" placeholder="nol_..."
              value={apiKey} onChange={event=>setApiKey(event.target.value)}
            />
          </label>
          <button type="submit" className="primary-button" disabled={!parsed || busy}>
            {busy?'מחפש שם...':'חפש שם דרך API'}
          </button>
        </form>
        <p className="phone-api-privacy">המפתח נשמר בזיכרון העמוד בלבד עד לסגירה או רענון. הוא נשלח דרך שרת DashDash אל הספק לצורך הבדיקה בלבד, ולא נשמר על ידי DashDash. המספר נשלח לספק בכל חיפוש שאתה מפעיל.</p>
        {error && <p role="alert" className="phone-invalid">{error}</p>}
        {shownResult && <div className="phone-result" aria-live="polite">
          <small>תשובת Numbers Online · שם מתקשר אינו הוכחת זהות</small>
          <strong className="phone-result-name">{shownResult.name || 'לא נמצא שם במאגר'}</strong>
          <Row label="סוג קו" value={shownResult.lineType}/>
          <Row label="מפעיל (הקצאה מקורית)" value={shownResult.carrier}/>
          <Row label="מדינה" value={shownResult.country}/>
          <p className="phone-subnote">אם לא התקבל שם, אפשר להשתמש בחיפוש החיצוני שלמעלה. לא ננחש את זהות בעל המספר.</p>
        </div>}
      </div>
    </details>

    {message && <p className="phone-copy-status" role="status">{message}</p>}
    <p className="phone-disclaimer">כל תוצאה תלויה במקור החיצוני, ועשויה להיות ישנה או שגויה. חפש רק מספרים שיש לך סיבה לגיטימית לבדוק.</p>
  </section>;
}
