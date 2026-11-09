import { describe, expect, it } from 'vitest';
import { createDashBackup, isBackupKey, parseDashBackup, restoreDashBackup } from '../src/backup.js';
import { normalizeShortcutUrl } from '../src/shortcuts-utils.js';

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
    original.setItem('work-tools:shortcuts-v1','[]');
    original.setItem('unrelated:user:secret','not included');
    const backup=createDashBackup(original);
    expect(backup.app).toBe('DashDash');
    expect(backup.version).toBe(1);
    expect(Object.keys(backup.data)).toEqual(['work-tools:notebook-v1','work-tools:shortcuts-v1']);
    const target=mockStorage();
    expect(restoreDashBackup(target,parseDashBackup(JSON.stringify(backup)))).toBe(2);
    expect(target.getItem('work-tools:notebook-v1')).toEqual(original.getItem('work-tools:notebook-v1'));
  });
  it('rejects arbitrary localStorage keys, malformed JSON and unsupported versions',()=>{
    expect(isBackupKey('work-tools:drawing:drawing:one')).toBe(true);
    expect(isBackupKey('some-other-key')).toBe(false);
    expect(()=>parseDashBackup({app:'DashDash',version:2,data:{'work-tools:notebook-v1':'[]'}})).toThrow();
    expect(()=>parseDashBackup({app:'DashDash',version:1,data:{evil:'[]'}})).toThrow();
    expect(()=>parseDashBackup({app:'DashDash',version:1,data:{'work-tools:notebook-v1':'{not json}'}})).toThrow();
  });
});
describe('safe website shortcuts',()=>{
  it('normalizes website URLs and supports internal hostnames',()=>{
    expect(normalizeShortcutUrl('example.com')).toBe('https://example.com/');
    expect(normalizeShortcutUrl('https://smartest/')).toBe('https://smartest/');
  });
  it('rejects non-web schemes and embedded credentials',()=>{
    for(const bad of ['javascript:alert(1)','file:///C:/secrets.txt','data:text/html,hello','https://admin:secret@example.com']){
      expect(()=>normalizeShortcutUrl(bad)).toThrow();
    }
  });
});
