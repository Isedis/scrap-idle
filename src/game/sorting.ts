import { D, Decimal } from './num';

/**
 * Sorting, the second prestige layer.
 *
 * Its core is the sorting line, which runs all the time once the layer opens: a stream
 * from the heap passes stations in order, each pulls its own fraction out and, being
 * not perfectly clean, throws away a little of the others. What no station takes is
 * tails: it goes back into the heap and feeds the thing under it. Now and then an
 * unidentified item comes down the belt; the inspection table looks at it and finds
 * fractions, a unique piece of waste, or something that should not be on a belt.
 *
 * The reset, Resorting, burns all of Recycling; ranks earned by resorting give the
 * comforts back.
 */

export type Frac = 'plastic' | 'metal' | 'glass' | 'paper';
export const FRACS: readonly Frac[] = ['plastic', 'metal', 'glass', 'paper'];
export const FRAC_NAMES: Record<Frac, string> = { plastic: 'Пластик', metal: 'Металл', glass: 'Стекло', paper: 'Бумага' };
export const FRAC_SHORT: Record<Frac, string> = { plastic: 'пл', metal: 'мет', glass: 'ст', paper: 'бум' };
/** One letter per fraction, as the belt shows them. */
export const FRAC_LETTER: Record<Frac, string> = { plastic: 'П', metal: 'М', glass: 'С', paper: 'Б' };

/** What the stream from the heap is made of; the rest of it is unidentified. */
export const STREAM: Record<Frac, number> = { plastic: 0.35, paper: 0.25, metal: 0.15, glass: 0.15 };

export type StationId = 'optic' | 'magnet' | 'sieve' | 'blower' | 'briquetter' | 'crusher';

export interface StationDef {
  id: StationId;
  name: string;
  /** Fraction it pulls out; none for the two special stations. */
  frac?: Frac;
  text: string;
  /** Fraction its levels are paid in. */
  pays: Frac;
  /** Recipe that unlocks it; the four sorting stations are there from the start. */
  recipe?: string;
}

export const STATIONS: readonly StationDef[] = [
  { id: 'optic', name: 'Оптический датчик', frac: 'plastic', pays: 'plastic', text: 'Узнаёт пластик по блеску' },
  { id: 'magnet', name: 'Магнит', frac: 'metal', pays: 'metal', text: 'Тянет металл. И кое-что ещё' },
  { id: 'sieve', name: 'Сито', frac: 'glass', pays: 'glass', text: 'Пропускает всё, кроме стекла' },
  { id: 'blower', name: 'Воздушный сепаратор', frac: 'paper', pays: 'paper', text: 'Сдувает бумагу с ленты' },
  { id: 'briquetter', name: 'Брикетёр', pays: 'paper', recipe: 'l2', text: 'Прессует всё, что взяли станции до него: их выход ×1.5' },
  { id: 'crusher', name: 'Дробилка', pays: 'metal', recipe: 'l4', text: 'Перемалывает то, что прошло мимо: хвостов вдвое меньше. Станциям после неё достаётся меньше' },
];

export const stationById = (id: string) => STATIONS.find((s) => s.id === id);

export interface StationLevels {
  /** Speed: how much of its own fraction it catches. For the briquetter, how hard it presses. */
  speed: number;
  /** Purity: how little of the others it spoils. For the crusher, how fine it grinds. */
  purity: number;
}

// ---- Line math ---------------------------------------------------------------------

/** Share of its own fraction a sorting station catches: 40% at level 0, nearing 100%. */
export const capture = (speed: number) => 1 - 0.6 * 0.85 ** speed;
/** Share of every other fraction it spoils on the way: 25% at level 0. */
export const impurity = (purity: number) => 0.25 * 0.8 ** purity;
/** The briquetter multiplies what was caught before it. */
export const press = (speed: number) => 1.5 + 0.1 * speed;
/** Share of what passes that the crusher grinds away. */
export const crush = (purity: number) => 1 - 0.5 * 0.85 ** purity;

