import { describe, expect, it } from 'vitest';
import { recycleAdvice, sortingAdvice } from '../src/game/advice';
import { newGame } from '../src/game/state';
import { NODES, RECYCLE_AT } from '../src/game/layers';
import { SORT_AT } from '../src/game/sorting';
import { D } from '../src/game/num';

const sorter = () => {
  const s = newGame(0);
  s.sorting.open = true;
  return s;
};

describe('what to do next: Recycling', () => {
  it('first, what it takes to recycle at all', () => {
    expect(recycleAdvice(newGame(0))).toMatch(/Собери .* за один заход/);
  });

  it('points to a tree node the player can buy', () => {
    const s = newGame(0);
    s.recycle.resets = 1;
    s.recycle.points = D(1);
    expect(recycleAdvice(s)).toContain('«Подъёмные»');
  });

  it('says when recycling pays off and when to wait', () => {
    const s = newGame(0);
    s.recycle.resets = 3;
    s.recycle.nodes = NODES.map((n) => n.id);
    s.recycle.total = D(1e6);
    s.runTrash = RECYCLE_AT;
    expect(recycleAdvice(s)).toMatch(/Подожди/);
    s.recycle.total = D(5);
    expect(recycleAdvice(s)).toMatch(/Пора перерабатывать/);
  });
});

describe('what to do next: Sorting', () => {
  it('before the line, what starts it', () => {
    expect(sortingAdvice(newGame(0))).toContain('линия запустится');
  });

  it('an empty slot comes first', () => {
    const s = sorter();
    s.sorting.line = ['optic', null];
    expect(sortingAdvice(s)).toContain('пустое место №2');
  });

  it('then a recipe that is affordable', () => {
    const s = sorter();
    s.sorting.fractions.paper = D(500);
    expect(sortingAdvice(s)).toContain('«Лупа»');
  });

  it('then the resort when it is ready', () => {
    const s = sorter();
    s.recycle.total = SORT_AT;
    expect(sortingAdvice(s)).toMatch(/Можно пересортировать/);
  });

  it('warns when most of the stream goes back into the heap', () => {
    const s = sorter();
    s.sorting.line = ['sieve', 'magnet'];
    expect(sortingAdvice(s)).toContain('уходит обратно в кучу');
  });

  it('says which station to put on when nothing catches what a recipe needs', () => {
    const s = sorter();
    s.sorting.recipes = ['l1', 'l2'];
    s.sorting.line = ['optic', 'blower', 'briquetter'];
    expect(sortingAdvice(s)).toContain('«Магнит»');
  });

  it('otherwise says what is missing for the next recipe', () => {
    const s = sorter();
    s.sorting.fractions.metal = D(100);
    expect(sortingAdvice(s)).toMatch(/не хватает \d+ (бум|мет|пл|ст)/);
  });
});
