import { D, Decimal } from './num';

/** The bottom has independent excavation and a surface-waste supply line. */

// ---- Rarities and currencies -------------------------------------------------------

export type Rarity = 'dust' | 'scrap' | 'nonferrous' | 'antique' | 'relic' | 'anomaly';
export const RARITIES: readonly Rarity[] = ['dust', 'scrap', 'nonferrous', 'antique', 'relic', 'anomaly'];
export const RARITY_NAMES: Record<Rarity, string> = {
  dust: 'Труха',
  scrap: 'Лом',
  nonferrous: 'Цветмет',
  antique: 'Старина',
  relic: 'Реликвии',
  anomaly: 'Аномалии',
};

/**
 * Melting: this many of a currency make one of the next. The top of the ladder is the
 * УМЕ. Finds are worth much less melted than found: melting is for the surplus.
 */
export const MELT: Record<Exclude<Rarity, 'anomaly'>, number> & { anomaly: number } = {
  dust: 30,
  scrap: 12,
  nonferrous: 10,
  antique: 6,
  relic: 5,
  anomaly: 150,
};

// ---- Containers ---------------------------------------------------------------------

export type ContainerId = 'sack' | 'crate' | 'suitcase' | 'safe' | 'coffin';

export interface ContainerDef {
  id: ContainerId;
  name: string;
  /** Opening it costs this, in the currency below; a sack is free. */
  cost: number;
  costIn: Rarity;
  /** Chance of each rarity inside, in RARITIES order, before luck. */
  odds: readonly number[];
  /** How often it turns up per tonne dug, before the lamp. */
  weight: number;
}

export const CONTAINERS: readonly ContainerDef[] = [
  { id: 'sack', name: 'Мешок', cost: 0, costIn: 'dust', odds: [70, 25, 4.5, 0.5, 0, 0], weight: 70 },
  { id: 'crate', name: 'Ящик', cost: 1, costIn: 'scrap', odds: [35, 42, 17, 5, 1, 0], weight: 22 },
  { id: 'suitcase', name: 'Чемодан', cost: 1, costIn: 'nonferrous', odds: [10, 30, 38, 17, 4.6, 0.4], weight: 6 },
  { id: 'safe', name: 'Сейф', cost: 2, costIn: 'antique', odds: [0, 15, 38, 34, 11, 2], weight: 1.7 },
  { id: 'coffin', name: 'Гроб', cost: 1, costIn: 'relic', odds: [0, 0, 20, 45, 28, 7], weight: 0.3 },
];

export const containerById = (id: string) => CONTAINERS.find((c) => c.id === id);

// ---- Finds --------------------------------------------------------------------------

export type Epoch = 'medieval' | 'ancient' | 'prehistoric' | 'inhuman';

export interface ItemDef {
  id: string;
  name: string;
  text: string;
  rarity: Rarity;
  epoch: Epoch;
}

/** What one find pays in its own currency. */
export const YIELD: Record<Rarity, number> = { dust: 12, scrap: 4, nonferrous: 2, antique: 1, relic: 1, anomaly: 1 };

export interface EpochDef {
  id: Epoch;
  name: string;
  /** The set's bonus once every find of the epoch is in; repeats make it stronger. */
  bonus: string;
  /** Tonnes dug in all before its finds start to turn up: the deeper, the older. */
  depth: number;
}

export const EPOCHS: readonly EpochDef[] = [
  { id: 'medieval', name: 'Средневековье', bonus: 'Кирка ×1.25', depth: 0 },
  { id: 'ancient', name: 'Древность', bonus: 'Чутьё ×1.5: редкое в полтора раза чаще', depth: 1000 },
  { id: 'prehistoric', name: 'Доисторика', bonus: 'Весь доход наверху ×1000', depth: 4500 },
  { id: 'inhuman', name: 'Не люди', bonus: 'Переплавка на четверть выгоднее', depth: 11000 },
];

const item = (epoch: Epoch, rarity: Rarity, id: string, name: string, text: string): ItemDef => ({ id, name, text, rarity, epoch });

