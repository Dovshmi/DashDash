// Local IEEE-derived registry. No runtime downloads, external API calls or MAC-address transmission.
import ouiData from 'oui-data' with { type: 'json' };

function normalizeMac(input) {
  const raw = input.trim();
  if (raw.includes(':') && raw.includes('-')) return null;
  if (!/^(?:[a-f\d]{12}|(?:[a-f\d]{2}[:-]){5}[a-f\d]{2}|[a-f\d]{4}(?:\.[a-f\d]{4}){2})$/i.test(raw)) return null;
  return raw.replace(/[:.\-]/g, '').toUpperCase();
}

function findVendor(mac) {
  for (const [length, registry] of [[9,'MA-S'], [7,'MA-M'], [6,'MA-L']]) {
    const entry = ouiData[mac.slice(0, length)];
    if (typeof entry === 'string' && entry.trim()) {
      return { vendor: entry.split(/\r?\n/)[0].trim(), registry };
    }
  }
  return { vendor: 'Unknown / unregistered', registry: '—' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  const macs = req.body?.macs;
  if (!Array.isArray(macs) || macs.length < 1 || macs.length > 100 ||
      macs.some(x => typeof x !== 'string' || x.length > 32)) {
    return res.status(400).json({error:'Provide 1–100 MAC addresses'});
  }
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ results: macs.map(input => {
    const mac = normalizeMac(input);
    if (!mac) return {input, mac:'—', vendor:'Invalid MAC', registry:'—'};
    const pretty = mac.match(/.{2}/g).join(':');
    const firstByte = parseInt(mac.slice(0, 2), 16);
    if (firstByte & 1) return {input,mac:pretty,vendor:'Multicast / group address',registry:'Special'};
    if (firstByte & 2) return {input,mac:pretty,vendor:'Locally administered / randomized',registry:'Special'};
    return {input,mac:pretty,...findVendor(mac)};
  })});
}
