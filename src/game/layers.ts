import { D, Decimal } from './num';
import { OFFLINE_EFFICIENCY } from './threat';

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
  /** Levels of the endless nodes, by id. */
  repeats: Record<string, number>;
}

export function newLayer(): LayerState {
  return { points: D(0), total: D(0), resets: 0, nodes: [], bestSeconds: null, repeats: {} };
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
  { id: 'sorting', name: 'Сортировка', currency: 'Фракции', playable: true, teaser: 'Пластик, металл, стекло и бумага, у каждого свои рецепты' },
  { id: 'reform', name: 'Реформа города', currency: 'Гектары', playable: true, teaser: 'Город отдаёт кварталы под свалку' },
  { id: 'under', name: 'Под ямой', currency: '???', playable: false, teaser: 'Под чёрной ямой есть ещё одна свалка' },
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

/** Recycled material a recycle would give right now; `mult` comes from the recipe node. */
export function recycleGain(runTrash: Decimal, mult = 1): Decimal {
  if (runTrash.lt(RECYCLE_AT)) return D(0);
  return runTrash.div(RECYCLE_AT).root(GAIN_ROOT).mul(GAIN_AT_THRESHOLD * mult).floor();
}

/** The gain before rounding down, for judging when it stops paying to wait. */
export function recycleGainRaw(runTrash: Decimal, mult = 1): number {
  if (runTrash.lt(RECYCLE_AT)) return 0;
  return runTrash.div(RECYCLE_AT).root(GAIN_ROOT).mul(GAIN_AT_THRESHOLD * mult).toNumber();
}

/** Run trash at which the gain goes up by one. */
export function nextGainAt(runTrash: Decimal, mult = 1): Decimal {
  const next = recycleGain(runTrash, mult).add(1);
  // A hair over the exact point, so float rounding never shows a goal that is one short.
  return next.div(GAIN_AT_THRESHOLD * mult).pow(GAIN_ROOT).mul(RECYCLE_AT).max(RECYCLE_AT).mul(1 + 1e-9);
}

export type Branch = 'production' | 'start' | 'automation' | 'offline' | 'threat';

export const BRANCHES: readonly [Branch, string][] = [
  ['production', 'Производство'],
  ['start', 'Старт'],
  ['automation', 'Автоматизация'],
  ['offline', 'Офлайн'],
  ['threat', 'Свет'],
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
  /** Added after the endless nodes: not needed to open them, so nobody loses access they had. */
  extra?: boolean;
}

export const NODES: readonly NodeDef[] = [
  { id: 'p1', branch: 'production', name: 'Сортировочные перчатки', text: 'Весь доход ×2', cost: D(2) },
  { id: 'p2', branch: 'production', name: 'Скидка на технику', text: 'Производители дешевле на 10%', cost: D(5), requires: 'p1' },
  { id: 'p3', branch: 'production', name: 'Двойная смена', text: 'Весь доход ×3', cost: D(15), requires: 'p2' },
  { id: 'p4', branch: 'production', name: 'Стахановский порог', text: 'Пороги дают ×3 вместо ×2', cost: D(150), requires: 'p3' },
  { id: 'p5', branch: 'production', name: 'Промышленный масштаб', text: 'Весь доход ×5', cost: D(600), requires: 'p4' },
  { id: 'p6', branch: 'production', name: 'Ночные тарифы', text: 'Весь доход ×3', cost: D(1e6), requires: 'p5', extra: true },
  { id: 'p7', branch: 'production', name: 'Стальной порог', text: 'Пороги дают ×4', cost: D(1e8), requires: 'p6', extra: true },
  { id: 'p8', branch: 'production', name: 'Индустриальная зона', text: 'Весь доход ×5', cost: D(1e10), requires: 'p7', extra: true },
  { id: 's1', branch: 'start', name: 'Подъёмные', text: 'Заход начинается с 10 сборщиками', cost: D(1) },
  { id: 's2', branch: 'start', name: 'Память о свалке', text: 'Открытые производители остаются, старт с 10 тыс кг', cost: D(4), requires: 's1' },
  { id: 's3', branch: 'start', name: 'Сохранённые чертежи', text: 'Первые улучшения производителей остаются', cost: D(12), requires: 's2' },
  { id: 's4', branch: 'start', name: 'Стартовый капитал', text: 'Старт со 100 млн кг', cost: D(60), requires: 's3' },
  { id: 's5', branch: 'start', name: 'Готовые чертежи', text: 'Первые два улучшения каждого производителя остаются', cost: D(2e4), requires: 's4', extra: true },
  { id: 's6', branch: 'start', name: 'Заводской старт', text: 'Старт с 10 млрд кг', cost: D(2e5), requires: 's5', extra: true },
  { id: 'a1', branch: 'automation', name: 'Автозакупщик', text: 'Сам покупает самого выгодного производителя раз в 2 с', cost: D(3) },
  { id: 'a2', branch: 'automation', name: 'Шустрый закупщик', text: 'Автозакупщик срабатывает 4 раза в секунду', cost: D(20), requires: 'a1' },
  { id: 'a3', branch: 'automation', name: 'Автопереработчик', text: 'Сам перерабатывает, когда награда достигает порога', cost: D(80), requires: 'a2' },
  { id: 'a4', branch: 'automation', name: 'Бригадир', text: 'Скрипты покупок срабатывают 10 раз в секунду', cost: D(5000), requires: 'a3', extra: true },
  { id: 'a5', branch: 'automation', name: 'Диспетчер', text: 'Скрипты покупок не ждут такта: берут всё доступное сразу; buy.upgrades и buy.endless ставятся сами', cost: D(5e4), requires: 'a4', extra: true },
  { id: 'o1', branch: 'offline', name: 'Ночной сторож', text: 'Офлайн копится до 2 суток', cost: D(2) },
  { id: 'o2', branch: 'offline', name: 'Вахтовый метод', text: 'Офлайн копится до 7 суток', cost: D(8), requires: 'o1' },
  { id: 'o3', branch: 'offline', name: 'Сторожевой пёс', text: 'Вне игры доход ×0.75 вместо ×0.5', cost: D(500), requires: 'o2', extra: true },
  { id: 'o4', branch: 'offline', name: 'Ночной дозор', text: 'Офлайн копится до 30 суток', cost: D(5000), requires: 'o3', extra: true },
  { id: 't1', branch: 'threat', name: 'Мощная лампа', text: 'Прожектор держать 1 с вместо 1,5', cost: D(5), extra: true },
  { id: 't2', branch: 'threat', name: 'Тёмные очки', text: 'Бонус в темноте +0.2', cost: D(30), requires: 't1', extra: true },
  { id: 't3', branch: 'threat', name: 'Толстые стены', text: 'Угроза растёт на четверть медленнее', cost: D(500), requires: 't2', extra: true },
  { id: 't4', branch: 'threat', name: 'Второй прожектор', text: 'Автопрожектор ставится сам и отказывает вдвое реже', cost: D(5000), requires: 't3', extra: true },
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
  let mult = passiveBonus(layer.total).mul(Decimal.pow(MEMORY_MULT, layer.repeats.memory ?? 0));
  if (hasNode(layer, 'p1')) mult = mult.mul(2);
  if (hasNode(layer, 'p3')) mult = mult.mul(3);
  if (hasNode(layer, 'p5')) mult = mult.mul(5);
  if (hasNode(layer, 'p6')) mult = mult.mul(3);
  if (hasNode(layer, 'p8')) mult = mult.mul(5);
  return mult;
}

export const producerCostMult = (layer: LayerState) => (hasNode(layer, 'p2') ? 0.9 : 1);

export const milestoneBase = (layer: LayerState) => (hasNode(layer, 'p7') ? 4 : hasNode(layer, 'p4') ? 3 : 2);

export function offlineCapSeconds(layer: LayerState): number {
  const day = 24 * 60 * 60;
  return hasNode(layer, 'o4') ? 30 * day : hasNode(layer, 'o2') ? 7 * day : hasNode(layer, 'o1') ? 2 * day : day;
}

/** Share of income earned while the game is closed. */
export const offlineEfficiency = (layer: LayerState) => (hasNode(layer, 'o3') ? 0.75 : OFFLINE_EFFICIENCY);

/** How long the floodlight button must be held, in ms. */
export const holdMs = (layer: LayerState) => (hasNode(layer, 't1') ? 1000 : 1500);
/** Extra peak of the dark bonus from the tree. */
export const treeDarkPeak = (layer: LayerState) => (hasNode(layer, 't2') ? 0.2 : 0);
/** Threat speed from the tree. */
export const treeThreatSpeed = (layer: LayerState) => (hasNode(layer, 't3') ? 0.75 : 1);

// ---- Endless nodes ------------------------------------------------------------

export interface RepeatDef {
  id: 'memory' | 'recipe';
  name: string;
  /** Effect of one level. */
  text: string;
  baseCost: Decimal;
  growth: number;
}

/** Bought with Recycled material, any number of times, after the tree; never reset by recycling. */
export const REPEATS: readonly RepeatDef[] = [
  { id: 'memory', name: 'Память кучи', text: 'Весь доход ×1.2 за уровень', baseCost: D(50), growth: 2.5 },
  { id: 'recipe', name: 'Рецепт переработки', text: 'Вторсырья за переработку ×1.05 за уровень', baseCost: D(100), growth: 3 },
];

export const MEMORY_MULT = 1.2;
/** Each level multiplies the gain: a fixed +10% soon stopped mattering against a price that triples. */
export const RECIPE_MULT = 1.05;

export const repeatById = (id: string) => REPEATS.find((r) => r.id === id);

export function repeatCost(def: RepeatDef, level: number): Decimal {
  return def.baseCost.mul(Decimal.pow(def.growth, level)).floor();
}

/** Multiplier on Recycled material per recycle. */
export const gainMult = (layer: LayerState) => RECIPE_MULT ** (layer.repeats.recipe ?? 0);
