import { CITY_OPEN_SORTS, DISTRICTS } from './city';
import type { Decimal } from './num';
import { FRACS } from './sorting';
import { WALK_MIN } from './hearing';
import { advance, type GameState } from './state';

/**
 * Shortcuts for testing on a phone, behind ?debug: give currency, jump to a layer, call
 * the threats. Each changes the state in place; nothing here is reachable in normal play.
 */
export interface DebugAction {
  label: string;
  run: (s: GameState) => void;
}

/** Ten times what is on hand, and at least this much: enough to move on from any point. */
const boost = (v: Decimal, floor: number) => v.mul(10).max(floor);

export const DEBUG_ACTIONS: readonly DebugAction[] = [
  {
    label: 'Мусор ×10',
    run: (s) => {
      const add = boost(s.trash, 1e4).sub(s.trash);
      s.trash = s.trash.add(add);
      s.totalTrash = s.totalTrash.add(add);
      s.runTrash = s.runTrash.add(add);
    },
  },
  {
    label: 'Вторсырьё ×10',
    run: (s) => {
      const add = boost(s.recycle.points, 1e3).sub(s.recycle.points);
      s.recycle.points = s.recycle.points.add(add);
      s.recycle.total = s.recycle.total.add(add);
    },
  },
  {
    label: 'Фракции ×10',
    run: (s) => {
      s.sorting.open = true;
      for (const f of FRACS) s.sorting.fractions[f] = boost(s.sorting.fractions[f], 1e3);
      s.sorting.total = boost(s.sorting.total, 1e4);
    },
  },
  { label: 'Пересортировка +1', run: (s) => void (s.sorting.sorts += 1) },
  {
    label: 'Открыть город',
    run: (s) => {
      s.sorting.open = true;
      s.sorting.sorts = Math.max(s.sorting.sorts, CITY_OPEN_SORTS);
      s.city.open = true;
    },
  },
  {
    label: 'Гектары +1000',
    run: (s) => {
      s.city.points = s.city.points.add(1000);
      s.city.total = s.city.total.add(1000);
    },
  },
  {
    label: 'Весь город, кроме ямы',
    run: (s) => {
      s.city.open = true;
      s.city.owned = ['dump', ...DISTRICTS.filter((d) => d.type !== 'pit' && d.type !== 'dump').map((d) => d.id)];
    },
  },
  { label: 'Угроза 90%', run: (s) => void (s.threat.level = 0.9) },
  {
    label: 'Слух: оно идёт',
    run: (s) => {
      s.sorting.open = true;
      Object.assign(s.hearing, { meter: 1, phase: 'walk', left: WALK_MIN, walk: WALK_MIN, held: 0 });
    },
  },
  {
    label: 'Слух: у двери',
    run: (s) => {
      s.sorting.open = true;
      Object.assign(s.hearing, { meter: 1, phase: 'walk', left: 1, walk: WALK_MIN, held: 0 });
    },
  },
  { label: 'Промотать 10 мин', run: (s) => advance(s, 600) },
  { label: 'Промотать 1 час', run: (s) => advance(s, 3600) },
];

