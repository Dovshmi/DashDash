import { describe, expect, it } from 'vitest';
import { extractMacAddresses, normalizeMac } from '../src/mac-utils.js';

describe('pasted MAC address extraction', () => {
  it('reads valid addresses from logs, tables and free text', () => {
    const pasted = [
      'Port  MAC address       Status',
      'Gi0/1 00:00:0c:12:34:56 up',
      'WiFi  00-11-22-33-44-55  active',
      'Switch MAC=0011.2233.4455, VLAN 12',
      'Plain AABBCCDDEEFF.',
      'invalid 00:11:22:33:44:ZZ',
      'not a mac',
    ].join('\n');
    expect(extractMacAddresses(pasted)).toEqual([
      '00:00:0C:12:34:56',
      '00:11:22:33:44:55',
      'AA:BB:CC:DD:EE:FF',
    ]);
  });
  it('deduplicates different representations of the same address', () => {
    expect(extractMacAddresses('00:11:22:33:44:55, 0011.2233.4455, 001122334455')).toEqual([
      '00:11:22:33:44:55',
    ]);
  });
  it('never accepts fragments of malformed or longer tokens', () => {
    const bad = '00:11:22:33:44:ZZ 00:11:22:33:44:55:66 AABBCCDDEEFFGG 00:11-22:33:44:55 0000111122223333 xyz';
    expect(extractMacAddresses(bad)).toEqual([]);
    expect(normalizeMac('00:11:22:33:44:ZZ')).toBeNull();
    expect(normalizeMac('00:11:22:33:44:55:66')).toBeNull();
    expect(normalizeMac('00:11:22:33:44:55')).toBe('001122334455');
  });
  it('detects oversized batches rather than silently truncating them', () => {
    const input = Array.from({length:101},(_,i)=>'00:00:0C:00:00:'+i.toString(16).padStart(2,'0')).join('\n');
    expect(extractMacAddresses(input)).toHaveLength(101);
  });
});
