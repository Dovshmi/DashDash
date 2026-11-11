import { describe, expect, it } from 'vitest';
import { createDashBackup, isBackupKey, parseDashBackup, restoreDashBackup } from '../src/backup.js';
import { normalizeWidgetIds, normalizeDashboardLayout } from '../src/utils.js';

function mockStorage() {
  const state = new Map();
  return {
    get length(){return state.size;},
    key(i){return [...state.keys()][i] ?? null;},
    getItem(k){return state.has(k)?state.get(k):null;},
    setItem(k,v){state.set(k,String(v));},
    removeItem(k){state.delete(k);},
  };
}
describe('private DashDash backup/restore',()=>{
  it('exports only allowlisted local application keys and roundtrips them',()=>{
    const original=mockStorage();
    original.setItem('work-tools:notebook-v1',JSON.stringify({notes:[{title:'hello',text:'test'}]}));
    original.setItem('work-tools:shortcuts-v1','[]'); // retired: preserved locally but not exported
    original.setItem('work-tools:network-targets-mac-v1','[{"value":"00:00:0C:12:34:56"}]');
    original.setItem('unrelated:user:secret','not included');
    const backup=createDashBackup(original);
    expect(backup.app).toBe('DashDash');
    expect(backup.version).toBe(1);
    expect(Object.keys(backup.data)).toEqual(['work-tools:notebook-v1']);
    const target=mockStorage();
    expect(restoreDashBackup(target,parseDashBackup(JSON.stringify(backup)))).toBe(1);
    expect(target.getItem('work-tools:notebook-v1')).toEqual(original.getItem('work-tools:notebook-v1'));
  });
  it('accepts older backups without restoring retired MAC history',()=>{
    const legacy = {app:'DashDash', version:1, data:{
      'work-tools:notebook-v1':'{"notes":[]}',
      'work-tools:network-targets-mac-v1':'[{"value":"AA:BB:CC:DD:EE:FF"}]',
    }};
    const parsed = parseDashBackup(legacy);
    expect(parsed).toEqual({'work-tools:notebook-v1':'{"notes":[]}'});
    const destination = mockStorage();
    restoreDashBackup(destination, parsed);
    expect(destination.getItem('work-tools:network-targets-mac-v1')).toBeNull();
  });
  it('accepts legacy JSON backups without reviving retired Shortcuts',()=>{
    const backup = {app:'DashDash',version:1,data:{
      'work-tools:notebook-v1':'{"notes":[]}',
      'work-tools:shortcuts-v1':'[{"name":"Old","url":"https://example.com"}]',
    }};
    const parsed=parseDashBackup(backup);
    expect(Object.keys(parsed)).toEqual(['work-tools:notebook-v1']);
    const storage=mockStorage();
    expect(restoreDashBackup(storage,parsed)).toBe(1);
    expect(storage.getItem('work-tools:shortcuts-v1')).toBeNull();
  });
  it('rejects arbitrary localStorage keys, malformed JSON and unsupported versions',()=>{
    expect(isBackupKey('work-tools:drawing:drawing:one')).toBe(true);
    expect(isBackupKey('some-other-key')).toBe(false);
    expect(isBackupKey('work-tools:network-targets-mac-v1')).toBe(false);
    expect(isBackupKey('work-tools:shortcuts-v1')).toBe(false);
    expect(()=>parseDashBackup({app:'DashDash',version:2,data:{'work-tools:notebook-v1':'[]'}})).toThrow();
    expect(()=>parseDashBackup({app:'DashDash',version:1,data:{evil:'[]'}})).toThrow();
    expect(()=>parseDashBackup({app:'DashDash',version:1,data:{'work-tools:notebook-v1':'{not json}'}})).toThrow();
  });
});

describe('retired widget migration',()=>{
  it('filters old shortcuts IDs out of persisted desktop and mobile widget selections',()=>{
    const allowed=['notes','commands','subnet','mac','ports'];
    expect(normalizeWidgetIds(['shortcuts','commands','shortcuts','mac'],allowed)).toEqual(['commands','mac']);
    const layout=normalizeDashboardLayout([
      {i:'shortcuts',x:0,y:0,w:4,h:12},
      {i:'commands',x:0,y:10,w:4,h:14},
    ],[{i:'commands',x:0,y:0,w:4,h:14}],['commands']);
    expect(layout.map((item)=>item.i)).toEqual(['commands']);
  });
});
