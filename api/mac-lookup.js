// IEEE-backed lookup; MAC values never leave this service for a third-party lookup.
const SOURCES = [
  ['MA-L', 'https://standards-oui.ieee.org/oui/oui.csv', 6],
  ['MA-M', 'https://standards-oui.ieee.org/oui28/mam.csv', 7],
  ['MA-S', 'https://standards-oui.ieee.org/oui36/oui36.csv', 9],
  ['IAB', 'https://standards-oui.ieee.org/iab/iab.csv', 9],
];
let cache = null;
let lastFetched = 0;
let loading = null;
function records(csv, size, name, map) {
  // Parse quoted CSV correctly (commas, quotes, and embedded line breaks).
  let fields = [], field = '', quoted = false, rows = [];
  for (let i=0; i<csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i+1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { fields.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && csv[i+1] === '\n') i++; fields.push(field); rows.push(fields); fields = []; field = ''; }
    else field += c;
  }
  if (field || fields.length) { fields.push(field); rows.push(fields); }
  const header = rows.shift()?.map(s => s.replace(/^\ufeff/, '').trim()) || [];
  const assignment = header.indexOf('Assignment'), organization = header.indexOf('Organization Name');
  if (assignment < 0 || organization < 0) throw Error('IEEE CSV format changed');
  for (const row of rows) {
    const prefix = (row[assignment] || '').replace(/[^a-f\d]/gi, '').toUpperCase();
    if (prefix.length === size && row[organization]?.trim() && !map.has(prefix)) map.set(prefix, { vendor: row[organization].trim(), registry: name });
  }
}
async function vendors() {
  if (cache && Date.now() - lastFetched < 86400000) return cache;
  if (!loading) loading = (async () => {
    const map = new Map();
    const downloads = await Promise.allSettled(SOURCES.map(async ([name, url, size]) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error('IEEE ' + name + ' HTTP ' + response.status);
      const csv = await response.text();
      if (csv.length > 30000000) throw Error('IEEE CSV too large');
      return { csv, size, name };
    }));
    for (const item of downloads) {
      if (item.status === 'fulfilled') {
        const { csv, size, name } = item.value;
        records(csv, size, name, map);
      }
    }
    if (!map.size && !cache) throw Error('IEEE registry downloads failed');
    if (map.size) { cache = map; lastFetched = Date.now(); }
    return cache;
  })().finally(() => { loading = null; });
  return loading;
}
export default async function handler(req,res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Method not allowed'}); }
  const macs = req.body?.macs;
  if (!Array.isArray(macs) || macs.length < 1 || macs.length > 100 || macs.some(x => typeof x !== 'string' || x.length > 32)) return res.status(400).json({error:'Provide 1–100 MAC addresses'});
  try {
    const parsed = macs.map(input => {
      const raw = input.trim(), valid = /^(?:[a-f\d]{12}|(?:[a-f\d]{2}[:-]){5}[a-f\d]{2}|[a-f\d]{4}(?:\.[a-f\d]{4}){2})$/i.test(raw) && !(raw.includes('-') && raw.includes(':'));
      const mac = valid ? raw.replace(/[:.\-]/g,'').toUpperCase() : null;
      return { input, mac };
    });
    const db = parsed.some(x => x.mac && !(parseInt(x.mac.slice(0,2),16)&3)) ? await vendors() : new Map();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({results:parsed.map(({input,mac}) => {
      if (!mac) return {input,mac:'—',vendor:'Invalid MAC',registry:'—'};
      const pretty = mac.match(/.{2}/g).join(':'); const first = parseInt(mac.slice(0,2),16);
      if (first & 1) return {input,mac:pretty,vendor:'Multicast / group address',registry:'Special'};
      if (first & 2) return {input,mac:pretty,vendor:'Locally administered / randomized',registry:'Special'};
      const found = db?.get(mac.slice(0,9)) || db?.get(mac.slice(0,7)) || db?.get(mac.slice(0,6));
      return {input,mac:pretty,vendor:found?.vendor || 'Unknown / unregistered',registry:found?.registry || '—'};
    })});
  } catch(e) { return res.status(503).json({error:'IEEE vendor database unavailable. '+e.message}); }
}