export const speedCost = (level: number) => D(10).mul(Decimal.pow(1.8, level));
export const purityCost = (level: number) => D(15).mul(Decimal.pow(2, level));

export interface LineResult {
  /** Share of the stream each fraction ends up as, after every station. */
  caught: Record<Frac, number>;
  /** Share of the stream nobody took: it goes back into the heap. */
  tails: number;
  /** What each slot did, for the screen: share caught, share spoiled, and what rode on past it. */
  slots: { caught: number; spoiled: number; after: Record<Frac, number> }[];
}

/** Runs one unit of stream down the line. */
export function runLine(line: readonly (StationId | null)[], levels: Partial<Record<StationId, StationLevels>>): LineResult {
  const stream: Record<Frac, number> = { ...STREAM };
  const caught: Record<Frac, number> = { plastic: 0, metal: 0, glass: 0, paper: 0 };
  const slots: LineResult['slots'] = [];
  for (const id of line) {
    const def = id ? stationById(id) : undefined;
    const lv = (id && levels[id]) || { speed: 0, purity: 0 };
    let took = 0;
    let spoiled = 0;
    if (def?.frac) {
      const grab = stream[def.frac] * capture(lv.speed);
      stream[def.frac] -= grab;
      caught[def.frac] += grab;
      took = grab;
      for (const f of FRACS) {
        if (f === def.frac) continue;
        const lost = stream[f] * impurity(lv.purity);
        stream[f] -= lost;
        spoiled += lost;
      }
    } else if (id === 'briquetter') {
      const m = press(lv.speed);
      for (const f of FRACS) caught[f] *= m;
    } else if (id === 'crusher') {
      const c = crush(lv.purity);
      for (const f of FRACS) {
        spoiled += stream[f] * c;
        stream[f] *= 1 - c;
      }
    }
    slots.push({ caught: took, spoiled, after: { ...stream } });
  }
  const passing = FRACS.reduce((sum, f) => sum + stream[f], 0);
  const total = FRACS.reduce((sum, f) => sum + STREAM[f], 0);
  return { caught, tails: passing / total, slots };
}

/** Tails make the thing rise faster: ×1.6 with nothing sorted at all. */
export const TAILS_THREAT = 0.6;

// ---- Inspection table ------------------------------------------------------------

/** Seconds between unidentified items coming down the belt. */
export const UNKNOWN_EVERY = 90;
/** Seconds to look at one item, before recipes and finds. */
export const INSPECT_SECONDS = 120;
export const QUEUE_BASE = 3;
/** An item that fell off a full table goes back into the heap. */
export const OVERFLOW_THREAT = 0.02;
/** An anomaly on the table pushes the threat up by this much. */
export const ANOMALY_THREAT = 0.15;

export type UniqueKind = 'income' | 'flow' | 'inspect' | 'threat' | 'gain' | 'lump' | 'queue' | Frac;

export interface UniqueDef {
  id: string;
  name: string;
  text: string;
  kind: UniqueKind;
  /** Multiplier, or extra places for `queue`. */
  value: number;
}

