import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { simulate } from '../src/game/bot';
import { DISTRICTS } from '../src/game/city';
import { D } from '../src/game/num';
import { deserialize, serialize } from '../src/game/save';
import { descend, newGame, type GameState } from '../src/game/state';
import { ABOVE_SCRIPTS, CONTAINERS, TOOLS, bottomTick, buyAboveScript, buyTool, canOpen, openOne } from '../src/game/bottom';

/**
 * Writes the save fixtures in tests/fixtures: states the bot reaches on the way, plus a
 * few built by hand from them. Takes about two minutes: FIXTURES=1 npx vitest run tests/fixtures.gen.test.ts
 */
const out = (name: string, s: GameState) =>
  writeFileSync(`tests/fixtures/${name}.json`, JSON.stringify(JSON.parse(serialize(s)), null, 1) + '\n');
const copy = (s: GameState) => deserialize(serialize(s))!;

describe.runIf(process.env.FIXTURES)('save fixtures', () => {
  // A few hours at the bottom of the pit, built from the late town: quick on its own,
  // FIXTURES=1 npx vitest run tests/fixtures.gen.test.ts -t bottom
  it('writes the bottom', () => {
    const s = deserialize(readFileSync('tests/fixtures/city-late.json', 'utf8'))!;
    s.city.owned = DISTRICTS.map((d) => d.id);
    descend(s);
    let seed = 7;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const b = s.bottom;
    for (let m = 0; m < 150; m++) {
      bottomTick(b, 60, 3 + m * 0.05, rng);
      for (const c of CONTAINERS) while (canOpen(b, c.id) && b.stock[c.id] > (c.id === 'sack' ? 3 : 1)) openOne(b, c.id, rng);
      // No automatic opening: the fixture shows the strip by hand.
      for (const t of TOOLS) buyTool(b, t.id);
      for (const sc of ABOVE_SCRIPTS) buyAboveScript(b, sc.id);
    }
    b.recent = [];
    out('bottom', s);
  });

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
