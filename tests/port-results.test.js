import { describe, expect, it } from 'vitest';
import { sortPortResults } from '../src/port-results.js';

describe('port-check result ordering', () => {
  it('places OPEN first, CLOSED next, TIMEOUT below, and errors last', () => {
    const results = [
      { port: 443, status: 'TIMEOUT' },
      { port: 3389, status: 'CLOSED' },
      { port: 22, status: 'OPEN' },
      { port: 8080, status: 'ERROR' },
      { port: 80, status: 'OPEN' },
      { port: 53, status: 'TIMEOUT' },
      { port: 25, status: 'CLOSED' },
    ];
    const sorted = sortPortResults(results);
    expect(sorted.map(({port}) => port)).toEqual([22, 80, 25, 3389, 53, 443, 8080]);
    expect(results[0].port).toBe(443); // never mutate API results
  });

  it('keeps a numeric port order within each status', () => {
    const sorted = sortPortResults([
      { port: 8443, status: 'OPEN' },
      { port: 443, status: 'OPEN' },
      { port: 8080, status: 'CLOSED' },
      { port: 80, status: 'CLOSED' },
    ]);
    expect(sorted.map(({port}) => port)).toEqual([443,8443,80,8080]);
  });

  it('handles empty and malformed results gracefully', () => {
    expect(sortPortResults([])).toEqual([]);
    expect(sortPortResults(null)).toEqual([]);
  });
});