/** Unique waste, found in this order: the further, the less it looks like waste. */
export const UNIQUES: readonly UniqueDef[] = [
  { id: 'lantern', name: 'Фонарь Игнатьева', text: 'Батарейки свежие. Кто-то их менял.', kind: 'threat', value: 0.95 },
  { id: 'boot', name: 'Детский ботинок, 1987', text: 'Шнурок завязан двойным узлом. Изнутри.', kind: 'income', value: 1.1 },
  { id: 'bag', name: 'Пакет с пакетами', text: 'Внутри пакеты. Внутри них тоже. Дна пока не нашли.', kind: 'plastic', value: 1.25 },
  { id: 'letter', name: 'Магнитная буква «Ы»', text: 'С холодильника. Холодильник на камере был открыт.', kind: 'metal', value: 1.25 },
  { id: 'eye', name: 'Стеклянный глаз', text: 'Тёплый. Смотрит на ленту, а не на вас. Пока.', kind: 'glass', value: 1.25 },
  { id: 'bottle', name: 'Бутылка с запиской', text: 'В записке одно слово: «не сортируй». Почерк Игнатьева.', kind: 'paper', value: 1.25 },
  { id: 'token', name: 'Жетон метро, 1991', text: 'Станции, на которой его выдали, нет на схеме.', kind: 'gain', value: 1.15 },
  { id: 'key', name: 'Ключ от купола', text: 'Купол заварен с 1994 года. Ключ блестит.', kind: 'flow', value: 1.15 },
  { id: 'tape', name: 'Кассета КАМ-01', text: 'На записи этот пульт. За пультом кто-то сидит. Затылок знакомый.', kind: 'inspect', value: 1.25 },
  { id: 'helmet', name: 'Каска с вмятиной изнутри', text: 'Вмятина по форме ладони. Ладонь была больше головы.', kind: 'threat', value: 0.95 },
  { id: 'list', name: 'Список смены', text: 'Девять фамилий. Восемь зачёркнуты. Девятая — ваша.', kind: 'income', value: 1.25 },
  { id: 'tooth', name: 'Зуб', text: 'Не человеческий. Не звериный. Ещё растёт.', kind: 'queue', value: 1 },
  { id: 'report', name: 'Отчёт Ланской', text: '«Куча ничего не уничтожает. Она запоминает». Дальше страницы склеены.', kind: 'inspect', value: 1.25 },
  { id: 'radio', name: 'Радио', text: 'Ловит одну волну. На ней КАМ-00 диктует цифры.', kind: 'flow', value: 1.15 },
  { id: 'glove', name: 'Перчатка на шесть пальцев', text: 'Рабочая. Размер ваш. Палец лишний.', kind: 'income', value: 1.15 },
  { id: 'mug', name: 'Ваша кружка', text: 'Ещё тёплая. Вы её не выбрасывали. Вы её не приносили.', kind: 'income', value: 1.15 },
  { id: 'photo', name: 'Снимок свалки сверху', text: 'Куча на нём похожа на лицо. Ширина лица — 400 метров.', kind: 'gain', value: 1.15 },
  { id: 'sign', name: 'Табличка «Не копать»', text: 'Снизу дописано: «он слышит лопату».', kind: 'threat', value: 0.9 },
  { id: 'sand', name: 'Ведро чужого песка', text: 'Песок сухой. Под ним мокро. Мокро шевелится.', kind: 'queue', value: 1 },
  { id: 'sack', name: 'Мешок «ВТОРСЫРЬЁ. ОПЕРАТОР»', text: 'Бирка с инвентарным номером. Номер — ваш табельный.', kind: 'lump', value: 1.25 },
  { id: 'lamp', name: 'Ржавый прожектор', text: 'Тот же, что над кучей. Над кучей он тоже висит.', kind: 'threat', value: 0.9 },
  { id: 'map', name: 'План свалки', text: 'Под кучей нарисован ещё один этаж. И ещё. Масштаб не указан.', kind: 'lump', value: 1.25 },
  { id: 'chair', name: 'Ножка от вашего стула', text: 'Вы проверили стул. Ножек четыре. Эта — пятая.', kind: 'flow', value: 1.25 },
  { id: 'breath', name: 'Кусок кучи, который дышит', text: 'Положили на стол. Стол стал тёплым. Дышат в такт.', kind: 'income', value: 1.5 },
];

