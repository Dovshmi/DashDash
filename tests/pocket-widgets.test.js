import { describe, expect, it } from 'vitest';
import { normalizeNotebook, singleNotebookWidgets } from '../src/notebook-data.js';
import { calculateIpv4Subnet } from '../src/subnet.js';

describe('notebook migration', () => {
  it('converts existing scratchpad widgets into title tabs without losing their text', () => {
    const data = normalizeNotebook(null, { notes: 'first text', 'notes:extra': 'second text' }, '2026-11-09T00:00:00.000Z');
    expect(data.notes.map((note) => note.text)).toEqual(['first text', 'second text']);
    expect(data.notes.map((note) => note.title)).toEqual(['פתק 1', 'פתק 2']);
    expect(data.activeId).toBe(data.notes[0].id);
  });
  it('keeps saved notebook titles, phone numbers and the selected tab', () => {
    const saved = { notes: [{ id: 'a', title: 'לקוח', phone: '050-1234567', text: 'טקסט', createdAt: '2026-11-01' }], activeId: 'a' };
    expect(normalizeNotebook(saved, null)).toEqual(saved);
  });
  it('starts with one blank note and collapses duplicate old note widgets', () => {
    expect(normalizeNotebook(null, null).notes).toHaveLength(1);
    expect(singleNotebookWidgets(['timer', 'notes:extra', 'notes', 'drawing'])).toEqual(['timer', 'notes', 'drawing']);
  });
});

describe('IPv4 subnet calculator', () => {
  it('calculates a /24 including the network and usable range', () => {
    expect(calculateIpv4Subnet('192.168.1.10/24')).toMatchObject({
      network: '192.168.1.0', broadcast: '192.168.1.255',
      mask: '255.255.255.0', wildcard: '0.0.0.255',
      usableRange: '192.168.1.1 – 192.168.1.254', total: 256, usable: 254,
    });
  });
  it('handles special /31 and /32 prefixes and /0', () => {
    expect(calculateIpv4Subnet('10.0.0.4/31').usable).toBe(2);
    expect(calculateIpv4Subnet('10.0.0.4/32').usable).toBe(1);
    expect(calculateIpv4Subnet('10.0.0.4/0').total).toBe(4294967296);
  });
  it('rejects invalid IP addresses and CIDRs', () => {
    expect(() => calculateIpv4Subnet('999.0.0.1/24')).toThrow();
    expect(() => calculateIpv4Subnet('192.168.1.1/33')).toThrow();
  });
});
