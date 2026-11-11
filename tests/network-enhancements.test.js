import { describe, expect, it } from 'vitest';
import { portServiceLabel, readNetworkTargets, readSavedPortTargets, rememberNetworkTarget, removeSavedPortTarget } from '../src/network-utils.js';

describe('saved network targets',()=>{
  it('does not expose targets saved automatically by older port scans',()=>{
    const legacy = [{value:'8.8.8.8',favorite:false},{value:'1.1.1.1',favorite:true}];
    expect(readSavedPortTargets(legacy)).toEqual([{value:'1.1.1.1',favorite:true}]);
  });
  it('only keeps targets deliberately saved with the save action',()=>{
    let rows = readSavedPortTargets([]);
    expect(rows).toEqual([]);
    rows = rememberNetworkTarget(rows, '8.8.8.8', true);
    rows = rememberNetworkTarget(rows, '1.1.1.1', true);
    rows = rememberNetworkTarget(rows, '8.8.8.8', true);
    expect(rows.map((item)=>item.value)).toEqual(['8.8.8.8','1.1.1.1']);
    expect(rows.every((item)=>item.favorite)).toBe(true);
    expect(readSavedPortTargets(JSON.parse(JSON.stringify(rows)))).toEqual(rows);
    expect(removeSavedPortTarget(rows, '8.8.8.8').map((item)=>item.value)).toEqual(['1.1.1.1']);
  });
  it('drops invalid stored entries',()=>{
    expect(readNetworkTargets([{value:'8.8.8.8',favorite:true},null,{}, {value:'x'.repeat(200)}])).toEqual([{value:'8.8.8.8',favorite:true}]);
  });
  it('provides friendly service names without changing TCP status',()=>{
    expect(portServiceLabel(22,'—')).toBe('SSH');
    expect(portServiceLabel(3389,'—')).toBe('RDP');
    expect(portServiceLabel(65332,'Custom')).toBe('Custom');
  });
});