/** Lines the terminal types when an anomaly lands on the table. */
export const ANOMALY_LINES = [
  'СТОЛ ОСМОТРА: ПРЕДМЕТ НЕ ОПОЗНАН. ПРЕДМЕТ ОПОЗНАЛ ВАС',
  'КАМ-02: НА ЛЕНТЕ ЛЕЖИТ ЧЕЛОВЕК. ЛЕНТА ОСТАНОВЛЕНА. ЛЕНТА ПОШЛА',
  'СТОЛ ОСМОТРА: ПРЕДМЕТ ТЁПЛЫЙ. ПРЕДМЕТ ПЕРЕВЕРНУЛСЯ',
  'КАМ-02: РУКА ИЗ ХВОСТОВ. ДЕРЖИТСЯ ЗА КРАЙ',
  'СТОЛ ОСМОТРА: ВНУТРИ СТУЧАТ',
];

// ---- Recipes ----------------------------------------------------------------------

export type Price = Partial<Record<Frac, number>>;

export interface RecipeDef {
  id: string;
  branch: 'line' | 'inspect' | 'economy' | 'automation';
  name: string;
  text: string;
  cost: Price;
  requires?: string;
}

export const RECIPE_BRANCHES: { id: RecipeDef['branch']; name: string }[] = [
  { id: 'line', name: 'Линия' },
  { id: 'inspect', name: 'Осмотр' },
  { id: 'economy', name: 'Хозяйство' },
  { id: 'automation', name: 'Автоматика' },
];

/**
 * Until the fourth slot, the line holds at most three stations, the two it starts with
 * (plastic, paper) and a magnet, so early recipes ask only for plastic, paper and metal.
 */
export const RECIPES: readonly RecipeDef[] = [
  { id: 'l1', branch: 'line', name: 'Третий слот', text: 'На ленте 3 места под станции', cost: { plastic: 150 } },
  { id: 'l2', branch: 'line', name: 'Брикетёр', text: 'Новая станция: умножает всё, что поймали станции до неё', cost: { plastic: 400, paper: 200 }, requires: 'l1' },
  { id: 'l3', branch: 'line', name: 'Четвёртый слот', text: 'На ленте 4 места', cost: { metal: 1500, paper: 800 }, requires: 'l2' },
  { id: 'l4', branch: 'line', name: 'Дробилка', text: 'Новая станция: вдвое меньше хвостов', cost: { glass: 3000, metal: 3000 }, requires: 'l3' },
  { id: 'l5', branch: 'line', name: 'Пятый слот', text: 'На ленте 5 мест', cost: { metal: 2e4, plastic: 1e4 }, requires: 'l4' },
  { id: 'l6', branch: 'line', name: 'Шестой слот', text: 'На ленте 6 мест', cost: { metal: 1.5e5, glass: 1.5e5 }, requires: 'l5' },
  { id: 'i1', branch: 'inspect', name: 'Лупа', text: 'Осмотр вдвое быстрее', cost: { paper: 120 } },
  { id: 'i2', branch: 'inspect', name: 'Полка', text: 'На столе ещё 2 места', cost: { paper: 600, plastic: 300 }, requires: 'i1' },
  { id: 'i3', branch: 'inspect', name: 'Лампа над столом', text: 'Осмотр вдвое быстрее', cost: { paper: 4000, metal: 2000 }, requires: 'i2' },
  { id: 'i4', branch: 'inspect', name: 'Опись', text: 'Уникальные отходы находятся вдвое чаще', cost: { paper: 3e4 }, requires: 'i3' },
  { id: 'e1', branch: 'economy', name: 'Гранулы', text: 'Весь доход ×3', cost: { plastic: 300 } },
  { id: 'e2', branch: 'economy', name: 'Стеклобой', text: 'Вторсырья за переработку ×2', cost: { plastic: 600, metal: 200 }, requires: 'e1' },
  { id: 'e3', branch: 'economy', name: 'Переплавка', text: 'Производители вдвое дешевле', cost: { metal: 2500 }, requires: 'e2' },
  { id: 'e4', branch: 'economy', name: 'Вторичный цикл', text: 'Фракций за пересортировку ×2', cost: { plastic: 5000, metal: 5000, glass: 5000, paper: 5000 }, requires: 'e3' },
  { id: 'e5', branch: 'economy', name: 'Широкая лента', text: 'Поток на ленту ×2', cost: { plastic: 4e4, paper: 4e4 }, requires: 'e4' },
  { id: 'a1', branch: 'automation', name: 'Автосортировщик', text: 'Скрипт sort: пересортировка сама', cost: { paper: 2000, metal: 1000 } },
];

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);

