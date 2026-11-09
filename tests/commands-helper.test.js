import { describe, expect, it } from 'vitest';
import { commandTemplateFields, fillCommandTemplate, inferCommandFamily, normalizeCommandCategory } from '../src/command-utils.js';

describe('CLI templates',()=>{
  it('detects known placeholders once',()=>{
    expect(commandTemplateFields('ping {{IP}}\\nset vlan {{VLAN}}\\nping {{IP}}')).toEqual(['IP','VLAN']);
  });
  it('substitutes validated values without executing anything',()=>{
    expect(fillCommandTemplate('ping {{IP}}\\nshow vlan {{VLAN}}',{IP:'10.0.0.1',VLAN:'200'}))
      .toBe('ping 10.0.0.1\\nshow vlan 200');
  });
  it('rejects invalid IPs, VLAN and unknown template tokens',()=>{
    expect(()=>fillCommandTemplate('ping {{IP}}',{IP:'not-an-ip'})).toThrow();
    expect(()=>fillCommandTemplate('vlan {{VLAN}}',{VLAN:'5000'})).toThrow();
    expect(()=>fillCommandTemplate('show {{SECRET}}',{})).toThrow();
  });
  it('recognizes device families from Pocket command library machine labels',()=>{
    expect(inferCommandFamily('Fortigate','Interfaces')).toBe('Fortinet');
    expect(inferCommandFamily('CheckPoint','Routing')).toBe('Check Point');
    expect(inferCommandFamily('Cisco','Diagnostics')).toBe('Cisco');
    expect(inferCommandFamily('Nokia 7210','Routing')).toBe('Other');
  });
  it('keeps category grouping limited to known families',()=>{
    expect(normalizeCommandCategory('Fortinet')).toBe('Fortinet');
    expect(normalizeCommandCategory('random')).toBe('Other');
  });
});
