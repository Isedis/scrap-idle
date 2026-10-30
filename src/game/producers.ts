import { D, Decimal } from './num';

export interface ProducerDef {
  id: string;
  name: string;
  /** Short line under the name. */
  flavor: string;
  baseCost: Decimal;
  /** Trash per second from one unit, before any multipliers. */
  baseRate: Decimal;
}

/** Each next unit costs this much more than the previous one. */
export const COST_GROWTH = 1.15;

// The chain from a yard to space. Payback time (cost / rate) grows down the
// list, so older producers stay worth buying for a while.
export const PRODUCERS: readonly ProducerDef[] = [
  { id: 'collector', name: 'Сборщик', flavor: 'Ходит с мешком и подбирает всё, что плохо лежит', baseCost: D(10), baseRate: D(1) },
  { id: 'cart', name: 'Тележка', flavor: 'Скрипит, но везёт', baseCost: D(300), baseRate: D(10) },
  { id: 'truck', name: 'Мусоровоз', flavor: 'Приезжает по расписанию. Иногда', baseCost: D(9e3), baseRate: D(120) },
  { id: 'sorter', name: 'Сортировочная', flavor: 'Пластик налево, стекло направо, носки в загадочную кучу', baseCost: D(2.7e5), baseRate: D(1500) },
  { id: 'press', name: 'Пресс', flavor: 'Превращает холодильник в кубик за восемь секунд', baseCost: D(8e6), baseRate: D(2e4) },
  { id: 'plant', name: 'Завод переработки', flavor: 'Из бутылок делает лавочки, из лавочек бутылки', baseCost: D(2.4e8), baseRate: D(2.7e5) },
  { id: 'landfill', name: 'Полигон', flavor: 'Видно из космоса. Скоро будет видно из соседнего космоса', baseCost: D(7e9), baseRate: D(3.5e6) },
  { id: 'incinerator', name: 'Мусоросжигательная ТЭЦ', flavor: 'Греет полгорода и немного атмосферу', baseCost: D(2e11), baseRate: D(4.4e7) },
  { id: 'orbital', name: 'Орбитальный сборщик', flavor: 'Ловит старые спутники сачком', baseCost: D(6e12), baseRate: D(6e8) },
  { id: 'singularity', name: 'Утилизатор-сингулярность', flavor: 'Мусор входит, ничего не выходит. Даже свет', baseCost: D(1.8e14), baseRate: D(8.2e9) },
];

export function producerById(id: string): ProducerDef | undefined {
  return PRODUCERS.find((p) => p.id === id);
}

/** Price of the next unit when `owned` units are already bought. */
export function costOf(def: ProducerDef, owned: number): Decimal {
  return def.baseCost.mul(Decimal.pow(COST_GROWTH, owned));
}

/** Price of `count` units bought one after another, starting at `owned`. */
export function costOfMany(def: ProducerDef, owned: number, count: number): Decimal {
  if (count <= 0) return D(0);
  // Geometric series: first · (g^n − 1) / (g − 1).
  return costOf(def, owned).mul(Decimal.pow(COST_GROWTH, count).sub(1)).div(COST_GROWTH - 1);
}

/** How many units `budget` buys right now, starting at `owned`. */
export function affordableCount(def: ProducerDef, owned: number, budget: Decimal): number {
  const first = costOf(def, owned);
  if (budget.lt(first)) return 0;
  const ratio = budget.mul(COST_GROWTH - 1).div(first).add(1);
  let n = Math.floor(ratio.log(COST_GROWTH).toNumber());
  // Floating point can land one off either way at the boundary.
  while (n > 0 && costOfMany(def, owned, n).gt(budget)) n--;
  while (costOfMany(def, owned, n + 1).lte(budget)) n++;
  return n;
}

/** Owned counts where a producer doubles its output: 10, 25, 50, then every 50. */
export function milestonesReached(owned: number): number {
  if (owned < 10) return 0;
  if (owned < 25) return 1;
  if (owned < 50) return 2;
  return 2 + Math.floor(owned / 50);
}

/** The next owned count that doubles output. */
export function nextMilestone(owned: number): number {
  if (owned < 10) return 10;
  if (owned < 25) return 25;
  return (Math.floor(owned / 50) + 1) * 50;
}

/** The milestone before `nextMilestone`, so progress can be shown between the two. */
export function prevMilestone(owned: number): number {
  if (owned < 10) return 0;
  if (owned < 25) return 10;
  return owned < 50 ? 25 : Math.floor(owned / 50) * 50;
}
