import { D, Decimal } from './num';

export interface ProducerDef {
  id: string;
  name: string;
  /** Short line under the name. */
  flavor: string;
  baseCost: Decimal;
  /** Trash per second from one unit. */
  baseRate: Decimal;
}

/** Each next unit costs this much more than the previous one. */
export const COST_GROWTH = 1.15;

// Stage 1 ships the first three; the rest of the chain arrives with the core.
export const PRODUCERS: readonly ProducerDef[] = [
  {
    id: 'collector',
    name: 'Сборщик',
    flavor: 'Ходит с мешком и подбирает всё, что плохо лежит',
    baseCost: D(10),
    baseRate: D(1),
  },
  {
    id: 'cart',
    name: 'Тележка',
    flavor: 'Скрипит, но везёт',
    baseCost: D(120),
    baseRate: D(8),
  },
  {
    id: 'truck',
    name: 'Мусоровоз',
    flavor: 'Приезжает по расписанию. Иногда',
    baseCost: D(1500),
    baseRate: D(60),
  },
];

export function producerById(id: string): ProducerDef | undefined {
  return PRODUCERS.find((p) => p.id === id);
}

/** Price of the next unit when `owned` units are already bought. */
export function costOf(def: ProducerDef, owned: number): Decimal {
  return def.baseCost.mul(Decimal.pow(COST_GROWTH, owned));
}
