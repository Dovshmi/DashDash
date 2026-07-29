import { describe, expect, it } from 'vitest';
import { isAllowedRequestOrigin } from '../api/request-origin.js';

describe('isAllowedRequestOrigin', () => {
  it('allows a same-host Vercel Preview request when the browser supplies a Referer instead of Origin', () => {
    expect(isAllowedRequestOrigin({
      host: 'dashdash-git-feature-email-time-alerts-sushiteimushi.vercel.app',
      referer: 'https://dashdash-git-feature-email-time-alerts-sushiteimushi.vercel.app/',
    }, {})).toBe(true);
  });

  it('rejects a request from an unrelated origin', () => {
    expect(isAllowedRequestOrigin({
      host: 'dashdash-git-feature-email-time-alerts-sushiteimushi.vercel.app',
      origin: 'https://attacker.example',
    }, {})).toBe(false);
  });
});
