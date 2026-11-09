import { useEffect, useState } from 'react';
import { sortPortResults } from './port-results.js';
import { portServiceLabel, readNetworkTargets, rememberNetworkTarget, sortNetworkTargets, toggleNetworkFavorite } from './network-utils.js';

const MAC_PATTERN = /^(?:[0-9a-f]{12}|(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}|[0-9a-f]{4}(?:\.[0-9a-f]{4}){2})$/i;
const NORMALIZE = (mac) => mac.replace(/[:-]|\./g, '').toUpperCase();
const cleanMac = (mac) => {
  const text = mac.trim();
  if (!MAC_PATTERN.test(text) || (text.includes(':') && text.includes('-'))) return null;
  return NORMALIZE(text);
};
function exportResults(results) {
  const escape = (value) => '"' + String(value ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'$&") + '"';
  const csv = [['MAC', 'Vendor', 'Registry'], ...results.map((x) => [x.mac, x.vendor, x.registry])].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'mac-results.csv'; a.click();
  URL.revokeObjectURL(url);
}
async function readApiJson(response) {
  const body = await response.text();
  let data;
  try { data = body.trim() ? JSON.parse(body) : null; } catch { /* HTML and other non-JSON errors */ }
  if (!response.ok || !data) {
    const detail = data?.error || (response.status === 404
      ? 'API endpoint missing (404). Confirm Vercel deployed the feature branch with Serverless Functions.'
      : response.status === 405 ? 'API route exists but rejected the request (405).'
      : response.status === 500 ? 'Server function failed (500). Check Vercel Runtime Logs.'
      : response.status === 503 ? 'Backend is unavailable (503).'
      : 'Backend returned ' + response.status + (body.trim() ? ' instead of valid JSON' : ' with an empty response'));
    throw new Error(detail);
  }
  return data;
}

function useTargetHistory(kind) {
  const key = 'work-tools:network-targets-' + kind + '-v1';
  const [items,setItems] = useState(() => {
    try {return readNetworkTargets(JSON.parse(localStorage.getItem(key) || '[]'));}
    catch {return [];}
  });
  useEffect(() => {try {localStorage.setItem(key,JSON.stringify(items));} catch {/* storage optional */}},[key,items]);
  return {
    items: sortNetworkTargets(items),
    remember: (target,favorite=false) => setItems((prev) => rememberNetworkTarget(prev,target,favorite)),
    toggle: (target) => setItems((prev) => toggleNetworkFavorite(prev,target)),
  };
}
function TargetHistory({items,onSelect,onToggle}) {
  if (!items.length) return null;
  return <div className="network-targets">
    <span>יעדים אחרונים · בחירת יעד לא מפעילה בדיקה</span>
    <div className="network-target-list">{items.map((target) => <div className="network-target" key={target.value}>
      <button type="button" dir="ltr" title="בחר יעד" onClick={() => onSelect(target.value)}>{target.value}</button>
      <button type="button" title={target.favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
        aria-label={target.favorite ? 'הסר יעד ממועדפים' : 'סמן יעד כמועדף'} onClick={() => onToggle(target.value)}>{target.favorite ? '★' : '☆'}</button>
    </div>)}</div>
  </div>;
}
async function copyRows(text,setMessage) {
  try {await navigator.clipboard.writeText(text);setMessage('התוצאות הועתקו.');}
  catch {setMessage('לא ניתן להעתיק. בדוק הרשאות לוח בדפדפן.');}
}

export function MacCheck() {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message,setMessage] = useState('');
  const history = useTargetHistory('mac');
  async function check() {
    const candidates = input.split(/[,;\s]+/).filter(Boolean);
    if (!candidates.length || candidates.length > 100) { setError('Enter 1–100 MAC addresses.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/mac-lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ macs: candidates }) });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'MAC lookup failed');
      setRows(data.results);
      history.remember(candidates.join(', '));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="card network-card mac-check-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">IEEE OUI</p><h2>בדיקת כתובת MAC</h2></div></div>
    <p className="network-hint">זיהוי יצרן לפי מאגר IEEE, כולל כתובות מקומיות ו־Multicast. ניתן להדביק מספר כתובות.</p>
    <textarea dir="ltr" aria-label="MAC addresses" rows="3" placeholder={'00:1A:2B:3C:4D:5E\n0011.2233.4455'} value={input} onChange={(e) => setInput(e.target.value)} />
    <TargetHistory items={history.items} onSelect={setInput} onToggle={history.toggle}/>
    <div className="network-actions"><button className="primary-button" disabled={busy} onClick={check}>{busy ? 'בודק...' : 'בדוק MAC'}</button>{rows.length > 0 && <><button className="secondary-button" onClick={() => copyRows(rows.map((x) => x.mac + ' | ' + x.vendor + ' | ' + x.registry).join('\n'),setMessage)}>העתק</button><button className="secondary-button" onClick={() => exportResults(rows)}>CSV</button></>}</div>
    {error && <p className="network-error" role="alert">{error}</p>}
    {message && <p className="network-hint" role="status">{message}</p>}
    {rows.length > 0 && <div className="network-results" dir="ltr">{rows.map((x,i) => <div className="network-result" key={i}><strong>{x.mac}</strong><span>{x.vendor}</span><small>{x.registry}</small></div>)}</div>}
  </section>;
}
const PRESETS = '21,22,23,25,53,80,110,143,443,445,3389,5900,8080,8443,8291,8728';
export function PortCheck() {
  const [ip, setIp] = useState('');
  const [ports, setPorts] = useState(PRESETS);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const history = useTargetHistory('ports');
  async function check() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/port-check', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ ip, ports }) });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'Port check failed');
      setRows(sortPortResults(data.results));
      history.remember(ip.trim());
    } catch (e) { setError(e.message); setRows([]); } finally { setBusy(false); }
  }
  return <section className="card network-card port-check-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">TCP CONNECT</p><h2>בדיקת פורטים</h2></div></div>
    <p className="network-hint">סריקת TCP מהשרת של DashDash לכתובת IP ציבורית אחת בלבד. לא ניתן לבדוק כאן כתובות של הרשת המקומית.</p>
    <label className="network-label">כתובת IPv4 ציבורית<input dir="ltr" aria-label="Public IPv4 address" placeholder="8.8.8.8" value={ip} onChange={(e) => setIp(e.target.value)} /></label>
    <TargetHistory items={history.items} onSelect={setIp} onToggle={history.toggle}/>
    <div className="network-actions"><button type="button" className="secondary-button" onClick={() => history.remember(ip.trim(),true)} disabled={!ip.trim()} title="שמור יעד כמועדף">☆ שמור יעד</button></div>
    <label className="network-label">פורטים (פסיקים או טווחים)<input dir="ltr" aria-label="TCP ports" value={ports} onChange={(e) => setPorts(e.target.value)} /></label>
    <div className="network-actions"><button className="primary-button" disabled={busy} onClick={check}>{busy ? 'בודק...' : 'בדוק פורטים'}</button>{rows.length > 0 && <button type="button" className="secondary-button" onClick={() => copyRows(rows.map((x) => ip + ' | ' + x.port + ' | ' + portServiceLabel(x.port,x.service) + ' | ' + x.status + ' | ' + x.ms + ' ms').join('\n'),setMessage)}>העתק</button>}</div>
    {error && <p className="network-error" role="alert">{error}</p>}
    {message && <p className="network-hint" role="status">{message}</p>}
    {rows.length > 0 && <div className="network-results" dir="ltr">{rows.map((x) => <div className="network-result port-row" key={x.port}><strong>{x.port} · {portServiceLabel(x.port,x.service)}</strong><span className={'port-status '+x.status.toLowerCase()}>{x.status}</span><small>{x.ms} ms</small></div>)}</div>}
  </section>;
}
