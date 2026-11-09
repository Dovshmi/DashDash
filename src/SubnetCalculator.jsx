import { useState } from 'react';
import { calculateIpv4Subnet } from './subnet.js';

export default function SubnetCalculator() {
  const [value, setValue] = useState('192.168.1.10/24');
  let result;
  let error = '';
  try { result = calculateIpv4Subnet(value); }
  catch (exception) { error = exception.message; }
  const fields = result ? [
    ['רשת', result.network], ['Broadcast', result.broadcast],
    ['Subnet mask', result.mask], ['Wildcard', result.wildcard],
    ['טווח כתובות', result.usableRange],
    ['כתובות שמישות', result.usable.toLocaleString('en-US') + ' / ' + result.total.toLocaleString('en-US')],
  ] : [];
  return <section className="card pocket-widget-card subnet-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">SUBNET</p><h2>מחשבון רשת</h2></div></div>
    <label className="pocket-widget-label">IPv4 / CIDR
      <input dir="ltr" value={value} onChange={(event) => setValue(event.target.value)} placeholder="192.168.1.10/24" aria-label="כתובת IPv4 ו-CIDR" spellCheck={false} />
    </label>
    {error ? <p className="pocket-widget-error" role="alert">{error}</p> : <dl className="subnet-results">
      {fields.map(([label, answer]) => <div key={label}><dt>{label}</dt><dd dir="ltr">{answer}</dd></div>)}
    </dl>}
    <p className="pocket-widget-hint">מחושב בדפדפן · ללא גישה לרשת</p>
  </section>;
}
