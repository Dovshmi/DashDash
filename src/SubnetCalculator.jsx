import { useState } from 'react';
import { calculateIpv4Subnet, splitIpv4Subnet } from './subnet.js';

export default function SubnetCalculator() {
  const [value, setValue] = useState('192.168.1.10/24');
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [childNotation, setChildNotation] = useState('/26');
  let result;
  let error = '';
  let splitResult;
  let splitError = '';
  try { result = calculateIpv4Subnet(value); }
  catch (exception) { error = exception.message; }

  if (splitEnabled && result) {
    try { splitResult = splitIpv4Subnet(result.cidr, childNotation); }
    catch (exception) { splitError = exception.message; }
  }

  const fields = result ? [
    ['רשת', result.network], ['CIDR', result.cidr], ['Broadcast', result.broadcast],
    ['Subnet mask', result.mask], ['Wildcard', result.wildcard],
    ['טווח כתובות', result.usableRange],
    ['כתובות שמישות', result.usable.toLocaleString('en-US') + ' / ' + result.total.toLocaleString('en-US')],
  ] : [];
  return <section className="card pocket-widget-card subnet-card">
    <div className="card-heading drag-handle"><div><p className="eyebrow">SUBNET</p><h2>מחשבון רשת</h2></div></div>
    <label className="pocket-widget-label">IPv4 / CIDR או Subnet Mask
      <input dir="ltr" value={value} onChange={(event) => setValue(event.target.value)}
        placeholder="192.168.1.10/24 או 192.168.1.10/255.255.255.0"
        aria-label="כתובת IPv4 עם CIDR או מסכת רשת" spellCheck={false} />
    </label>
    <p className="pocket-widget-hint">לדוגמה: 192.168.1.10/24 או 192.168.1.10/255.255.255.0</p>
    {error ? <p className="pocket-widget-error" role="alert">{error}</p> : <dl className="subnet-results">
      {fields.map(([label, answer]) => <div key={label}><dt>{label}</dt><dd dir="ltr">{answer}</dd></div>)}
    </dl>}
    <div className="subnet-split-section">
      <label className="subnet-split-toggle">
        <input type="checkbox" checked={splitEnabled} onChange={(event) => setSplitEnabled(event.target.checked)}/>
        פיצול הרשת לרשתות משנה
      </label>
      {splitEnabled && <div className="subnet-split-content">
        <label className="pocket-widget-label">קידומת חדשה או Subnet Mask חדשה
          <input dir="ltr" value={childNotation} onChange={(event) => setChildNotation(event.target.value)}
            placeholder="/26 או 255.255.255.192"
            aria-label="קידומת או מסכת רשת לפיצול" spellCheck={false} />
        </label>
        {splitError && <p className="pocket-widget-error" role="alert">{splitError}</p>}
        {splitResult && <>
          <p className="subnet-split-summary">
            {splitResult.count.toLocaleString('en-US')} רשתות משנה של /{splitResult.prefix}
            {' · '}מציג {splitResult.shown.toLocaleString('en-US')}
          </p>
          <div className="subnet-split-table-wrap" role="region" aria-label="רשימת רשתות משנה" tabIndex={0}>
            <table className="subnet-split-table" dir="ltr">
              <thead><tr><th>Subnet / CIDR</th><th>Usable IP range</th><th>Hosts</th></tr></thead>
              <tbody>{splitResult.rows.map((row) => <tr key={row.cidr}>
                <td>{row.cidr}</td><td>{row.range}</td><td>{row.usable.toLocaleString('en-US')}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {splitResult.truncated && <p className="pocket-widget-hint">
            מוצגות {splitResult.shown.toLocaleString('en-US')} הרשתות הראשונות בלבד, כדי למנוע יצירת רשימה גדולה מדי.
          </p>}
        </>}
      </div>}
    </div>
    <p className="pocket-widget-hint">מחושב בדפדפן · ללא גישה לרשת</p>
  </section>;
}
