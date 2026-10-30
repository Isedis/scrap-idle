import { describe, expect, it } from 'vitest';
import { findNewBuild } from '../src/update';

const reply = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });

describe('findNewBuild', () => {
  it('reports a different published build', async () => {
    expect(await findNewBuild('abc1234', reply({ build: 'def5678' }))).toBe('def5678');
  });

  it('stays quiet when the build matches', async () => {
    expect(await findNewBuild('abc1234', reply({ build: 'abc1234' }))).toBeNull();
  });

  it('stays quiet on errors and junk', async () => {
    expect(await findNewBuild('a', reply({}, false))).toBeNull();
    expect(await findNewBuild('a', reply({ build: 42 }))).toBeNull();
    expect(await findNewBuild('a', reply(null))).toBeNull();
    expect(await findNewBuild('a', async () => { throw new Error('offline'); })).toBeNull();
  });

  it('asks past the cache', async () => {
    let asked = '';
    await findNewBuild('a', async (url) => { asked = url; return { ok: true, json: async () => ({ build: 'a' }) }; });
    expect(asked).toMatch(/^version\.json\?t=\d+$/);
  });
});
