import { describe, expect, it } from 'vitest';
import { DEBUG_ACTIONS } from '../src/game/debug';
import { canReform, newGame } from '../src/game/state';
import { pitReady } from '../src/game/city';

const act = (label: string) => DEBUG_ACTIONS.find((a) => a.label === label)!.run;

describe('debug shortcuts', () => {
  it('every one runs on a fresh game', () => {
    for (const a of DEBUG_ACTIONS) expect(() => a.run(newGame(0)), a.label).not.toThrow();
  });

  it('they reach what they promise', () => {
    const s = newGame(0);
    act('Мусор ×10')(s);
    expect(s.trash.toNumber()).toBe(1e4);
    act('Открыть город')(s);
    expect(s.city.open).toBe(true);
    for (let i = 0; i < 4; i++) act('Пересортировка +1')(s);
    expect(canReform(s)).toBe(true);
    act('Весь город, кроме ямы')(s);
    expect(pitReady(s.city)).toBe(true);
    act('Слух: оно идёт')(s);
    expect(s.hearing.phase).toBe('walk');
  });
});
