import { describe, expect, it } from 'vitest';
import { normalizeDashboardLayout, normalizeWidgetIds, createDefaultDashboardLayout } from '../src/utils.js';
import portHandler from '../api/port-check.js';
import macHandler from '../api/mac-lookup.js';

function mockResponse() {
  return {
    code: 200, headers: {},
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
  };
}
describe('Pocket networking integrated with DashDash', () => {
  it('preserves saved positions, dimensions and static locks when network widgets are added', () => {
    const templates = [
      { i:'timer', x:0,y:0,w:6,h:11,minW:3,minH:7 },
      { i:'mac', x:0,y:25,w:6,h:12,minW:4,minH:8 },
      { i:'ports', x:6,y:25,w:6,h:12,minW:4,minH:8 },
    ];
    const saved = [{ i:'timer',x:2,y:9,w:5,h:12,static:true,isDraggable:false,isResizable:false }];
    const layout = normalizeDashboardLayout(saved, templates, ['timer', 'mac', 'ports']);
    expect(layout.find(x => x.i === 'timer')).toMatchObject(saved[0]);
    expect(layout.find(x => x.i === 'mac')).toMatchObject({x:0,y:25,w:6,h:12});
    expect(layout.find(x => x.i === 'ports')).toMatchObject({x:6,y:25,w:6,h:12});
  });
  it('preserves customized widget lists and allows both new tools', () => {
    expect(normalizeWidgetIds(['notes','timer','mac','ports'], ['notes','timer','mac','ports'])).toEqual(['notes','timer','mac','ports']);
    expect(normalizeWidgetIds(['notes','timer'], ['notes','timer','mac','ports'])).toEqual(['notes','timer']);
  });
  it('keeps saved layout when adding a new widget', () => {
    const defaults = [{i:'notes',x:1,y:3,w:6,h:14},{i:'mac',x:0,y:17,w:6,h:12}];
    expect(createDefaultDashboardLayout(['notes','mac'],defaults)).toEqual(defaults);
  });
  it('recognizes MAC locally administered without downloading IEEE data', async () => {
    const res = mockResponse();
    await macHandler({method:'POST',body:{macs:['0e:f6:5a:fb:7a:26','xyz']}},res);
    expect(res.code).toBe(200);
    expect(res.body.results[0]).toMatchObject({mac:'0E:F6:5A:FB:7A:26',vendor:'Locally administered / randomized',registry:'Special'});
    expect(res.body.results[1]).toMatchObject({vendor:'Invalid MAC'});
  });
  it('resolves a real IEEE manufacturer without downloading data at request time', async () => {
    const res = mockResponse();
    await macHandler({method:'POST',body:{macs:['00:00:0C:12:34:56']}},res);
    expect(res.code).toBe(200);
    expect(res.body.results[0].vendor).toMatch(/Cisco/i);
    expect(res.body.results[0].registry).toBe('MA-L');
  });
  it('rejects private, local and non-global targets from TCP checks', async () => {
    for (const ip of ['127.0.0.1','192.168.1.2','10.0.0.1','169.254.169.254','172.16.0.1','192.0.2.1']) {
      const res = mockResponse();
      await portHandler({method:'POST',body:{ip,ports:'443'}},res);
      expect(res.code).toBe(400);
    }
  });
  it('rejects excessive port ranges, missing ports, and non-POST requests', async () => {
    for (const ports of ['','0','65536','1-100','22,a']) {
      const res = mockResponse();
      await portHandler({method:'POST',body:{ip:'8.8.8.8',ports}},res);
      expect(res.code).toBe(400);
    }
    const res = mockResponse();
    await portHandler({method:'GET'},res);
    expect(res.code).toBe(405);
  });
});
