import { useRef, useState } from 'react';
import './network-diagnostics.css';

const TABS = [
  {id:'dns', label:'DNS', title:'בדיקת רשומות DNS'},
  {id:'website', label:'Website / SSL', title:'בדיקת אתר ותעודת SSL'},
  {id:'ip', label:'IP Intelligence', title:'מידע על כתובת IP'}
];
const DEFAULT_INPUT = {dns:'example.com',website:'https://example.com',ip:'8.8.8.8'};
const ENDPOINTS = {dns:'/api/dns-lookup',website:'/api/website-check',ip:'/api/ip-intel'};
const DNS_TYPES = ['A','AAAA','MX','TXT','NS','CNAME','PTR'];
const INITIAL_RESULT = {dns:null,website:null,ip:null};
function Field({label,value}) {
  return <div className="diag-field"><span>{label}</span><strong dir="auto">{value === undefined || value === null || value === '' ? '—' : String(value)}</strong></div>;
}
function ResultHeading({children}) {return <h3 className="diag-result-title">{children}</h3>;}
function DnsResult({data}) {
  return <div className="diag-stack">
    <Field label="Query" value={data.name+' · '+data.type}/>
    {data.responses.map((response,index)=><div className="diag-result-group" key={index}>
      <ResultHeading>{response.resolver==='cloudflare'?'Cloudflare': 'Google DNS'}</ResultHeading>
      {response.error ? <p className="network-error">{response.error}</p> : <>
        <Field label="DNS response" value={response.statusText}/>
        <Field label="Authenticated data (AD)" value={response.authenticated?'Yes':'No'}/>
        {!response.records.length ? <p className="network-hint">No matching DNS answers returned.</p> :
        <div className="diag-records" dir="ltr">{response.records.map((row,i)=><div key={i} className="diag-record">
          <span className="diag-record-name">{row.name}</span>
          <strong>{row.data}</strong>
          <small>TYPE {row.type} · TTL {row.ttl}s</small>
        </div>)}</div>}
      </>}
    </div>)}
  </div>;
}
function WebsiteResult({data}) {
  const last = data.chain.at(-1);
  return <div className="diag-stack">
    <Field label="Final URL" value={data.finalUrl}/>
    <Field label="HTTP status" value={last?.status}/>
    <Field label="Response time (server)" value={last?.ms+' ms'}/>
    {data.chain.length>1 && <div className="diag-result-group">
      <ResultHeading>Redirect chain</ResultHeading>
      {data.chain.map((step,i)=><Field key={i} label={'Step '+(i+1)+' · '+step.status} value={step.url}/>)}
    </div>}
    <div className="diag-result-group">
      <ResultHeading>TLS certificate</ResultHeading>
      {last?.tls ? <>
        <Field label="Verified" value={last.tls.authorized?'Valid':'Invalid · '+(last.tls.verificationError||'unverified')}/>
        <Field label="Subject" value={last.tls.subject}/>
        <Field label="Issuer" value={last.tls.issuer}/>
        <Field label="TLS version" value={last.tls.protocol}/>
        <Field label="Expires" value={last.tls.validTo}/>
      </> : <p className="network-hint">No TLS certificate (HTTP endpoint).</p>}
    </div>
    <div className="diag-result-group">
      <ResultHeading>HTTP response headers</ResultHeading>
      {Object.entries(last?.headers||{}).length ? Object.entries(last.headers).map(([k,v])=><Field key={k} label={k} value={v}/>) :
        <p className="network-hint">No selected headers returned.</p>}
    </div>
    <p className="network-hint">{data.perspective}</p>
  </div>;
}
function IpResult({data}) {
  return <div className="diag-stack">
    <Field label="Address" value={data.ip}/>
    <Field label="Version / type" value={'IPv'+data.version+' · '+data.type}/>
    {data.public ? <>
      <Field label="ASN" value={data.asn}/>
      <Field label="AS name" value={data.asName}/>
      <Field label="Routed prefix" value={data.prefix}/>
      <Field label="Organization" value={data.organization}/>
      <Field label="Country (approximate)" value={data.country}/>
      <Field label="Reverse DNS" value={data.reverseDns}/>
      {data.warning && <p className="network-error">{data.warning}</p>}
      <p className="network-hint">Source: {data.provider}. Routing and location data may be approximate or outdated.</p>
    </> : <p className="network-hint">Special-use addresses are classified locally. No external lookup was sent.</p>}
  </div>;
}
async function apiJson(response) {
  const body = await response.text();
  let data = null;
  try {data = JSON.parse(body);} catch {}
  if (!response.ok || !data) throw new Error(data?.error || 'Request failed (HTTP '+response.status+').');
  return data;
}
export default function NetworkDiagnostics() {
  const [tab,setTab] = useState('dns');
  const [inputs,setInputs] = useState(DEFAULT_INPUT);
  const [dnsType,setDnsType] = useState('A');
  const [resolver,setResolver] = useState('cloudflare');
  const [results,setResults] = useState(INITIAL_RESULT);
  const [errors,setErrors] = useState({});
  const [loading,setLoading] = useState({});
  const [notice,setNotice] = useState('');
  const inFlight = useRef({});
  async function check(event) {
    event.preventDefault();
    const key = tab;
    if (inFlight.current[key]) return;
    const controller = new AbortController();
    inFlight.current[key] = controller;
    setLoading(prev=>({...prev,[key]:true}));
    setErrors(prev=>({...prev,[key]:null}));
    setResults(prev=>({...prev,[key]:null}));
    setNotice('');
    const body = key==='dns' ? {name:inputs.dns,type:dnsType,resolver}
      : key==='website' ? {url:inputs.website} : {ip:inputs.ip};
    const timeout = setTimeout(()=>controller.abort(),12000);
    try {
      const response = await fetch(ENDPOINTS[key], {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify(body),signal:controller.signal
      });
      const data = await apiJson(response);
      setResults(prev=>({...prev,[key]:data}));
    } catch(err) {
      setErrors(prev=>({...prev,[key]:err.name==='AbortError'?'Request timed out.':err.message}));
    } finally {
      clearTimeout(timeout);
      delete inFlight.current[key];
      setLoading(prev=>({...prev,[key]:false}));
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(results[tab],null,2));
      setNotice('התוצאות הועתקו.');
    } catch {setNotice('לא ניתן להעתיק ללוח.');}
  }
  const current = results[tab];
  return <section className="card network-card network-diag-card">
    <div className="card-heading drag-handle"><div>
      <p className="eyebrow">NETWORK DIAGNOSTICS</p>
      <h2>בדיקות רשת</h2>
    </div></div>
    <div className="diag-tabs" role="tablist" aria-label="Network diagnostics">
      {TABS.map(item=><button key={item.id} type="button" role="tab"
        aria-selected={tab===item.id} className={tab===item.id?'active':''}
        onClick={()=>{setTab(item.id);setNotice('');}}>{item.label}</button>)}
    </div>
    <form className="diag-form" onSubmit={check}>
      <label className="network-label">{TABS.find(item=>item.id===tab).title}
        <input dir="ltr" spellCheck="false" value={inputs[tab]}
          aria-label={tab==='ip'?'IP address':tab==='dns'?'DNS hostname':'Website URL'}
          onChange={e=>{setInputs(prev=>({...prev,[tab]:e.target.value}));setResults(prev=>({...prev,[tab]:null}));setErrors(prev=>({...prev,[tab]:null}));}}
          placeholder={DEFAULT_INPUT[tab]} required />
      </label>
      {tab==='dns' && <div className="diag-options">
        <label className="network-label">סוג רשומה
          <select value={dnsType} onChange={e=>{setDnsType(e.target.value);setResults(prev=>({...prev,dns:null}));}}>
            {DNS_TYPES.map(type=><option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="network-label">DNS Resolver
          <select value={resolver} onChange={e=>{setResolver(e.target.value);setResults(prev=>({...prev,dns:null}));}}>
            <option value="cloudflare">Cloudflare</option>
            <option value="google">Google</option>
            <option value="compare">Compare both</option>
          </select>
        </label>
      </div>}
      <button className="primary-button" type="submit" disabled={Boolean(loading[tab])}>
        {loading[tab]?'בודק...':'בדוק'}
      </button>
    </form>
    {errors[tab] && <p className="network-error" role="alert">{errors[tab]}</p>}
    {current && <div className="diag-results" aria-live="polite">
      <div className="diag-result-header">
        <span>{new Date(current.checkedAt).toLocaleString('he-IL')}</span>
        <button className="secondary-button" type="button" onClick={copy}>העתק תוצאות</button>
      </div>
      {tab==='dns'?<DnsResult data={current}/>:tab==='website'?<WebsiteResult data={current}/>:<IpResult data={current}/>}
    </div>}
    {notice && <p role="status" className="network-hint">{notice}</p>}
    <p className="network-hint">בדיקות חיצוניות מתבצעות משרתי DashDash, לא מהרשת המקומית שלך. אין סריקות אוטומטיות.</p>
  </section>;
}
