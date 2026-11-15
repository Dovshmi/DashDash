import net from 'node:net';
import { ipInfo, publicHostname, postOnly, fail, fetchSmallJson } from '../src/server/net-guard.js';
const TYPES = new Set(['A','AAAA','MX','TXT','NS','CNAME','PTR']);
const RESOLVERS = {
  google: 'https://dns.google/resolve',
  cloudflare: 'https://cloudflare-dns.com/dns-query'
};
const CODES = ['NOERROR','FORMERR','SERVFAIL','NXDOMAIN','NOTIMP','REFUSED'];
function ptrName(ip) {
  if (net.isIP(ip) === 4) return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  return ip;
}
async function resolveOne(name, type, resolver) {
  const url = new URL(RESOLVERS[resolver]);
  url.searchParams.set('name',name);
  url.searchParams.set('type',type);
  const data = await fetchSmallJson(url.toString(), {
    headers: resolver === 'cloudflare' ? {Accept:'application/dns-json'} : {},
  });
  const status = Number(data.Status);
  if (!Number.isInteger(status) || !Array.isArray(data.Answer) && data.Answer != null) {
    throw new Error('Unexpected DNS provider response.');
  }
  return {
    resolver, status, statusText:CODES[status] || 'RCODE ' + status,
    authenticated: Boolean(data.AD),
    records: (data.Answer || []).slice(0,60).map(x=>({
      name:String(x.name||''), type:Number(x.type), ttl:Number(x.TTL)||0, data:String(x.data||'').slice(0,1200)
    }))
  };
}
export default async function handler(req,res) {
  if (!postOnly(req,res)) return;
  try {
    if (JSON.stringify(req.body||{}).length > 1024) throw new Error('Invalid request.');
    const type = String(req.body?.type||'A').toUpperCase();
    const resolver = String(req.body?.resolver||'cloudflare').toLowerCase();
    if (!TYPES.has(type) || ![...Object.keys(RESOLVERS),'compare'].includes(resolver)) {
      throw new Error('Invalid DNS record type or resolver.');
    }
    let name = String(req.body?.name||'').trim();
    if (type === 'PTR' && ipInfo(name).valid) name = ptrName(name);
    name = publicHostname(name);
    const sources = resolver === 'compare' ? ['cloudflare','google'] : [resolver];
    const responses = await Promise.all(sources.map(async source => {
      try {return await resolveOne(name,type,source);}
      catch(error) {return {resolver:source,error:error.message,records:[]};}
    }));
    if (responses.every(r=>r.error)) throw new Error('Both DNS providers are unavailable or rejected the lookup.');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({name,type,responses,checkedAt:new Date().toISOString()});
  } catch(error) {return fail(res,error);}
}
