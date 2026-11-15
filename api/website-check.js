import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { safeWebsiteUrl, pinnedDestination, postOnly, fail } from '../src/server/net-guard.js';

const SHOW_HEADERS = [
  'content-type','server','strict-transport-security','content-security-policy',
  'x-frame-options','x-content-type-options','referrer-policy'
];
function certificate(socket) {
  if (!socket?.encrypted) return null;
  const peer = socket.getPeerCertificate();
  return {
    authorized: socket.authorized === true,
    verificationError: socket.authorizationError || null,
    subject: peer?.subject?.CN || null,
    issuer: peer?.issuer?.O || peer?.issuer?.CN || null,
    validFrom: peer?.valid_from || null,
    validTo: peer?.valid_to || null,
    protocol: typeof socket.getProtocol === 'function' ? socket.getProtocol() : null
  };
}
function probe(url, address, method) {
  return new Promise((resolve,reject) => {
    const httpsMode = url.protocol === 'https:';
    const host = url.hostname.replace(/^\[|\]$/g,'');
    const client = httpsMode ? https : http;
    const start = Date.now();
    const request = client.request({
      protocol: url.protocol,
      hostname: host,
      port: httpsMode ? 443 : 80,
      method,
      path: url.pathname + url.search,
      servername: net.isIP(host) ? undefined : host,
      lookup: (_host,_options,done) => done(null,address,net.isIP(address)),
      agent: false,
      timeout: 4500,
      rejectUnauthorized: false,
      headers: {
        'User-Agent':'DashDash-NetworkDiagnostics/1.0',
        'Accept':'*/*',
        'Connection':'close'
      }
    }, response => {
      const headers = Object.fromEntries(SHOW_HEADERS.filter(k=>response.headers[k])
        .map(k=>[k,String(response.headers[k]).slice(0,1000)]));
      const output = {
        url:url.toString(), status:response.statusCode,
        ms:Date.now()-start, headers, location:response.headers.location || null,
        tls:certificate(response.socket)
      };
      response.destroy(); // Headers only. Never download the response body.
      resolve(output);
    });
    request.on('timeout',()=>request.destroy(new Error('Website check timed out.')));
    request.on('error',reject);
    request.end();
  });
}
export default async function handler(req,res) {
  if (!postOnly(req,res)) return;
  try {
    if (JSON.stringify(req.body||{}).length > 2200) throw new Error('Invalid request.');
    let url = safeWebsiteUrl(req.body?.url);
    const visited = new Set();
    const chain = [];
    for (let i=0; i<4; i++) {
      if (visited.has(url.toString())) throw new Error('Redirect loop detected.');
      visited.add(url.toString());
      const address = await pinnedDestination(url);
      let step = await probe(url,address,'HEAD');
      if ([405,501].includes(step.status)) step = await probe(url,address,'GET');
      chain.push(step);
      const redirect = step.status >= 300 && step.status < 400 && step.location;
      if (!redirect) break;
      if (step.tls && !step.tls.authorized) {
        throw new Error('Stopped at an untrusted TLS redirect.');
      }
      if (i===3) throw new Error('Too many redirects (limit: 3).');
      const next = safeWebsiteUrl(new URL(step.location,url).toString());
      if (url.protocol === 'https:' && next.protocol !== 'https:') {
        throw new Error('HTTPS-to-HTTP redirect blocked.');
      }
      url = next;
    }
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      requestedUrl: req.body.url, finalUrl: url.toString(), chain,
      checkedAt: new Date().toISOString(),
      perspective: 'DashDash Vercel server (not your local computer)'
    });
  } catch(error) {return fail(res,error);}
}
