import { D, Decimal } from './num';

/**
 * Prestige layers. Each layer resets everything below it for its own currency,
 * spent in its own tree. Only Recycling is playable now; the next layers are
 * listed so the game can show them as closed doors and plug them in later.
 */

/** Progress in one layer. Kept in the save under the layer's id. */
export interface LayerState {
  /** Currency on hand. */
  points: Decimal;
  /** Currency earned over the whole game; never spent. */
  total: Decimal;
  resets: number;
  /** Tree nodes bought. */
  nodes: string[];
  /** Shortest run that ended in this layer's reset, in seconds of play. */
  bestSeconds: number | null;
}

export function newLayer(): LayerState {
  return { points: D(0), total: D(0), resets: 0, nodes: [], bestSeconds: null };
}

export interface LayerDef {
  id: string;
  name: string;
  /** Currency name as shown on screen. */
  currency: string;
  /** False for layers that exist only as a teaser for now. */
  playable: boolean;
  teaser: string;
}

export const LAYERS: readonly LayerDef[] = [
  { id: 'recycle', name: 'Переработка', currency: 'Вторсырьё', playable: true, teaser: 'Сдай весь мусор на переработку и начни заново сильнее' },
  { id: 'sorting', name: 'Сортировка', currency: 'Фракции', playable: false, teaser: 'Пластик, металл, стекло и бумага, у каждого свои рецепты' },
  { id: 'reform', name: 'Реформа города', currency: 'Районы', playable: false, teaser: 'Город отдаёт районы под твои заводы' },
];

// ---- Recycling -------------------------------------------------------------

/** Trash collected in one run needed for the first recycle. */
export const RECYCLE_AT = D(1e12);
/**
 * Gain grows with the fourth root of run trash: 10 at the threshold, 100 at 10 000× more.
 * A slow root keeps the loop stable: more production means a bigger reward, but never
 * enough to make the next run explode.
 */
const GAIN_AT_THRESHOLD = 10;
const GAIN_ROOT = 4;
/**
 * Recycled material ever earned boosts all production by PASSIVE × sqrt(total):
 * +63% at 10, ×3 at 100, ×21 at 10 000. The square root keeps the bonus from feeding
 * on itself.
 */
export const PASSIVE = 0.2;

export function passiveBonus(total: Decimal): Decimal {
  return total.sqrt().mul(PASSIVE).add(1);
}

/** Recycled material a recycle would give right now. */
export function recycleGain(runTrash: Decimal): Decimal {
  if (runTrash.lt(RECYCLE_AT)) return D(0);
  return runTrash.div(RECYCLE_AT).root(GAIN_ROOT).mul(GAIN_AT_THRESHOLD).floor();
}

/** Run trash at which the gain goes up by one. */
export function nextGainAt(runTrash: Decimal): Decimal {
  const next = recycleGain(runTrash).add(1).max(GAIN_AT_THRESHOLD);
  // A hair over the exact point, so float rounding never shows a goal that is one short.
  return next.div(GAIN_AT_THRESHOLD).pow(GAIN_ROOT).mul(RECYCLE_AT).mul(1 + 1e-9);
}

export type Branch = 'production' | 'start' | 'automation' | 'offline';

export const BRANCHES: readonly [Branch, string][] = [
  ['production', 'Производство'],
  ['start', 'Старт'],
  ['automation', 'Автоматизация'],
  ['offline', 'Офлайн'],
];

export interface NodeDef {
  id: string;
  branch: Branch;
  name: string;
  /** What it does, in one line. */
  text: string;
  cost: Decimal;
  /** Node that must be bought first. */
  requires?: string;
}

export const NODES: readonly NodeDef[] = [
  { id: 'p1', branch: 'production', name: 'Сортировочные перчатки', text: 'Весь доход ×2', cost: D(2) },
  { id: 'p2', branch: 'production', name: 'Скидка на технику', text: 'Производители дешевле на 10%', cost: D(5), requires: 'p1' },
  { id: 'p3', branch: 'production', name: 'Двойная смена', text: 'Весь доход ×3', cost: D(15), requires: 'p2' },
  { id: 'p4', branch: 'production', name: 'Стахановский порог', text: 'Пороги дают ×3 вместо ×2', cost: D(150), requires: 'p3' },
  { id: 'p5', branch: 'production', name: 'Промышленный масштаб', text: 'Весь доход ×5', cost: D(600), requires: 'p4' },
  { id: 's1', branch: 'start', name: 'Подъёмные', text: 'Заход начинается с 10 сборщиками', cost: D(1) },
  { id: 's2', branch: 'start', name: 'Память о свалке', text: 'Открытые производители остаются, старт с 10 тыс кг', cost: D(4), requires: 's1' },
  { id: 's3', branch: 'start', name: 'Сохранённые чертежи', text: 'Первые улучшения производителей остаются', cost: D(12), requires: 's2' },
  { id: 's4', branch: 'start', name: 'Стартовый капитал', text: 'Старт со 100 млн кг', cost: D(60), requires: 's3' },
  { id: 'a1', branch: 'automation', name: 'Автозакупщик', text: 'Сам покупает самого выгодного производителя раз в 2 с', cost: D(3) },
  { id: 'a2', branch: 'automation', name: 'Шустрый закупщик', text: 'Автозакупщик срабатывает 4 раза в секунду', cost: D(20), requires: 'a1' },
  { id: 'o1', branch: 'offline', name: 'Ночной сторож', text: 'Офлайн копится до 2 суток', cost: D(2) },
  { id: 'o2', branch: 'offline', name: 'Вахтовый метод', text: 'Офлайн копится до 7 суток', cost: D(8), requires: 'o1' },
];

export function nodeById(id: string): NodeDef | undefined {
  return NODES.find((n) => n.id === id);
}

export const hasNode = (layer: LayerState, id: string) => layer.nodes.includes(id);

/** Whether the node can be bought now. */
export function canBuyNode(layer: LayerState, node: NodeDef): boolean {
  return !hasNode(layer, node.id) && (!node.requires || hasNode(layer, node.requires)) && layer.points.gte(node.cost);
}

/** Whether the node is next in its branch (its prerequisite is bought). */
export function isNodeOpen(layer: LayerState, node: NodeDef): boolean {
  return !node.requires || hasNode(layer, node.requires);
}

// ---- Effects, read by the rest of the game ----------------------------------

/** Multiplier on all production from Recycling: the passive bonus and the production branch. */
export function recycleProductionMult(layer: LayerState): Decimal {
  let mult = passiveBonus(layer.total);
  if (hasNode(layer, 'p1')) mult = mult.mul(2);
  if (hasNode(layer, 'p3')) mult = mult.mul(3);
  if (hasNode(layer, 'p5')) mult = mult.mul(5);
  return mult;
}

export const producerCostMult = (layer: LayerState) => (hasNode(layer, 'p2') ? 0.9 : 1);

export const milestoneBase = (layer: LayerState) => (hasNode(layer, 'p4') ? 3 : 2);

export function offlineCapSeconds(layer: LayerState): number {
  const day = 24 * 60 * 60;
  return hasNode(layer, 'o2') ? 7 * day : hasNode(layer, 'o1') ? 2 * day : day;
}

/** Seconds between auto-buyer purchases, or null when the player has none. */
export function autobuyInterval(layer: LayerState): number | null {
  return hasNode(layer, 'a2') ? 0.25 : hasNode(layer, 'a1') ? 2 : null;
}