/** After the whole recipe tree: alloys, endless. */
export const ALLOY_FLOW = 1.5;
export const alloyCost = (level: number) => D(1e5).mul(Decimal.pow(4, level));

// ---- Resorting and ranks -----------------------------------------------------------

/** Recycled material earned this cycle needed to resort, and to start the line. */
export const SORT_AT = D(1e5);
/** Each resort needs this many times more Recycled material per cycle than the last, so they cannot be chained. */
export const SORT_NEED_GROWTH = 10;
export const sortNeed = (sorts: number) => SORT_AT.mul(Decimal.pow(SORT_NEED_GROWTH, sorts));

/** Fractions for a resort: 100 at the first threshold, ×10 per hundredfold. */
export const lumpFor = (cycleTotal: Decimal, mult: Decimal | number = 1) =>
  cycleTotal.lt(SORT_AT) ? D(0) : cycleTotal.div(SORT_AT).sqrt().mul(100).mul(mult).floor();

/** Every resort doubles all income for good. */
export const SORT_INCOME = 2;

export interface RankDef {
  at: number;
  text: string;
}

/** What resorting gives back, by the number of resorts done. */
export const RANKS: readonly RankDef[] = [
  { at: 1, text: 'Ветка «Автоматизация» и все скрипты остаются' },
  { at: 2, text: 'Каждый цикл начинается со 100 вторсырья' },
  { at: 3, text: 'Ветка «Старт» остаётся' },
  { at: 4, text: 'Ветка «Офлайн» остаётся' },
  { at: 5, text: 'Ветка «Производство» остаётся' },
  { at: 6, text: 'Ветка «Свет» остаётся' },
  { at: 7, text: 'Половина уровней бесконечных узлов остаётся' },
  { at: 10, text: 'Разгон и надёжность скриптов остаются' },
  { at: 15, text: '10% вторсырья за всё время остаётся' },
  { at: 20, text: 'Весь доход ×3, и ещё ×3 каждые 10 пересортировок' },
];

export const hasRank = (sorts: number, at: number) => sorts >= at;
/** Income from ranks past 20: ×3 at 20, 30, 40… */
export const rankIncome = (sorts: number) => (sorts < 20 ? 1 : 3 ** (Math.floor((sorts - 20) / 10) + 1));

// ---- State -------------------------------------------------------------------------

export interface SortingState {
  /** The line runs once Recycling has earned enough in one cycle, and stays on. */
  open: boolean;
  fractions: Record<Frac, Decimal>;
  /** Fractions earned over the whole game; never spent. */
  total: Decimal;
  sorts: number;
  line: (StationId | null)[];
  levels: Partial<Record<StationId, StationLevels>>;
  recipes: string[];
  alloys: number;
  /** Items waiting on the inspection table. */
  queue: number;
  /** Progress of the item being looked at, 0..1. */
  progress: number;
  /** Seconds toward the next unidentified item. */
  arrival: number;
  /** Items looked at over the whole game. */
  inspected: number;
  /** Unique waste found, in order. */
  found: string[];
  /** Seconds of the current cycle. */
  cycleSeconds: number;
  /** What happened on the table since the screen last looked; not saved. */
  news: Inspection[];
  /** The town's markets: every fraction comes this much more; set by the game each tick, not saved. */
  boost: Decimal;
}

export type Inspection = { kind: 'unique'; id: string } | { kind: 'anomaly'; line: string } | { kind: 'fractions'; amount: Decimal; frac: Frac };

