import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/game/save';

/** The save fixtures (tests/fixtures, written by fixtures.gen.test.ts) still load and mean what their names say. */
const load = (name: string) => deserialize(readFileSync(`tests/fixtures/${name}.json`, 'utf8'))!;

describe('save fixtures', () => {
  it('every one loads and survives a round trip', () => {
    for (const file of readdirSync('tests/fixtures')) {
      const s = deserialize(readFileSync(`tests/fixtures/${file}`, 'utf8'));
      expect(s, file).not.toBeNull();
      expect(deserialize(serialize(s!)), file).not.toBeNull();
    }
  });

  it('each is the moment its name says', () => {
    expect(load('start').trash.toNumber()).toBe(0);
    expect(load('recycle-tree').recycle.resets).toBeGreaterThanOrEqual(3);
    expect(load('sorting').sorting.open).toBe(true);
    expect(load('hearing-walk').hearing.phase).toBe('walk');
    expect(load('city').city.open).toBe(true);
    expect(load('city-late').city.owned.length).toBeGreaterThan(40);
  });
});