/** Ten finds per epoch: three dust, two scrap, two non-ferrous, one each of the rest. */
export const ITEMS: readonly ItemDef[] = [
  item('medieval', 'dust', 'sherd', 'Глиняный черепок', 'На обороте нацарапано число. Оно совпадает с сегодняшним.'),
  item('medieval', 'dust', 'lapot', 'Истлевший лапоть', 'Левый. Правый Игнатьев нашёл в 1986-м, на поверхности.'),
  item('medieval', 'dust', 'fishbone', 'Рыбья кость с меткой', 'Метка — крестик. Рыбе было не всё равно.'),
  item('medieval', 'scrap', 'arrowhead', 'Ржавый наконечник', 'Стрела летела вниз. Отсюда — вниз.'),
  item('medieval', 'scrap', 'horseshoe', 'Подкова', 'Прибита концами вниз. Счастье высыпалось.'),
  item('medieval', 'nonferrous', 'buckle', 'Медная пряжка', 'Застёгнута. Ремня нет, а держит.'),
  item('medieval', 'nonferrous', 'pewtercross', 'Оловянный крестик', 'Перевёрнут не руками: металл сам так застыл.'),
  item('medieval', 'antique', 'birchbark', 'Берестяная грамота', '«Не копай. Оно доброе, пока спит». Почерк ровный.'),
  item('medieval', 'relic', 'helm', 'Шлем без затылка', 'Затылок не отломан. Его не было с самого начала.'),
  item('medieval', 'anomaly', 'bell', 'Колокол без языка', 'Звонит, когда его никто не трогает. Под землёй слышно.'),

  item('ancient', 'dust', 'amphora', 'Осколок амфоры', 'Внутри липко. Пахнет как столовая НИИ.'),
  item('ancient', 'dust', 'embers', 'Угли чужого костра', 'Тёплые. Костёр жгли не здесь и не сейчас.'),
  item('ancient', 'dust', 'grain', 'Зерно, проросшее в темноте', 'Росток белый и тянется не вверх.'),
  item('ancient', 'scrap', 'sickle', 'Бронзовый серп', 'Наточен. Недавно.'),
  item('ancient', 'scrap', 'spear', 'Согнутое копьё', 'Согнуто руками. Пальцы оставили вмятины.'),
  item('ancient', 'nonferrous', 'curse', 'Свинцовая табличка', 'Проклятие на имя оператора. Имя ваше. Буквы греческие.'),
  item('ancient', 'nonferrous', 'coin', 'Монета с профилем', 'Профиль ваш. Год чеканки стёрт пальцем.'),
  item('ancient', 'antique', 'waxtab', 'Восковая табличка', 'Счёт: «…и ещё одна свалка». Под ним — ещё одна строка, свежая.'),
  item('ancient', 'relic', 'mask', 'Маска с заросшими глазами', 'Глазницы затянуты кожей. Изнутри маска мокрая.'),
  item('ancient', 'anomaly', 'seajar', 'Сосуд с морем', 'Внутри слышно море. Холодное. Моря здесь не было никогда.'),

  item('prehistoric', 'dust', 'nut', 'Окаменевший орех', 'Внутри что-то перекатывается.'),
  item('prehistoric', 'dust', 'handprint', 'Отпечаток ладони', 'В глине. Шесть пальцев.'),
  item('prehistoric', 'dust', 'bearsooth', 'Зуб пещерного медведя', 'С пломбой.'),
  item('prehistoric', 'scrap', 'stoneaxe', 'Каменный топор', 'Ещё тёплый. Рукоять из пластика.'),
  item('prehistoric', 'scrap', 'tally', 'Кость с насечками', 'Насечек 1987. Последняя глубже остальных.'),
  item('prehistoric', 'nonferrous', 'nugget', 'Самородок со следом', 'След подошвы. Размер сорок третий. Ваш.'),
  item('prehistoric', 'nonferrous', 'meteor', 'Метеоритное железо', 'Упало снизу.'),
  item('prehistoric', 'antique', 'venus', 'Фигурка из обёрток', 'Склеена смолой из фантиков, которых тогда не было.'),
  item('prehistoric', 'relic', 'skull', 'Зашитый череп', 'Дыра зашита леской. Леска советская, ГОСТ.'),
  item('prehistoric', 'anomaly', 'amber', 'Янтарь с кнопкой', 'Внутри застыла кнопка «ПУСК». Нажата.'),

  item('inhuman', 'dust', 'plastic', 'Пластик, которого не делали', 'Тёплый, мягкий, со штрихкодом из одних нулей.'),
  item('inhuman', 'dust', 'scale', 'Чешуйка с ладонь', 'Прозрачная. Сквозь неё видно не то, что за ней.'),
  item('inhuman', 'dust', 'thread', 'Нить без конца', 'Игнатьев тянул её неделю. Конец не показался.'),
  item('inhuman', 'scrap', 'part', 'Деталь без назначения', 'Подходит ко всему. Ничего не делает. Пока.'),
  item('inhuman', 'scrap', 'bolt', 'Болт с резьбой внутрь', 'Его закручивают в пустоту.'),
  item('inhuman', 'nonferrous', 'wire', 'Проволока «Ы»', 'Свернулась в букву сама. Каждую ночь в другую.'),
  item('inhuman', 'nonferrous', 'sideless', 'Монета без сторон', 'Падает и не ложится.'),
  item('inhuman', 'antique', 'bigmap', 'План свалки сверху', 'Свалка на плане больше Земли. Масштаб — «1 : вы».'),
  item('inhuman', 'relic', 'terminal', 'Включённый терминал', 'УТИЛЬ-ОС. На экране: «ОПЕРАТОР, ВЫ ОПОЗДАЛИ НА СМЕНУ».'),
  item('inhuman', 'anomaly', 'box', 'Коробка с пустотой', 'Внутри пусто. Пустота тяжелее коробки.'),
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

// ---- Ignatyev's tools ---------------------------------------------------------------

export type ToolId = 'pick' | 'lamp' | 'luck';

export interface ToolDef {
  id: ToolId;
  name: string;
  text: string;
  /** Price of level n: base · growth^n, in the currency below. */
  base: number;
  growth: number;
  costIn: Rarity;
  max: number;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'pick', name: 'Кирка', text: 'Копает на 30% быстрее за уровень', base: 60, growth: 1.7, costIn: 'dust', max: 25 },
  { id: 'lamp', name: 'Фонарь', text: 'Ценная тара попадается чаще: +12% за уровень на каждую ступень', base: 8, growth: 1.8, costIn: 'scrap', max: 15 },
  { id: 'luck', name: 'Чутьё', text: 'Редкое внутри на 20% чаще за уровень', base: 4, growth: 1.9, costIn: 'nonferrous', max: 15 },
];

