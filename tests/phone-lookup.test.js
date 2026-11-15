import { afterEach, describe, expect, it, vi } from 'vitest';
import { externalPhoneLinks, parseIsraeliPhone } from '../src/phone-lookup-utils.js';
import handler from '../api/phone-lookup.js';

function responseStub() {
  return {
    code: 200, headers: {}, data: null,
    status(code) {this.code=code;return this;},
    setHeader(key,value) {this.headers[key]=value;return this;},
    json(data) {this.data=data;return this;}
  };
}
function req(number,apiKey='nol_0123456789abcdefgh') {
  return {method:'POST',headers:{'content-type':'application/json'},body:{number,apiKey}};
}
function mockProvider(body, status=200, headers={}) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  let read = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {get(key){return headers[key.toLowerCase()]||null;}},
    body: {getReader(){return {
      async read(){if(read)return {done:true};read=true;return {done:false,value:bytes};},
      async cancel(){}
    };}}
  };
}
afterEach(()=>vi.unstubAllGlobals());

describe('Israeli phone parsing',()=>{
  it.each([
    ['050-123-4567','0501234567','+972501234567','mobile'],
    ['+972 50 123 4567','0501234567','+972501234567','mobile'],
    ['00972501234567','0501234567','+972501234567','mobile'],
    ['972-50-1234567','0501234567','+972501234567','mobile'],
    ['03-1234567','031234567','+97231234567','landline'],
    ['077-1234567','0771234567','+972771234567','voip'],
  ])('normalizes %s', (input,national,e164,type)=>{
    expect(parseIsraeliPhone(input)).toMatchObject({national,e164,type});
  });
  it.each(['','12345','9999999999','050123456','abcdefg',
    'foo0501234567','+972+501234567','05012345678','+15551234567',
    '050-123-4567 ext 1','tel:0501234567',null,{}])
    ('rejects invalid input %s', input=>expect(parseIsraeliPhone(input)).toBeNull());
  it('creates only fixed external destinations and a documented direct Index URL',()=>{
    const links=externalPhoneLinks('050-123-4567');
    expect(links.index).toBe('https://theindex.co.il/phone/0501234567/');
    expect(links.google).toContain('www.google.com/search?q=');
    expect(links.me).toBe('https://me.app/phone-search/');
    expect(externalPhoneLinks('garbage')).toBeNull();
  });
});

describe('Numbers Online optional caller-name proxy',()=>{
  it('returns provider caller-name without returning API key',async()=>{
    const fetchSpy=vi.fn(async()=>mockProvider({
      valid:true,cnam:'Example Business',
      line_type:'mobile',carrier:'Range Carrier',country:'IL'
    }));
    vi.stubGlobal('fetch',fetchSpy);
    const res=responseStub();
    await handler(req('0501234567'),res);
    expect(res.code).toBe(200);
    expect(res.data).toMatchObject({name:'Example Business',lineType:'mobile',
      number:'0501234567',e164:'+972501234567'});
    expect(JSON.stringify(res.data)).not.toContain('nol_');
    const [url,options]=fetchSpy.mock.calls[0];
    expect(url).toContain('/api/v1/lookup/%2B972501234567');
    expect(options.headers['X-API-Key']).toBe('nol_0123456789abcdefgh');
    expect(options.redirect).toBe('error');
    expect(res.headers['Cache-Control']).toContain('no-store');
  });
  it('does not infer a name when CNAM is absent',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>mockProvider({valid:true,cnam:null,line_type:'mobile'})));
    const res=responseStub();
    await handler(req('0501234567'),res);
    expect(res.code).toBe(200);
    expect(res.data.name).toBeNull();
  });
  it('blocks invalid phone, method and API key before contacting provider',async()=>{
    const spy=vi.fn();
    vi.stubGlobal('fetch',spy);
    const a=responseStub();await handler(req('127.0.0.1'),a);
    const b=responseStub();await handler(req('0501234567','bad-key'),b);
    const c=responseStub();await handler({method:'GET',headers:{},body:{}},c);
    expect([a.code,b.code,c.code]).toEqual([400,400,405]);
    expect(spy).not.toHaveBeenCalled();
  });
  it('turns provider 429 into a clear limit error without leaking the key',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>mockProvider({error:'rate_limited_pool'},429,{'retry-after':'120'})));
    const res=responseStub();await handler(req('0501234567'),res);
    expect(res.code).toBe(429);
    expect(res.data).toEqual({error:'provider_rate_limit',retryAfter:120});
  });
});
