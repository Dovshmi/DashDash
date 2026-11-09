import { describe, expect, it } from 'vitest';
import { portServiceLabel, readNetworkTargets, rememberNetworkTarget, sortNetworkTargets, toggleNetworkFavorite } from '../src/network-utils.js';

describe('saved network targets',()=>{
  it('records checked targets without duplicates and updates recency',()=>{
    let rows=rememberNetworkTarget([],'8.8.8.8');
    rows=rememberNetworkTarget(rows,'1.1.1.1');
    rows=rememberNetworkTarget(rows,'8.8.8.8');
    expect(rows.map((item)=>item.value)).toEqual(['8.8.8.8','1.1.1.1']);
  });
  it('preserves favorites and allows starring past targets',()=>{
    let rows=rememberNetworkTarget([],'8.8.8.8',true);
    rows=rememberNetworkTarget(rows,'1.1.1.1');
    rows=toggleNetworkFavorite(rows,'1.1.1.1');
    expect(sortNetworkTargets(rows).every((item)=>item.favorite)).toBe(true);
    expect(rememberNetworkTarget(rows,'8.8.8.8')[0].favorite).toBe(true);
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