export const toolCost = (t: ToolDef, level: number) => D(t.base).mul(Decimal.pow(t.growth, level)).floor();

/** Automatic opening: first the free and cheap ones, then everything. */
export const AUTO_OPEN: readonly { cost: number; costIn: Rarity; upTo: ContainerId; name: string }[] = [
  { cost: 3, costIn: 'antique', upTo: 'crate', name: 'Сам вскрывает мешки и ящики' },
  { cost: 2, costIn: 'relic', upTo: 'coffin', name: 'Сам вскрывает всё' },
];

// ---- The world above, as it reaches the bottom -------------------------------------

/** The old town supplies the first recovery materials after descent. */
export const START_HEAP = 300;
export const startHeap = (total: Decimal) => START_HEAP + 50 * Math.min(10, Math.max(0, Math.floor(total.add(1).log10().toNumber() / 10)));
/** Excavation power before strata resistance and equipment. */
export const BASE_DIG = 2;
/**
 * Tonnes a minute that fall in from above: a few per power of ten of trash collected up
 * there since the descent. A logarithm keeps the material supply bounded relative
 * to the runaway upper economy.
 */
export const FALL_PER_DIGIT = 0.1;
export const fallPerMinute = (aboveTrash: Decimal, development = 0) => Math.min(30,
  FALL_PER_DIGIT * Math.max(0, aboveTrash.add(1).log10().toNumber()) * (1 + 0.05 * development));

/** Pity: a find of at least this rarity comes no later than after this many openings. */
export const PITY: readonly [Rarity, number][] = [
  ['antique', 50],
  ['relic', 200],
];

/** Each epoch set gains this much more for every repeat of its finds past the first. */
export const REPEAT_STEP = 0.01;
export const REPEAT_CAP = 1;

// ---- State --------------------------------------------------------------------------

