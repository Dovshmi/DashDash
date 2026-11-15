import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { domainToASCII } from 'node:url';

const blocked4 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
  ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24],
  ['192.0.2.0',24], ['192.88.99.0',24], ['192.168.0.0',16],
  ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24],
  ['224.0.0.0',4], ['240.0.0.0',4]
]) blocked4.addSubnet(network, prefix, 'ipv4');

const blocked6 = new net.BlockList();
for (const [network,prefix] of [
  ['::',128], ['::1',128], ['::ffff:0:0',96], ['64:ff9b::',96],
  ['64:ff9b:1::',48], ['100::',64], ['2001::',23],
  ['2001:db8::',32], ['2002::',16], ['fc00::',7],
  ['fe80::',10], ['ff00::',8]
]) blocked6.addSubnet(network,prefix,'ipv6');

export function ipInfo(address) {
  const ip = String(address || '').replace(/^\[|\]$/g, '');
  const version = net.isIP(ip);
  if (!version) return { valid: false, version: null, type: 'invalid', public: false };
  if (version === 4) {
    const p = ip.split('.').map(Number);
    let type = 'public';
    if (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168)) type = 'private';
    else if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) type = 'cgnat';
    else if (p[0] === 127) type = 'loopback';
    else if (p[0] === 169 && p[1] === 254) type = 'link-local';
    else if (blocked4.check(ip, 'ipv4')) type = 'reserved';
    return { valid: true, version, type, public: type === 'public' };
  }
  let type = 'public';
  const lower = ip.toLowerCase();
  if (lower === '::1') type = 'loopback';
  else if (/^f[cd]/i.test(lower)) type = 'private';
  else if (blocked6.check(ip, 'ipv6') || !globalIPv6(ip)) type = 'reserved';
  return { valid: true, version, type, public: type === 'public' };
}

// Only native global-unicast IPv6 is permitted for outbound connections.
function globalIPv6(ip) {
  const leading = parseInt(ip.split(':')[0] || '0',16);
  return leading >= 0x2000 && leading <= 0x3fff;
}
export function publicIp(ip) { return ipInfo(ip).public; }

export function publicHostname(value) {
  if (typeof value !== 'string' || value.length > 253) throw new Error('Invalid hostname.');
  const name = domainToASCII(value.trim().replace(/\.$/, '')).toLowerCase();
  if (!name || name.length > 253 || name.includes('..') ||
      !/^[a-z0-9.-]+$/.test(name) || !name.includes('.') ||
      !name.split('.').every(x => x.length >= 1 && x.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))) {
    throw new Error('Enter a valid public hostname.');
  }
  const suffix = name.split('.').at(-1);
  if (['local','localhost','internal','invalid','test','home','lan','onion'].includes(suffix)) {
    throw new Error('Internal or special-use hostnames are not supported.');
  }
  if (net.isIP(name)) throw new Error('Enter a hostname, not an IP address.');
  return name;
}

export function safeWebsiteUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Invalid URL.');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a full http(s) URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password ||
      url.hash || !url.hostname || url.port && !['80','443'].includes(url.port) ||
      url.port && Number(url.port) !== (url.protocol === 'https:' ? 443 : 80)) {
    throw new Error('Only HTTP/HTTPS URLs on their standard ports are supported.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (!publicIp(host)) throw new Error('Private or reserved IP targets are blocked.');
  } else {
    publicHostname(host);
  }
  return url;
}

export async function pinnedDestination(url) {
  const host = url.hostname.replace(/^\[|\]$/g,'');
  if (net.isIP(host)) {
    if (!publicIp(host)) throw new Error('Private or reserved IP targets are blocked.');
    return host;
  }
  const addresses = await Promise.race([
    lookup(host, {all:true, verbatim:true}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('DNS lookup timed out.')),4000))
  ]);
  if (!addresses.length || addresses.some(item=>!publicIp(item.address))) {
    throw new Error('Target DNS did not resolve exclusively to public IP addresses.');
  }
  return addresses[0].address;
}

export function postOnly(req, res) {
  if (req.method === 'POST') return true;
  res.setHeader('Allow','POST');
  res.status(405).json({error:'Method not allowed'});
  return false;
}
export function fail(res, error) {
  const message = String(error?.message || 'Lookup failed.');
  const badRequest = /^(Invalid|Enter |Only |Private |Internal |Target DNS|DNS lookup timed out)/.test(message);
  res.setHeader('Cache-Control','no-store');
  return res.status(badRequest ? 400 : 502).json({error:message.slice(0,220)});
}

export async function fetchSmallJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 4500);
  try {
    const response = await fetch(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: {'Accept':'application/json', ...(options.headers || {})}
    });
    if (!response.ok) throw new Error('Provider returned HTTP ' + response.status);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Provider returned an empty response.');
    let received = 0; const chunks = [];
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 100000) { await reader.cancel(); throw new Error('Provider response too large.'); }
      chunks.push(value);
    }
    const combined = new Uint8Array(received);
    let position=0;
    for(const chunk of chunks) {combined.set(chunk,position); position += chunk.length;}
    return JSON.parse(new TextDecoder().decode(combined));
  } finally {clearTimeout(timeout);}
}
