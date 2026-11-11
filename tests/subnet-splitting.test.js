import { describe, expect, it } from 'vitest';
import { calculateIpv4Subnet, MAX_SUBNET_ROWS, splitIpv4Subnet } from '../src/subnet.js';

describe('subnet mask input and Pocket-style splitting', () => {
  it('accepts dotted decimal masks after the IP with a slash or space', () => {
    const cidr = calculateIpv4Subnet('192.168.1.10/24');
    expect(calculateIpv4Subnet('192.168.1.10/255.255.255.0')).toEqual(cidr);
    expect(calculateIpv4Subnet('192.168.1.10 255.255.255.0')).toEqual(cidr);
    expect(calculateIpv4Subnet('10.12.14.16 /20').cidr).toBe('10.12.0.0/20');
  });
  it('handles /0, /31 and /32 with dotted masks', () => {
    expect(calculateIpv4Subnet('0.0.0.0/0.0.0.0').total).toBe(4294967296);
    expect(calculateIpv4Subnet('10.0.0.2/255.255.255.254').usable).toBe(2);
    expect(calculateIpv4Subnet('10.0.0.3/255.255.255.255').usable).toBe(1);
  });
  it('rejects invalid masks, invalid prefixes, hostnames and multiple separators', () => {
    for (const invalid of [
      '10.0.0.1/255.0.255.0', '10.0.0.1/255.255.255.257',
      '10.0.0.1/33', '10.0.0.1/-1', 'example.com/24', '10.0.0.1//24',
    ]) expect(() => calculateIpv4Subnet(invalid)).toThrow();
  });
  it('splits an IP from a /24 into four /26 subnets', () => {
    const result = splitIpv4Subnet('192.168.1.10/24', '/26');
    expect(result).toMatchObject({ count: 4, shown: 4, truncated: false, prefix: 26 });
    expect(result.rows.map((row) => row.cidr)).toEqual([
      '192.168.1.0/26', '192.168.1.64/26', '192.168.1.128/26', '192.168.1.192/26',
    ]);
    expect(result.rows[0].usable).toBe(62);
    expect(result.rows[3].range).toBe('192.168.1.193 – 192.168.1.254');
  });
  it('accepts child masks as well as prefixes and preserves the source network', () => {
    expect(splitIpv4Subnet('192.168.1.10/255.255.255.0', '255.255.255.192'))
      .toEqual(splitIpv4Subnet('192.168.1.0/24', '/26'));
  });
  it('rejects a split into a larger subnet or a noncontiguous mask', () => {
    for (const target of ['/23', '/33', '255.255.0.255', 'abc']) {
      expect(() => splitIpv4Subnet('10.2.0.0/24', target)).toThrow();
    }
    expect(splitIpv4Subnet('10.2.0.0/24', '/24').count).toBe(1);
  });
  it('bounds huge results to 128 without expanding the full address space', () => {
    const result = splitIpv4Subnet('0.0.0.0/0', '255.255.255.255');
    expect(result.count).toBe(4294967296);
    expect(result.shown).toBe(MAX_SUBNET_ROWS);
    expect(result.truncated).toBe(true);
    expect(result.rows.at(-1).cidr).toBe('0.0.0.127/32');
    expect(() => splitIpv4Subnet('10.0.0.0/24', '/32', 129)).toThrow();
  });
  it('uses both addresses for /31 and the single address for /32', () => {
    const result = splitIpv4Subnet('192.0.2.0/30', '/31');
    expect(result.rows).toEqual([
      { cidr: '192.0.2.0/31', usable: 2, range: '192.0.2.0 – 192.0.2.1' },
      { cidr: '192.0.2.2/31', usable: 2, range: '192.0.2.2 – 192.0.2.3' },
    ]);
    expect(splitIpv4Subnet('192.0.2.0/31', '/32').rows[0].range).toBe('192.0.2.0');
  });
});