export interface BottomState {
  /** Opened by the descent; stays open. */
  open: boolean;
  /** Surface waste awaiting recovery; never limits excavation. */
  heap: number;
  /** Surface tonnes recovered separately from excavation. */
  supplied: number;
  equipment: { hoist: boolean; bench: boolean; borer: number };
  route: 'auto' | 'depth' | 'site' | 'seam';
  siteId: EquipmentId | 'borer';
  objectWork: Record<EquipmentId | 'borer', number>;
  benchMode: 'scrap' | 'nonferrous';
  seamProgress: number;
  seamFound: number;
  firstUmeGranted: boolean;
  firstUmePresented: boolean;
  /** Fraction of a tonne dug toward the next container. */
  dig: number;
  /** Tonnes dug in all: how deep the miner has gone, which epochs he has reached. */
  dug: number;
  /** Containers dug out and waiting. */
  stock: Record<ContainerId, number>;
  money: Record<Rarity, Decimal>;
  tools: Record<ToolId, number>;
  /** Levels of automatic opening bought (0..AUTO_OPEN.length). */
  auto: number;
  /** One purchase protected from automatic container fees. */
  saving: string | null;
  /** Openings since a find of each pity rarity or better. */
  dry: Record<string, number>;
  /** Times each find came up. */
  found: Record<string, number>;
  opened: number;
  /** Ultra-waste units, spent on permanent borer upgrades. */
  ume: Decimal;
  umeMade: Decimal;
  supplyExtension: boolean;
  /** Trash collected above since the descent: what keeps falling in. */
  above: Decimal;
  /** Scripts of the world above bought with currencies from here. */
  scripts: string[];
  /** The last openings, newest first, for the screen; not saved. */
  recent: Opening[];
  /** Bounded, unsaved presentation feed: automatic rewards are already paid. */
  autoFeed: { count: number; best: Opening | null };
}

const zeroMoney = (): Record<Rarity, Decimal> => ({ dust: D(0), scrap: D(0), nonferrous: D(0), antique: D(0), relic: D(0), anomaly: D(0) });

export const newBottom = (): BottomState => ({
  open: false,
  heap: 0,
  supplied: 0,
  equipment: { hoist: false, bench: false, borer: 0 },
  route: 'auto',
  siteId: 'hoist',
  objectWork: { hoist: 0, bench: 0, borer: 0 },
  benchMode: 'scrap',
  seamProgress: 0,
  seamFound: 0,
  firstUmeGranted: false,
  firstUmePresented: false,
  dig: 0,
  dug: 0,
  stock: { sack: 0, crate: 0, suitcase: 0, safe: 0, coffin: 0 },
  money: zeroMoney(),
  tools: { pick: 0, lamp: 0, luck: 0 },
  auto: 0,
  saving: null,
  dry: {},
  found: {},
  opened: 0,
  ume: D(0),
  umeMade: D(0),
  supplyExtension: false,
  above: D(0),
  scripts: [],
  recent: [],
  autoFeed: { count: 0, best: null },
});

// ---- Collection ---------------------------------------------------------------------

export const epochItems = (epoch: Epoch) => ITEMS.filter((i) => i.epoch === epoch);
export const epochDone = (b: BottomState, epoch: Epoch) => epochItems(epoch).every((i) => (b.found[i.id] ?? 0) > 0);

/** How strong a finished set is: 1, plus a bit for every repeat of its finds. */
export function setPower(b: BottomState, epoch: Epoch): number {
  if (!epochDone(b, epoch)) return 0;
  const repeats = epochItems(epoch).reduce((s, i) => s + Math.max(0, (b.found[i.id] ?? 0) - 1), 0);
  return 1 + Math.min(REPEAT_CAP, REPEAT_STEP * repeats);
}

/** Older strata take more work per tonne; tools improve power, not surface throughput. */
export const STRATUM_DENSITY = 6000;
export const DIG_SCRAP = 0.5;
export const DIG_NONFERROUS = 0.35;
const digPower = (b: BottomState) => BASE_DIG * 1.3 ** b.tools.pick
  * (b.equipment.hoist ? 1.25 : 1) * 1.5 ** b.equipment.borer
  * (setPower(b, 'medieval') ? 1 + 0.25 * setPower(b, 'medieval') : 1);
export const digRate = (b: BottomState, fall = 0) => digPower(b) * pressure(b, fall) / (1 + b.dug / STRATUM_DENSITY);
export const supplyRate = (b: BottomState) => b.equipment.hoist ? b.supplyExtension ? 9 : 6 : 2;
export const pressure = (b: BottomState, fall: number) => 1 + 0.05 * Math.min(5, Math.max(0, fall - (b.equipment.hoist ? 6 : 2)));
export const OBJECT_WORK = { hoist: 120, bench: 300, borer: 600 } as const;
export const objectReady = (b: BottomState, id: EquipmentId | 'borer') => b.objectWork[id] >= OBJECT_WORK[id];
export const objectUnlocked = (b: BottomState, id: EquipmentId | 'borer') => b.dug >= (id === 'borer' ? 11000 : EQUIPMENT.find((e) => e.id === id)!.depth);
export const objectBought = (b: BottomState, id: EquipmentId | 'borer') => id === 'borer' ? b.equipment.borer > 0 : b.equipment[id];
/** Completed deep sectors improve every find, without requiring a full collection. */
export const DEEP_SECTOR = 11000;
export const deepSectors = (b: BottomState) => Math.max(0, Math.floor(b.dug / DEEP_SECTOR) - 1);
export const findMultiplier = (b: BottomState) => 1 + deepSectors(b) * 0.1;

