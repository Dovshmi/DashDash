import { ipInfo, postOnly, fail, fetchSmallJson } from '../src/server/net-guard.js';
function clean(value, max=180) {
  return typeof value === 'string' ? value.slice(0,max) : null;
}
export default async function handler(req,res) {
  if (!postOnly(req,res)) return;
  try {
    if (JSON.stringify(req.body||{}).length > 300) throw new Error('Invalid request.');
    const ip = String(req.body?.ip||'').trim();
    const info = ipInfo(ip);
    if (!info.valid) throw new Error('Invalid IP address.');
    const result = {ip,version:info.version,type:info.type,public:info.public,
      asn:null,asName:null,prefix:null,organization:null,country:null,reverseDns:null,
      provider:'ipctl.io',warning:null,checkedAt:new Date().toISOString()};
    if (info.public) {
      try {
        const body = await fetchSmallJson('https://api.ipctl.io/v1/ip/' + encodeURIComponent(ip),
          {timeout:5500});
        const d = body?.data;
        if (!d || typeof d !== 'object') throw new Error('Provider returned no IP data.');
        const number = d.asn?.asn ?? d.asn?.number ?? null;
        result.asn = Number.isInteger(Number(number)) && number !== null ? 'AS'+number : null;
        result.asName = clean(d.asn?.name || d.asn?.description);
        result.prefix = clean(d.prefix?.cidr || d.prefix || d.network?.prefix ||
          d.bgp?.prefix || d.bgp_routes?.[0]?.prefix || d.routes?.[0]?.prefix);
        result.organization = clean(d.organization?.name || d.org?.name || d.asn?.name);
        result.country = clean(d.geo?.country_name || d.geo?.country_code);
        result.reverseDns = clean(d.reverse_dns);
      } catch(error) {result.warning = 'IP data provider unavailable: '+error.message;}
    }
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(result);
  } catch(error) {return fail(res,error);}
}
