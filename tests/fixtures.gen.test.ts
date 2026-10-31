import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { simulate } from '../src/game/bot';
import { DISTRICTS } from '../src/game/city';
import { D } from '../src/game/num';
import { deserialize, serialize } from '../src/game/save';
import { newGame, type GameState } from '../src/game/state';

/**
 * Writes the save fixtures in tests/fixtures: states the bot reaches on the way, plus a
 * few built by hand from them. Takes about two minutes: FIXTURES=1 npx vitest run tests/fixtures.gen.test.ts
 */
const out = (name: string, s: GameState) =>
  writeFileSync(`tests/fixtures/${name}.json`, JSON.stringify(JSON.parse(serialize(s)), null, 1) + '\n');
const copy = (s: GameState) => deserialize(serialize(s))!;

describe.runIf(process.env.FIXTURES)('save fixtures', () => {
  it('writes them', () => {
    out('start', newGame(0));
    const got: Record<string, GameState> = {};
    const take = (name: string, s: GameState) => {
      if (!got[name]) got[name] = copy(s);
    };
    simulate(4 * 3600, {
      recycle: true,
      sort: true,
      snap: (s, what) => {
        if (what === 'переработка доступна') take('recycle-ready', s);
        if (what.startsWith('ПЕРЕРАБОТКА #3')) take('recycle-tree', s);
        if (what === 'сортировка открыта') take('sorting', s);
        if (what === 'город открыт') take('city', s);
      },
    });
    for (const [name, s] of Object.entries(got)) out(name, s);

    // The hearing out of the plant: the thing is walking to the door.
    const walk = copy(got.sorting);
    Object.assign(walk.hearing, { noise: 1.6, meter: 1, phase: 'walk', left: 45, walk: 90 });
    out('hearing-walk', walk);

    // Late town: nearly every street taken, the reform ready, hectares to spare.
    const late = copy(got.city);
    late.sorting.sorts = 10;
    late.city.points = D(5000);
    late.city.total = D(20000);
    late.city.owned = ['dump', ...DISTRICTS.filter((d) => d.type !== 'pit' && d.type !== 'dump').slice(0, 44).map((d) => d.id)];
    out('city-late', late);
  }, 30 * 60 * 1000);
});