export const EQUIPMENT = [
  { id: 'hoist', name: 'Подъёмник', depth: 1000, cost: 40, costIn: 'scrap', text: 'Снабжение 6 т/мин вместо 2; раскопки на 25% быстрее' },
  { id: 'bench', name: 'Разборочный стол', depth: 4500, cost: 12, costIn: 'nonferrous', text: 'Из каждой тонны сверху дополнительно извлекает 0,25 лома' },
] as const;
export type EquipmentId = typeof EQUIPMENT[number]['id'];

export function buyEquipment(b: BottomState, id: EquipmentId): boolean {
  const e = EQUIPMENT.find((e) => e.id === id)!;
  if (!b.open || !objectUnlocked(b, id) || !objectReady(b, id) || b.equipment[id] || b.money[e.costIn].lt(e.cost)) return false;
  b.money[e.costIn] = b.money[e.costIn].sub(e.cost);
  b.equipment[id] = true;
  if (b.saving === `equipment:${id}`) b.saving = null;
  return true;
}

export const borerCost = (b: BottomState) => D(2).pow(b.equipment.borer);
export function buyBorer(b: BottomState): boolean {
  if (!b.open || !umeOpen(b) || (b.equipment.borer === 0 && !objectReady(b, 'borer')) || b.ume.lt(borerCost(b))) return false;
  b.ume = b.ume.sub(borerCost(b));
  b.equipment.borer++;
  if (b.saving === 'borer') b.saving = null;
  return true;
}

/** The single persistent depth target, shared by the panel and guidance. */
export function depthTarget(b: BottomState): { name: string; from: number; to: number; reward: string } {
  const next = EPOCHS.findIndex((e) => e.depth > b.dug);
  if (next >= 0) return { name: EPOCHS[next].name, from: EPOCHS[next - 1].depth, to: EPOCHS[next].depth,
    reward: next === 1 ? 'Новые находки и подъёмник' : next === 2 ? 'Новые находки и разборочный стол' : 'Новые находки и неизвестный механизм' };
  const to = (Math.floor(b.dug / DEEP_SECTOR) + 1) * DEEP_SECTOR;
  return { name: `Глубинный пласт ${Math.floor(b.dug / DEEP_SECTOR)}`, from: to - DEEP_SECTOR, to,
    reward: 'Добыча из каждой находки ещё +10% от базовой' };
}
export const meltBonus = (b: BottomState) => (setPower(b, 'inhuman') ? 1 + 0.25 * setPower(b, 'inhuman') : 1);
/** Income multiplier the bottom sends up. */
export const aboveIncome = (b: BottomState) => (setPower(b, 'prehistoric') ? D(1000).pow(setPower(b, 'prehistoric')) : D(1));

// ---- Digging ------------------------------------------------------------------------

/** Each lamp level makes every next kind of container this much likelier than the one before. */
export const LAMP_STEP = 1.12;

/** Odds of each container per tonne, with the lamp. */
export function containerOdds(b: BottomState): number[] {
  return CONTAINERS.map((c, i) => c.weight * LAMP_STEP ** (b.tools.lamp * i));
}

function pick<T>(items: readonly T[], weights: readonly number[], r: number): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x < 0) return items[i];
  }
  return items[items.length - 1];
}

const OBJECT_ORDER: readonly (EquipmentId | 'borer')[] = ['hoist', 'bench', 'borer'];
const OBJECT_DEPTH = { hoist: 1000, bench: 4500, borer: 11000 } as const;

export function activeObject(b: BottomState): EquipmentId | 'borer' | null {
  const available = OBJECT_ORDER.filter((id) => objectUnlocked(b, id) && !objectReady(b, id) && !objectBought(b, id));
  if (b.route === 'auto') return available[0] ?? null;
  return b.route === 'site' && available.includes(b.siteId) ? b.siteId : null;
}

