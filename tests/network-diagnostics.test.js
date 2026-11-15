import { afterEach, describe, expect, it, vi } from 'vitest';
import { ipInfo, publicHostname, safeWebsiteUrl } from '../src/server/net-guard.js';
import dnsHandler from '../api/dns-lookup.js';
import ipHandler from '../api/ip-intel.js';

function fakeResponse() {
  return {
    code:200, payload:null, headers:{},
    setHeader(k,v) {this.headers[k]=v;return this;},
    status(value) {this.code=value;return this;},
    json(value) {this.payload=value;return this;}
  };
}
function mockJson(data, status=200) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return {ok:status>=200&&status<300,status,body:{getReader() {
    let read=false;
    return {async read() {if(read)return {done:true};read=true;return {done:false,value:bytes};}};
  }}};
}
afterEach(()=>vi.unstubAllGlobals());

describe('network egress guard',()=>{
  it('accepts normal public IPv4/IPv6',()=>{
    expect(ipInfo('8.8.8.8').public).toBe(true);
    expect(ipInfo('2001:4860:4860::8888').public).toBe(true);
  });
  it('rejects private, reserved and translated addresses',()=>{
    for(const ip of ['127.0.0.1','10.0.0.3','172.16.0.1','192.168.1.1',
      '169.254.169.254','100.64.1.1','192.0.2.1','0.0.0.0',
      '::1','fc00::1','fe80::1','2001:db8::1','::ffff:127.0.0.1',
      '2002:c0a8:0101::1']) {
      expect(ipInfo(ip).public,ip).toBe(false);
    }
  });
  it('blocks alternate-form loopback URLs and embedded credentials',()=>{
    expect(()=>safeWebsiteUrl('http://2130706433/')).toThrow();
    expect(()=>safeWebsiteUrl('http://127.1/')).toThrow();
    expect(()=>safeWebsiteUrl('http://admin:password@example.com')).toThrow();
    expect(()=>safeWebsiteUrl('http://example.com:8080/')).toThrow();
    expect(()=>safeWebsiteUrl('file:///etc/passwd')).toThrow();
    expect(()=>safeWebsiteUrl('https://intranet.local')).toThrow();
    expect(safeWebsiteUrl('https://example.com/page').hostname).toBe('example.com');
  });
  it('validates public DNS hostnames',()=>{
    expect(publicHostname('EXAMPLE.COM.')).toBe('example.com');
    expect(()=>publicHostname('local')).toThrow();
    expect(()=>publicHostname('router.internal')).toThrow();
  });
});

describe('DNS endpoint',()=>{
  it('normalizes DoH response and returns TTLs',async()=>{
    vi.stubGlobal('fetch', vi.fn(async()=>mockJson({Status:0,AD:true,
      Answer:[{name:'example.com.',type:1,TTL:300,data:'93.184.215.14'}]})));
    const res=fakeResponse();
    await dnsHandler({method:'POST',body:{name:'example.com',type:'A',resolver:'google'}},res);
    expect(res.code).toBe(200);
    expect(res.payload.responses[0].records[0].ttl).toBe(300);
    expect(res.payload.responses[0].statusText).toBe('NOERROR');
  });
  it('rejects unsupported DNS inputs',async()=>{
    const res=fakeResponse();
    await dnsHandler({method:'POST',body:{name:'localhost',type:'AXFR'}},res);
    expect(res.code).toBe(400);
  });
});

describe('IP endpoint',()=>{
  it('never sends special-use IPs to the external provider',async()=>{
    const fn=vi.fn();
    vi.stubGlobal('fetch',fn);
    const res=fakeResponse();
    await ipHandler({method:'POST',body:{ip:'192.168.4.1'}},res);
    expect(res.code).toBe(200);
    expect(res.payload.type).toBe('private');
    expect(fn).not.toHaveBeenCalled();
  });
  it('returns normalized public ASN information',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>mockJson({data:{
      asn:{asn:15169,name:'Google LLC'},prefix:'8.8.8.0/24',
      reverse_dns:'dns.google',geo:{country_name:'United States'}
    }})));
    const res=fakeResponse();
    await ipHandler({method:'POST',body:{ip:'8.8.8.8'}},res);
    expect(res.code).toBe(200);
    expect(res.payload.asn).toBe('AS15169');
    expect(res.payload.country).toBe('United States');
  });
});