export function newSorting(): SortingState {
  return {
    open: false,
    fractions: { plastic: D(0), metal: D(0), glass: D(0), paper: D(0) },
    total: D(0),
    sorts: 0,
    // Two slots to begin with, filled with the biggest fractions.
    line: ['optic', 'blower'],
    levels: {},
    recipes: [],
    alloys: 0,
    queue: 0,
    progress: 0,
    arrival: 0,
    inspected: 0,
    found: [],
    cycleSeconds: 0,
    news: [],
    boost: D(1),
  };
}

export const hasRecipe = (s: SortingState, id: string) => s.recipes.includes(id);

export function slotCount(s: SortingState): number {
  return 2 + ['l1', 'l3', 'l5', 'l6'].filter((id) => hasRecipe(s, id)).length;
}

export const stationOpen = (s: SortingState, def: StationDef) => !def.recipe || hasRecipe(s, def.recipe);
export const levelsOf = (s: SortingState, id: StationId): StationLevels => s.levels[id] ?? { speed: 0, purity: 0 };

const UNIQUE_BY_ID = new Map(UNIQUES.map((u) => [u.id, u]));

/** Product of every found unique of a kind; for `queue`, the sum. */
export function uniqueMult(s: SortingState, kind: UniqueKind): number {
  let m = kind === 'queue' ? 0 : 1;
  for (const id of s.found) {
    const u = UNIQUE_BY_ID.get(id);
    if (u?.kind !== kind) continue;
    m = kind === 'queue' ? m + u.value : m * u.value;
  }
  return m;
}

export const queueSize = (s: SortingState) => QUEUE_BASE + (hasRecipe(s, 'i2') ? 2 : 0) + uniqueMult(s, 'queue');
export const inspectSeconds = (s: SortingState) =>
  INSPECT_SECONDS / ((hasRecipe(s, 'i1') ? 2 : 1) * (hasRecipe(s, 'i3') ? 2 : 1) * uniqueMult(s, 'inspect'));

/** Stream onto the belt per second: grows with the order of magnitude of the trash income. */
export function flowPerSecond(s: SortingState, rate: Decimal): Decimal {
  const base = rate.add(1).log10().div(10);
  return base.mul((hasRecipe(s, 'e5') ? 2 : 1) * ALLOY_FLOW ** s.alloys * uniqueMult(s, 'flow'));
}

export const fracMult = (s: SortingState, f: Frac) => uniqueMult(s, f);

/** Fractions per second for each fraction at this income. */
export function lineRates(s: SortingState, rate: Decimal): Record<Frac, Decimal> {
  const { caught } = runLine(s.line.slice(0, slotCount(s)), s.levels);
  const flow = flowPerSecond(s, rate);
  const out = {} as Record<Frac, Decimal>;
  for (const f of FRACS) out[f] = flow.mul(caught[f] * fracMult(s, f)).mul(s.boost);
  return out;
}

export const tailsOf = (s: SortingState) => runLine(s.line.slice(0, slotCount(s)), s.levels).tails;

/** How much faster the threat climbs because of the tails and what was found. */
export function threatSpeed(s: SortingState): number {
  if (!s.open) return 1;
  return (1 + TAILS_THREAT * tailsOf(s)) * uniqueMult(s, 'threat');
}

/** Every fraction ever earned raises all income, spent or not: ×2 at 100, ×11 at 10 000. */
export const fractionsIncome = (total: Decimal) => total.sqrt().div(10).add(1);

/** Income multiplier from Sorting: resorts, fractions ever earned, recipes, finds and ranks. */
export function sortingIncome(s: SortingState): Decimal {
  return Decimal.pow(SORT_INCOME, s.sorts)
    .mul(fractionsIncome(s.total))
    .mul((hasRecipe(s, 'e1') ? 3 : 1) * uniqueMult(s, 'income') * rankIncome(s.sorts));
}