/** Surface recovery and exact excavation across site/depth milestones. */
export function bottomTick(b: BottomState, seconds: number, fall: number, rand: () => number): number {
  if (!b.open || !Number.isFinite(seconds) || seconds <= 0) return 0;
  const minutes = seconds / 60;
  b.heap += Math.max(0, fall) * minutes;
  const recovered = Math.min(b.heap, supplyRate(b) * minutes);
  b.heap = Math.max(0, b.heap - recovered);
  b.supplied += recovered;
  b.money.dust = b.money.dust.add(recovered);
  if (b.equipment.bench) {
    if (b.benchMode === 'scrap') b.money.scrap = b.money.scrap.add(recovered * 0.25);
    else b.money.nonferrous = b.money.nonferrous.add(recovered * 0.12);
  }

  const density = STRATUM_DENSITY;
  let left = minutes;
  let excavated = 0;
  for (let guard = 0; left > 1e-10 && guard < 20; guard++) {
    if (b.dug >= 11000 && !b.firstUmeGranted) {
      b.ume = b.ume.add(1);
      b.firstUmeGranted = true;
    }
    const site = activeObject(b);
    const seam = b.route === 'seam' && b.equipment.borer > 0;
    const depthShare = seam ? 0 : site ? b.equipment.hoist ? 0.25 : 0 : 1;
    const sideShare = 1 - depthShare;
    const power = digPower(b) * pressure(b, fall);
    const k = 1 + b.dug / density;
    const timeForDepth = (delta: number) => (k * delta + delta * delta / (2 * density)) / (power * depthShare);
    const nextDepth = OBJECT_ORDER.map((id) => OBJECT_DEPTH[id]).find((d) => d > b.dug + 1e-8);
    let step = left;
    if (depthShare && nextDepth !== undefined) step = Math.min(step, timeForDepth(nextDepth - b.dug));
    if (site) {
      const remaining = OBJECT_WORK[site] - b.objectWork[site];
      const needed = depthShare ? timeForDepth(remaining * depthShare / sideShare) : remaining * k / (power * sideShare);
      step = Math.min(step, needed);
    }
    if (step <= 1e-12) break;
    const depth = depthShare
      ? 2 * power * depthShare * step / (k + Math.sqrt(k * k + 2 * power * depthShare * step / density)) : 0;
    const side = depthShare ? depth * sideShare / depthShare : power * sideShare * step / k;
    b.dug += depth;
    excavated += depth + side;
    if (site) {
      b.objectWork[site] = Math.min(OBJECT_WORK[site], b.objectWork[site] + side);
      if (OBJECT_WORK[site] - b.objectWork[site] < 1e-7) b.objectWork[site] = OBJECT_WORK[site];
    }
    if (seam) {
      const total = b.seamProgress + side;
      const earned = Math.floor(total / 20);
      b.seamProgress = total - earned * 20;
      b.seamFound += earned;
      b.money.anomaly = b.money.anomaly.add(earned);
    }
    left -= step;
    if (nextDepth !== undefined && Math.abs(b.dug - nextDepth) < 1e-7) b.dug = nextDepth;
  }
  if (b.dug >= 11000 && !b.firstUmeGranted) {
    b.ume = b.ume.add(1);
    b.firstUmeGranted = true;
  }
  b.money.scrap = b.money.scrap.add(excavated * DIG_SCRAP);
  b.money.nonferrous = b.money.nonferrous.add(excavated * DIG_NONFERROUS);
  b.dig += excavated;
  let n = 0;
  const odds = containerOdds(b);
  while (b.dig >= 1) {
    b.dig -= 1;
    b.stock[pick(CONTAINERS, odds, rand()).id] += 1;
    n++;
  }
  return n;
}

// ---- Opening ------------------------------------------------------------------------

export const canOpen = (b: BottomState, id: ContainerId) => {
  const c = containerById(id)!;
  return b.stock[id] > 0 && b.money[c.costIn].gte(c.cost);
};

export interface Opening {
  item: ItemDef;
  container: ContainerId;
  amount: Decimal;
  /** First time this find came up. */
  fresh: boolean;
}

/** Rarity odds inside a container, with luck and the ancient set. */
export function rarityOdds(b: BottomState, id: ContainerId): number[] {
  const luck = 1.2 ** b.tools.luck * (setPower(b, 'ancient') ? 1 + 0.5 * setPower(b, 'ancient') : 1);
  return containerById(id)!.odds.map((w, i) => w * luck ** i);
}

