import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({lookup: vi.fn()}));
import { lookup } from 'node:dns/promises';
import { pinnedDestination } from '../src/server/net-guard.js';

afterEach(()=>vi.resetAllMocks());
describe('DNS pinned website connections',()=>{
  it('rejects a private-only DNS answer',async()=>{
    vi.mocked(lookup).mockResolvedValue([{address:'127.0.0.1',family:4}]);
    await expect(pinnedDestination(new URL('https://example.com'))).rejects.toThrow('public IP');
  });
  it('rejects mixed public/private DNS answers (rebinding risk)',async()=>{
    vi.mocked(lookup).mockResolvedValue([
      {address:'93.184.215.14',family:4},
      {address:'169.254.169.254',family:4}
    ]);
    await expect(pinnedDestination(new URL('https://example.com'))).rejects.toThrow('public IP');
  });
  it('returns the pinned public DNS answer',async()=>{
    vi.mocked(lookup).mockResolvedValue([
      {address:'93.184.215.14',family:4},
      {address:'93.184.215.15',family:4}
    ]);
    await expect(pinnedDestination(new URL('https://example.com'))).resolves.toBe('93.184.215.14');
  });
  it('does not perform DNS lookup for a public IP literal',async()=>{
    await expect(pinnedDestination(new URL('https://8.8.8.8'))).resolves.toBe('8.8.8.8');
    expect(lookup).not.toHaveBeenCalled();
  });
});