export const sortingGainMult = (s: SortingState) => (hasRecipe(s, 'e2') ? 2 : 1) * uniqueMult(s, 'gain');
export const sortingCostMult = (s: SortingState) => (hasRecipe(s, 'e3') ? 0.5 : 1);
export const lumpMult = (s: SortingState) => s.boost.mul((hasRecipe(s, 'e4') ? 2 : 1) * uniqueMult(s, 'lump'));

export function canAfford(s: SortingState, price: Price): boolean {
  return FRACS.every((f) => s.fractions[f].gte(price[f] ?? 0));
}

export function pay(s: SortingState, price: Price): void {
  for (const f of FRACS) s.fractions[f] = s.fractions[f].sub(price[f] ?? 0);
}

export function addFractions(s: SortingState, f: Frac, amount: Decimal): void {
  s.fractions[f] = s.fractions[f].add(amount);
  s.total = s.total.add(amount);
}

export function canBuyRecipe(s: SortingState, r: RecipeDef): boolean {
  return !hasRecipe(s, r.id) && (!r.requires || hasRecipe(s, r.requires)) && canAfford(s, r.cost);
}

export function buyRecipe(s: SortingState, id: string): boolean {
  const r = recipeById(id);
  if (!r || !canBuyRecipe(s, r)) return false;
  pay(s, r.cost);
  s.recipes.push(id);
  return true;
}

export const alloysOpen = (s: SortingState) => RECIPES.every((r) => hasRecipe(s, r.id));

export function buyAlloy(s: SortingState): boolean {
  if (!alloysOpen(s)) return false;
  const cost = alloyCost(s.alloys);
  const price: Price = { plastic: 0, metal: 0, glass: 0, paper: 0 };
  for (const f of FRACS) price[f] = cost.toNumber();
  if (!canAfford(s, price)) return false;
  pay(s, price);
  s.alloys += 1;
  return true;
}

export type LevelKind = keyof StationLevels;

export function levelCost(level: number, kind: LevelKind): Decimal {
  return kind === 'speed' ? speedCost(level) : purityCost(level);
}

export function buyLevel(s: SortingState, id: StationId, kind: LevelKind): boolean {
  const def = stationById(id);
  if (!def || !stationOpen(s, def)) return false;
  const lv = levelsOf(s, id);
  const cost = levelCost(lv[kind], kind);
  if (s.fractions[def.pays].lt(cost)) return false;
  s.fractions[def.pays] = s.fractions[def.pays].sub(cost);
  s.levels[id] = { ...lv, [kind]: lv[kind] + 1 };
  return true;
}

/** Puts a station into a slot; if it already stands elsewhere, the two swap. */
export function placeStation(s: SortingState, slot: number, id: StationId | null): boolean {
  if (slot < 0 || slot >= slotCount(s)) return false;
  if (id) {
    const def = stationById(id);
    if (!def || !stationOpen(s, def)) return false;
  }
  while (s.line.length < slotCount(s)) s.line.push(null);
  const from = id ? s.line.indexOf(id) : -1;
  if (from >= 0) s.line[from] = s.line[slot];
  s.line[slot] = id;
  return true;
}

/** Moves the station in a slot one place up (-1) or down (+1). */
export function moveStation(s: SortingState, slot: number, by: -1 | 1): boolean {
  const to = slot + by;
  if (to < 0 || to >= slotCount(s) || slot >= s.line.length) return false;
  while (s.line.length < slotCount(s)) s.line.push(null);
  [s.line[slot], s.line[to]] = [s.line[to], s.line[slot]];
  return true;
}

/**
 * Inspections it takes to find the k-th unique (0-based): the first right away, then ever
 * further apart (4th, 10th, 18th… the last near the 460th), so the collection lasts the
 * whole layer instead of an afternoon. The inventory halves the gaps.
 */