/** Opens one container: pays, rolls a rarity (pity first), a find of it, and pays out. */
export function openOne(b: BottomState, id: ContainerId, rand: () => number): Opening | null {
  if (!canOpen(b, id)) return null;
  const c = containerById(id)!;
  b.money[c.costIn] = b.money[c.costIn].sub(c.cost);
  b.stock[id] -= 1;
  b.opened += 1;
  let rarity = pick(RARITIES, rarityOdds(b, id), rand());
  for (const [floor, every] of [...PITY].reverse()) {
    if ((b.dry[floor] ?? 0) + 1 >= every && RARITIES.indexOf(rarity) < RARITIES.indexOf(floor)) rarity = floor;
  }
  for (const [floor] of PITY) b.dry[floor] = RARITIES.indexOf(rarity) >= RARITIES.indexOf(floor) ? 0 : (b.dry[floor] ?? 0) + 1;
  const reached = EPOCHS.filter((e) => b.dug >= e.depth).map((e) => e.id);
  const pool = ITEMS.filter((i) => i.rarity === rarity && reached.includes(i.epoch));
  const found = pool[Math.floor(rand() * pool.length)];
  const fresh = !b.found[found.id];
  b.found[found.id] = (b.found[found.id] ?? 0) + 1;
  const amount = D(YIELD[rarity]).mul(findMultiplier(b));
  b.money[rarity] = b.money[rarity].add(amount);
  const opening = { item: found, container: id, amount, fresh };
  b.recent.unshift(opening);
  if (b.recent.length > RECENT_KEPT) b.recent.length = RECENT_KEPT;
  return opening;
}

/** Openings kept for the screen. */
const RECENT_KEPT = 12;

/** Opens what the automatic opening takes care of, at most `limit` containers. Returns how many. */
/** Prefer rare rewards, then first discoveries; ties keep the latest real opening. */
export const showcaseScore = (o: Opening) => RARITIES.indexOf(o.item.rarity) * 2 + (o.fresh ? 1 : 0);

export function autoOpen(b: BottomState, rand: () => number, limit = 500): number {
  let n = 0;
  const goal = savingGoal(b);
  for (const id of autoOpens(b)) {
    while (n < limit) {
      const c = containerById(id)!;
      if (c.cost > 0 && goal?.costIn === c.costIn && b.money[c.costIn].sub(c.cost).lt(goal.cost)) break;
      const opening = openOne(b, id, rand);
      if (!opening) break;
      n++;
      b.autoFeed.count++;
      if (!b.autoFeed.best || showcaseScore(opening) >= showcaseScore(b.autoFeed.best)) b.autoFeed.best = opening;
    }
  }
  return n;
}

/** Containers the automatic opening takes care of now. */
export const autoOpens = (b: BottomState): ContainerId[] => {
  if (b.auto === 0) return [];
  const upTo = CONTAINERS.findIndex((c) => c.id === AUTO_OPEN[b.auto - 1].upTo);
  return CONTAINERS.slice(0, upTo + 1).map((c) => c.id);
};

export function buyAuto(b: BottomState): boolean {
  const next = AUTO_OPEN[b.auto];
  if (!next || b.money[next.costIn].lt(next.cost)) return false;
  b.money[next.costIn] = b.money[next.costIn].sub(next.cost);
  b.auto += 1;
  if (b.saving === 'auto') b.saving = null;
  return true;
}

export function buyTool(b: BottomState, id: ToolId): boolean {
  const t = TOOLS.find((x) => x.id === id)!;
  const level = b.tools[id];
  if (level >= t.max) return false;
  const cost = toolCost(t, level);
  if (b.money[t.costIn].lt(cost)) return false;
  b.money[t.costIn] = b.money[t.costIn].sub(cost);
  b.tools[id] = level + 1;
  if (b.saving === `tool:${id}`) b.saving = null;
  return true;
}

// ---- Melting ------------------------------------------------------------------------

/** The УМЕ melts only down where the inhuman things lie: it is made of what is not ours. */
export const umeOpen = (b: BottomState) => b.dug >= EPOCHS.find((e) => e.id === 'inhuman')!.depth;

/** One step up the ladder: MELT of a currency (less with the inhuman set) make one of the next, or the УМЕ. */
/** How many of a currency one step of melting takes now. */
export const meltCost = (b: BottomState, from: Rarity) => Math.max(1, Math.ceil(MELT[from] / meltBonus(b)));

export function melt(b: BottomState, from: Rarity, times = 1): number {
  if (from === 'anomaly' && !umeOpen(b)) return 0;
  const per = meltCost(b, from);
  const can = Math.min(times, Math.floor(b.money[from].div(per).toNumber()));
  if (can <= 0) return 0;
  b.money[from] = b.money[from].sub(per * can);
  const i = RARITIES.indexOf(from);
  if (from === 'anomaly') { b.ume = b.ume.add(can); b.umeMade = b.umeMade.add(can); }
  else b.money[RARITIES[i + 1]] = b.money[RARITIES[i + 1]].add(can);
  return can;
}

// ---- The world above, run from below ------------------------------------------------

/**
 * Scripts of the world above, bought one by one with what comes up from the bottom; after
 * the descent the tree, the town and its schools start over, and this is how the world
 * above comes to run itself again, including the caretaker and fitter.
 */
export const ABOVE_SCRIPTS: readonly { id: string; cost: number; costIn: Rarity }[] = [
  { id: 'producers', cost: 40, costIn: 'dust' },
  { id: 'upgrades', cost: 80, costIn: 'dust' },
  { id: 'endless', cost: 6, costIn: 'scrap' },
  { id: 'light', cost: 10, costIn: 'scrap' },
  { id: 'recycle', cost: 15, costIn: 'scrap' },
  { id: 'tree', cost: 6, costIn: 'nonferrous' },
  { id: 'sort', cost: 10, costIn: 'nonferrous' },
  { id: 'line', cost: 4, costIn: 'antique' },
];

export function buyAboveScript(b: BottomState, id: string): boolean {
  const s = ABOVE_SCRIPTS.find((x) => x.id === id);
  if (!s || b.scripts.includes(id) || b.money[s.costIn].lt(s.cost)) return false;
  b.money[s.costIn] = b.money[s.costIn].sub(s.cost);
  b.scripts.push(id);
  if (b.saving === `script:${id}`) b.saving = null;
  return true;
}


export interface SavingGoal {
  id: string;
  name: string;
  cost: Decimal;
  costIn: Rarity | 'ume';
  unlocked: boolean;
}

/** The same next offers drive the selector, reserve and direct purchase. */
export function savingGoals(b: BottomState): SavingGoal[] {
  const goals: SavingGoal[] = TOOLS.filter((t) => b.tools[t.id] < t.max).map((t) => ({
    id: `tool:${t.id}`, name: `${t.name} · ур. ${b.tools[t.id] + 1}`, cost: toolCost(t, b.tools[t.id]), costIn: t.costIn, unlocked: true,
  }));
  for (const e of EQUIPMENT) if (!b.equipment[e.id]) goals.push({ id: `equipment:${e.id}`, name: e.name,
    cost: D(e.cost), costIn: e.costIn, unlocked: objectUnlocked(b, e.id) && objectReady(b, e.id) });
  const auto = AUTO_OPEN[b.auto];
  if (auto) goals.push({ id: 'auto', name: `Автовскрытие · ур. ${b.auto + 1}`, cost: D(auto.cost), costIn: auto.costIn, unlocked: true });
  for (const sc of ABOVE_SCRIPTS) if (!b.scripts.includes(sc.id)) goals.push({ id: `script:${sc.id}`, name: `Скрипт: ${sc.id}`,
    cost: D(sc.cost), costIn: sc.costIn, unlocked: true });
  if (b.firstUmeGranted) goals.push({ id: 'borer', name: `Проходчик · ур. ${b.equipment.borer + 1}`, cost: borerCost(b), costIn: 'ume', unlocked: umeOpen(b) && (b.equipment.borer > 0 || objectReady(b, 'borer')) });
  return goals;
}

export const savingGoal = (b: BottomState) => b.saving ? savingGoals(b).find((g) => g.id === b.saving) : undefined;

export function buySavingGoal(b: BottomState): boolean {
  const goal = savingGoal(b);
  if (!goal?.unlocked) return false;
  if (goal.id.startsWith('tool:')) return buyTool(b, goal.id.slice(5) as ToolId);
  if (goal.id.startsWith('equipment:')) return buyEquipment(b, goal.id.slice(10) as EquipmentId);
  if (goal.id.startsWith('script:')) return buyAboveScript(b, goal.id.slice(7));
  return goal.id === 'auto' ? buyAuto(b) : buyBorer(b);
}