export function uniqueAt(k: number, inventory: boolean): number {
  return 1 + Math.floor((UNIQUE_SPREAD * k ** UNIQUE_CURVE) / (inventory ? 2 : 1));
}
const UNIQUE_SPREAD = 3;
const UNIQUE_CURVE = 1.6;

/** Whether this inspection finds the next unique. */
function uniqueTurn(s: SortingState): boolean {
  return s.inspected >= uniqueAt(s.found.length, hasRecipe(s, 'i4'));
}

/** What the next item on the table turns out to be. Anomalies only while someone is watching. */
export function inspectOne(s: SortingState, rates: Record<Frac, Decimal>, offline: boolean): Inspection {
  s.inspected += 1;
  const next = UNIQUES.find((u) => !s.found.includes(u.id));
  if (next && uniqueTurn(s)) {
    s.found.push(next.id);
    return { kind: 'unique', id: next.id };
  }
  if (!offline && s.inspected % 8 === 0) {
    return { kind: 'anomaly', line: ANOMALY_LINES[(s.inspected / 8) % ANOMALY_LINES.length] };
  }
  // Otherwise a bale of the fraction the line takes least of: a minute of the whole line, at least 10.
  const frac = FRACS.reduce((a, b) => (rates[a].lte(rates[b]) ? a : b));
  const all = FRACS.reduce((sum, f) => sum.add(rates[f]), D(0));
  const amount = all.mul(60).max(10).floor();
  addFractions(s, frac, amount);
  return { kind: 'fractions', amount, frac };
}

/** One slice of time on the line and the table. Returns the threat added by what fell back into the heap. */
export function sortingTick(s: SortingState, rate: Decimal, dt: number, offline: boolean): number {
  if (!s.open) return 0;
  s.cycleSeconds += dt;
  const rates = lineRates(s, rate);
  for (const f of FRACS) addFractions(s, f, rates[f].mul(dt));

  let threat = 0;
  s.arrival += dt;
  while (s.arrival >= UNKNOWN_EVERY) {
    s.arrival -= UNKNOWN_EVERY;
    if (s.queue < queueSize(s)) s.queue += 1;
    else threat += OVERFLOW_THREAT;
  }
  if (s.queue > 0) {
    s.progress += dt / inspectSeconds(s);
    while (s.progress >= 1 && s.queue > 0) {
      s.progress -= 1;
      s.queue -= 1;
      const result = inspectOne(s, rates, offline);
      if (result.kind === 'anomaly') threat += ANOMALY_THREAT;
      s.news.push(result);
    }
    if (s.queue === 0) s.progress = 0;
  }
  return threat;
}

/** What a unique find does, for the screen. */
export function describeUnique(u: UniqueDef): string {
  const x = `×${u.value}`;
  switch (u.kind) {
    case 'income':
      return `весь доход ${x}`;
    case 'flow':
      return `поток на ленту ${x}`;
    case 'inspect':
      return `осмотр быстрее ${x}`;
    case 'threat':
      return `угроза растёт медленнее: ${x}`;
    case 'gain':
      return `вторсырьё за переработку ${x}`;
    case 'lump':
      return `фракции за пересортировку ${x}`;
    case 'queue':
      return `+${u.value} место на столе осмотра`;
    default:
      return `${FRAC_NAMES[u.kind].toLowerCase()} с ленты ${x}`;
  }
}

export const uniqueById = (id: string) => UNIQUE_BY_ID.get(id);

/** A price as short text: «150 мет · 80 ст», or with other labels, «150 М · 80 С». */
export function priceText(price: Price, fmt: (n: Decimal) => string, labels: Record<Frac, string> = FRAC_SHORT): string {
  return FRACS.filter((f) => price[f])
    // Each amount stays on one line with its fraction when the price wraps.
    .map((f) => `${fmt(D(price[f]!))} ${labels[f]}`.replace(/ /g, '\u00a0'))
    .join(' · ');
}
