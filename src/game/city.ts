import { D, Decimal } from './num';

/**
 * Third layer, "Reform of the town": the town of Glukhovo gives its districts to the
 * landfill. A reform burns nearly everything (trash, Recycling, Sorting, automation)
 * for hectares, and hectares annex districts on the town plan: only next to what the
 * landfill already holds, each dearer than the last. Every district gives a lasting
 * effect, stronger among its own kind. At the centre is the black pit.
 *
 * The plan is a fixed set of district sites; the districts themselves are the cells of
 * their Voronoi diagram, so the town looks drawn rather than gridded, and two districts
 * are neighbours when their cells share a street.
 */

export type DistrictType =
  | 'dump'
  | 'live'
  | 'prom'
  | 'market'
  | 'school'
  | 'boiler'
  | 'church'
  | 'cemetery'
  | 'archive'
  | 'river'
  | 'hospital'
  | 'depot'
  | 'post'
  | 'station'
  | 'pit';

export interface DistrictDef {
  id: string;
  type: DistrictType;
  name: string;
  /** Site on the plan: x 0..1, y 0..PLAN_H. */
  x: number;
  y: number;
  /** People living there. */
  people: number;
}

/** Height of the plan in units of its width. */
export const PLAN_H = 1.25;

/** Glukhovo on a seven by seven survey sheet; the pit in the middle, the landfill in a corner. */
export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'dump', type: 'dump', name: 'Полигон №7', x: 0.07, y: 0.07, people: 0 },
  { id: 'prom1', type: 'prom', name: 'Промзона', x: 0.231, y: 0.054, people: 40 },
  { id: 'zavod', type: 'live', name: 'ул. Заводская', x: 0.338, y: 0.046, people: 410 },
  { id: 'rabo', type: 'live', name: 'ул. Рабочая', x: 0.503, y: 0.058, people: 380 },
  { id: 'nikola', type: 'church', name: 'Церковь Николы', x: 0.634, y: 0.056, people: 20 },
  { id: 'school3', type: 'school', name: 'Школа-интернат', x: 0.788, y: 0.048, people: 150 },
  { id: 'newcem', type: 'cemetery', name: 'Новое кладбище', x: 0.936, y: 0.094, people: 0 },
  { id: 'brick', type: 'prom', name: 'Кирпичный завод', x: 0.053, y: 0.231, people: 60 },
  { id: 'boiler1', type: 'boiler', name: 'Котельная №1', x: 0.201, y: 0.242, people: 30 },
  { id: 'sad', type: 'live', name: 'ул. Садовая', x: 0.362, y: 0.271, people: 360 },
  { id: 'autobase', type: 'depot', name: 'Автобаза', x: 0.524, y: 0.261, people: 45 },
  { id: 'lug', type: 'live', name: 'ул. Луговая', x: 0.656, y: 0.264, people: 290 },
  { id: 'vysel', type: 'live', name: 'Выселки', x: 0.774, y: 0.249, people: 150 },
  { id: 'hospital', type: 'hospital', name: 'Больница', x: 0.955, y: 0.239, people: 70 },
  { id: 'rynok', type: 'market', name: 'Рынок', x: 0.086, y: 0.43, people: 120 },
  { id: 'les', type: 'live', name: 'ул. Лесная', x: 0.207, y: 0.436, people: 330 },
  { id: 'ogor', type: 'live', name: 'ул. Огородная', x: 0.381, y: 0.454, people: 270 },
  { id: 'school1', type: 'school', name: 'Школа №1', x: 0.497, y: 0.439, people: 90 },
  { id: 'sov', type: 'live', name: 'ул. Советская', x: 0.647, y: 0.444, people: 420 },
  { id: 'ryady', type: 'market', name: 'Торговые ряды', x: 0.781, y: 0.449, people: 110 },
  { id: 'dach', type: 'live', name: 'ул. Дачная', x: 0.943, y: 0.417, people: 180 },
  { id: 'zaton', type: 'river', name: 'Затон', x: 0.073, y: 0.631, people: 70 },
  { id: 'post', type: 'post', name: 'Почта', x: 0.218, y: 0.61, people: 35 },
  { id: 'bereg', type: 'live', name: 'ул. Береговая', x: 0.356, y: 0.618, people: 310 },
  { id: 'pit', type: 'pit', name: 'Чёрная яма', x: 0.5, y: 0.62, people: 0 },
  { id: 'mira', type: 'live', name: 'ул. Мира', x: 0.632, y: 0.61, people: 390 },
  { id: 'oldcem', type: 'cemetery', name: 'Старое кладбище', x: 0.79, y: 0.613, people: 3 },
  { id: 'sawmill', type: 'prom', name: 'Лесопилка', x: 0.905, y: 0.642, people: 55 },
  { id: 'pristan', type: 'river', name: 'Пристань', x: 0.053, y: 0.808, people: 90 },
  { id: 'rech', type: 'live', name: 'ул. Речная', x: 0.206, y: 0.824, people: 260 },
  { id: 'archive', type: 'archive', name: 'Архив горсовета', x: 0.384, y: 0.79, people: 15 },
  { id: 'pocht', type: 'live', name: 'ул. Почтовая', x: 0.511, y: 0.793, people: 300 },
  { id: 'chapel', type: 'church', name: 'Часовня', x: 0.629, y: 0.814, people: 12 },
  { id: 'kuzn', type: 'live', name: 'ул. Кузнечная', x: 0.786, y: 0.804, people: 240 },
  { id: 'fire', type: 'depot', name: 'Пожарная часть', x: 0.915, y: 0.806, people: 40 },
  { id: 'mill', type: 'river', name: 'Мельница', x: 0.074, y: 0.987, people: 50 },
  { id: 'school2', type: 'school', name: 'Школа №2', x: 0.234, y: 0.968, people: 80 },
  { id: 'station', type: 'station', name: 'Вокзал', x: 0.381, y: 0.995, people: 60 },
  { id: 'vokz', type: 'live', name: 'ул. Вокзальная', x: 0.499, y: 0.967, people: 230 },
  { id: 'boiler2', type: 'boiler', name: 'Котельная №2', x: 0.653, y: 0.995, people: 25 },
  { id: 'feldsher', type: 'hospital', name: 'Фельдшерский пункт', x: 0.795, y: 0.986, people: 30 },
  { id: 'yarmarka', type: 'market', name: 'Ярмарка', x: 0.952, y: 0.965, people: 100 },
  { id: 'dam', type: 'river', name: 'Плотина', x: 0.068, y: 1.171, people: 20 },
  { id: 'slob', type: 'live', name: 'ул. Слободская', x: 0.196, y: 1.166, people: 250 },
  { id: 'depo', type: 'prom', name: 'Депо', x: 0.37, y: 1.179, people: 70 },
  { id: 'telegraph', type: 'post', name: 'Телеграф', x: 0.515, y: 1.161, people: 20 },
  { id: 'nov', type: 'live', name: 'ул. Новая', x: 0.629, y: 1.178, people: 210 },
  { id: 'torf', type: 'live', name: 'Посёлок торфяников', x: 0.791, y: 1.168, people: 160 },
  { id: 'mogil', type: 'cemetery', name: 'Скотомогильник', x: 0.912, y: 1.178, people: 0 },
];

export const districtById = (id: string) => DISTRICTS.find((d) => d.id === id);

/** Everyone in Glukhovo before the landfill came. */
export const TOWN_PEOPLE = DISTRICTS.reduce((s, d) => s + d.people, 0);

export const TYPE_NAMES: Record<DistrictType, string> = {
  dump: 'Полигон',
  live: 'Жилой квартал',
  prom: 'Промзона',
  market: 'Рынок',
  school: 'Школа',
  boiler: 'Котельная',
  church: 'Церковь',
  cemetery: 'Кладбище',
  archive: 'Архив',
  river: 'Река',
  hospital: 'Больница',
  depot: 'Автобаза',
  post: 'Почта',
  station: 'Вокзал',
  pit: 'Чёрная яма',
};

/** What a district of each type gives, in words, at strength 1. */
export const TYPE_TEXT: Record<DistrictType, string> = {
  dump: 'Отсюда свалка расползается по городу',
  live: 'Весь доход ×1.5',
  prom: 'Вторсырьё ×2',
  market: 'Фракции ×1.5',
  school: 'Автоматика после реформы. 1-я школа: закупщик, снабженец, уплотнитель, автопрожектор, и покупают они мгновенно. 2-я: автопереработчик и завхоз (дерево). 3-я: автосортировщик и наладчик (линия)',
  boiler: 'Одна котельная глушит цех с шансом отказа. Обе — без отказов: 10 секунд тишины и возврат выбранной нагрузки',
  church: 'Колокол заглушает цех: шкала «Слуха» копится медленнее, ×0.7',
  cemetery: 'Пик бонуса тьмы +0.2',
  archive: '10% фракций переживают реформу',
  river: 'Каждый цикл начинается с запасом вторсырья',
  hospital: 'Угроза растёт медленнее, ×0.85',
  depot: 'Доход вне игры ×1.2',
  post: 'Шлёт в уезд прошения о земле: реформа даёт гектаров ×1.25',
  station: 'Следующие кварталы дешевле, ×0.9',
  pit: 'Последняя покупка: когда весь город под свалкой. Под ней — следующий слой',
};

/** Each owned neighbour of the same type makes a district this much stronger. */
export const CLUSTER_BONUS = 0.25;

// ---- The plan --------------------------------------------------------------------------

export type Point = [number, number];

export interface Plan {
  /** Cell of each district, in DISTRICTS order. */
  cells: Point[][];
  /** Neighbours of each district, by id. */
  neighbours: Map<string, string[]>;
  /** Streets: the shared edges, each once. */
  streets: [Point, Point][];
}

/** How much more ground a site claims than its plain Voronoi share: only the pit, which is wide. */
const WEIGHT: Record<string, number> = { pit: 0.022 };
const weight = (i: number) => WEIGHT[DISTRICTS[i].id] ?? 0;

/** Power of a point from a weighted site: squared distance less the weight; lower is nearer. */
const pow = (p: Point, s: Point, w: number) => (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2 - w;

/**
 * Keeps the part of a convex polygon nearer to `a` than to `b` by power (a weighted
 * Voronoi, so a heavier site pushes the street away from itself; the edge stays straight).
 */
function clip(poly: Point[], a: Point, wa: number, b: Point, wb: number): Point[] {
  // Positive on b's side.
  const side = (p: Point) => pow(p, a, wa) - pow(p, b, wb);
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

let planCache: Plan | null = null;

/** The town plan: worked out once, it never changes. */
export function plan(): Plan {
  if (planCache) return planCache;
  const sites = DISTRICTS.map((d) => [d.x, d.y] as Point);
  const cells = sites.map((s, i) => {
    let poly: Point[] = [
      [0, 0],
      [1, 0],
      [1, PLAN_H],
      [0, PLAN_H],
    ];
    sites.forEach((o, j) => {
      if (j !== i) poly = clip(poly, s, weight(i), o, weight(j));
    });
    return poly;
  });
  // Two cells are neighbours when an edge of one lies on the line between them.
  const neighbours = new Map<string, string[]>(DISTRICTS.map((d) => [d.id, []]));
  const streets: [Point, Point][] = [];
  const eq = (p: Point, i: number, j: number) => Math.abs(pow(p, sites[i], weight(i)) - pow(p, sites[j], weight(j))) < 1e-9;
  cells.forEach((cell, i) => {
    for (let k = 0; k < cell.length; k++) {
      const p = cell[k];
      const q = cell[(k + 1) % cell.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-4) continue;
      for (let j = 0; j < sites.length; j++) {
        if (j === i || !eq(p, i, j) || !eq(q, i, j)) continue;
        const a = DISTRICTS[i].id;
        const b = DISTRICTS[j].id;
        if (!neighbours.get(a)!.includes(b)) neighbours.get(a)!.push(b);
        if (i < j) streets.push([p, q]);
      }
    }
  });
  planCache = { cells, neighbours, streets };
  return planCache;
}

// ---- State -----------------------------------------------------------------------------

export interface CityState {
  /** The town has offered itself: the Town view and the reform are there. */
  open: boolean;
  /** Hectares on hand. */
  points: Decimal;
  /** Hectares over the whole game. */
  total: Decimal;
  reforms: number;
  /** Districts the landfill holds, in the order taken; the landfill itself first. */
  owned: string[];
}

export const newCity = (): CityState => ({ open: false, points: D(0), total: D(0), reforms: 0, owned: ['dump'] });

/** Resorts, counted since the last reform, that open the Town view: a look at what is coming. */
export const CITY_OPEN_SORTS = 5;
/** Resorts the reform itself needs. */
export const REFORM_SORTS = 7;

/**
 * What the next district costs: gently dearer each time, 3 ha for the first, about 430
 * for the last street; the station makes all of them cheaper, the pit costs double.
 */
export function annexCost(city: CityState, id: string): Decimal {
  const n = city.owned.length - 1;
  const base = (3 + 2 * n + 0.15 * n * n) * cityEffects(city).annexDiscount;
  return D(districtById(id)?.type === 'pit' ? base * 2 : base).ceil();
}

/** Districts besides the pit: the pit is the last, once every one of them is taken. */
export const STREETS = DISTRICTS.filter((d) => d.type !== 'pit' && d.type !== 'dump').length;
export const streetsOwned = (city: CityState) => city.owned.filter((id) => id !== 'dump' && id !== 'pit').length;
export const pitReady = (city: CityState) => streetsOwned(city) >= STREETS;

/** A district can be annexed when it borders the landfill and the hectares are there; the pit, last of all. */
export function canAnnex(city: CityState, id: string): boolean {
  const d = districtById(id);
  if (city.owned.includes(id) || !d) return false;
  if (d.type === 'pit' && !pitReady(city)) return false;
  return bordersLandfill(city, id) && city.points.gte(annexCost(city, id));
}

/** What the landfill can see of the town: its own districts and the ones next to them; the rest is fog. */
export const visible = (city: CityState, id: string) => city.owned.includes(id) || bordersLandfill(city, id);

export const bordersLandfill = (city: CityState, id: string) => plan().neighbours.get(id)!.some((n) => city.owned.includes(n));

export function annex(city: CityState, id: string): boolean {
  if (!canAnnex(city, id)) return false;
  city.points = city.points.sub(annexCost(city, id));
  city.owned.push(id);
  return true;
}

/** People still living in Glukhovo. */
export const peopleLeft = (city: CityState) => TOWN_PEOPLE - city.owned.reduce((s, id) => s + (districtById(id)?.people ?? 0), 0);

/** How strong an owned district is: 1, plus a quarter for each owned neighbour of its type. */
export function strength(city: CityState, id: string): number {
  const d = districtById(id)!;
  const same = plan().neighbours.get(id)!.filter((n) => city.owned.includes(n) && districtById(n)!.type === d.type).length;
  return 1 + CLUSTER_BONUS * same;
}

/** Both boilers finish noise automation: no failures and automatic load restoration. */
export const AUTO_NOISE_BOILERS = 2;

/** Summed strength of the owned districts of a type. */
function power(city: CityState, type: DistrictType): number {
  return city.owned.filter((id) => districtById(id)!.type === type).reduce((s, id) => s + strength(city, id), 0);
}

export interface CityEffects {
  income: Decimal;
  recycled: Decimal;
  fractions: Decimal;
  /** Schools owned: each sets up the next group of scripts. */
  schools: number;
  /** Boilers: chance the silencer fails; 1 without one. */
  silencerFail: number;
  /** Churches: the bell covers the plant, the hearing fills this much slower. */
  hearingFill: number;
  /** Hospitals: the threat climbs this much slower. */
  threatSpeed: number;
  /** Depots: income while away this much higher. */
  offline: number;
  /** Post offices: the town writes to the uyezd for more land; the reform gives this many times the hectares. */
  hectares: number;
  /** The station: districts cost this share. */
  annexDiscount: number;
  darkPeak: number;
  /** Share of fractions that survive a reform. */
  keepFractions: number;
  /** Recycled material each cycle starts with. */
  startPoints: Decimal;
}

const effectsCache = new WeakMap<CityState, { owned: number; fx: CityEffects }>();

/** What the town gives; worked out again only when a district is taken, as income asks all the time. */
export function cityEffects(city: CityState): CityEffects {
  const hit = effectsCache.get(city);
  if (hit && hit.owned === city.owned.length) return hit.fx;
  const fx = computeEffects(city);
  effectsCache.set(city, { owned: city.owned.length, fx });
  return fx;
}

function computeEffects(city: CityState): CityEffects {
  const mul = (type: DistrictType, step: number) =>
    city.owned.filter((id) => districtById(id)!.type === type).reduce((m, id) => m.mul(1 + step * strength(city, id)), D(1));
  const boilers = power(city, 'boiler');
  const churches = power(city, 'church');
  const rivers = power(city, 'river');
  return {
    income: mul('live', 0.5).mul(city.owned.includes('pit') ? 100 : 1),
    recycled: mul('prom', 1),
    fractions: mul('market', 0.5),
    schools: city.owned.filter((id) => districtById(id)!.type === 'school').length,
    silencerFail: boilers >= AUTO_NOISE_BOILERS ? 0 : boilers > 0 ? 0.35 * 0.6 ** (boilers - 1) : 1,
    hearingFill: 0.7 ** churches,
    threatSpeed: 0.85 ** power(city, 'hospital'),
    offline: 1.2 ** power(city, 'depot'),
    hectares: 1.25 ** power(city, 'post'),
    annexDiscount: 0.9 ** power(city, 'station'),
    darkPeak: 0.2 * power(city, 'cemetery'),
    keepFractions: Math.min(0.1 * power(city, 'archive'), 0.5),
    startPoints: rivers > 0 ? D(1000).mul(Decimal.pow(10, rivers - 1)) : D(0),
  };
}

/**
 * Hectares a reform gives now: about 24 at the ninth resort, and twice as many for each
 * resort past it, so holding on for one more pays.
 */
/** Hectares per reform at the plain rate, as a multiple of the formula. */
const REFORM_SCALE = 3;
/**
 * Each resort past the seventh makes the reform this much richer. Doubling was too much:
 * with the town's income behind it a cycle reaches 15-18 resorts, and the bot took the
 * whole town in under three hours.
 */
const REFORM_STEP = 1.2;

export function reformGain(sorts: number, fractionsTotal: Decimal): Decimal {
  if (sorts < REFORM_SORTS) return D(0);
  return D(REFORM_SCALE * (sorts ** 1.3 + fractionsTotal.add(1).log10().toNumber())).mul(Decimal.pow(REFORM_STEP, sorts - REFORM_SORTS)).floor();
}

/** Scripts the schools set up after a reform: the first school the first group, and so on. */
export const SCHOOL_TIERS: readonly (readonly string[])[] = [
  ['producers', 'upgrades', 'endless', 'light'],
  ['recycle', 'tree'],
  ['sort', 'line'],
];

/** Scripts the town's schools have set up. */
export const schoolScripts = (schools: number) => SCHOOL_TIERS.slice(0, schools).flat();

/** Letters to the town council, one for each district taken, stranger as the town goes. */
export const LETTERS: readonly string[] = [
  'Просим горсовет убрать свалку от промзоны. Ветер несёт её к домам. Ночью он несёт её обратно. — рабочие кирпичного',
  'Сосед говорит, что вчера его дом стоял на другой стороне улицы. Я проверил. Он прав. — ул. Заводская, 3',
  'Из котельной слышно, как кто-то стучит по трубам. Котельная закрыта с августа. — дежурный',
  'Дочь принесла со свалки куклу. Кукла тёплая. Кукла всё время смотрит на свалку. — ул. Рабочая, 11',
  'Мой сын ушёл к свалке. Вернулся. Это не мой сын. Он тоже говорит, что это не я. — ул. Заводская, 14',
  'Батюшка просит передать: колокол звонит сам, по ночам, ровно столько раз, сколько осталось домов. — Церковь Николы',
  'На рынке продают вещи, которые мы выбросили на прошлой неделе. Продавца никто не знает. Цены в рублях 1903 года. — Рынок',
  'В классе на одну парту больше, чем учеников. За ней кто-то сидит. Отвечает правильно. — учительница Школы №1',
  'Река течёт к свалке. Раньше она текла от неё. — смотритель пристани',
  'Мы не пишем больше. Мы слушаем. Оно тоже. — без подписи',
  'Горсовет, отзовите вашего оператора. Он перерабатывает нас. — жители ул. Советской',
  'На кладбище стало больше могил. Имена — наши. Даты — завтрашние. — сторож',
  'Почта приходит на адреса, которых больше нет. Ответы тоже приходят. — почтальон',
  'Здесь пусто. Не пишите сюда. — ул. Мира',
  'В больнице все койки заняты. Пациентов нет. Простыни тёплые. — дежурная сестра',
  'Автобаза: машины ночью уезжают сами. Утром стоят на местах. Пробег — до свалки и обратно. — механик',
  'На вокзале продают билеты до Глухово. Мы и так в Глухово. — кассир',
  'Телеграмма без отправителя: «ВЫЕЗЖАЙТЕ ТЧК ПОЗДНО ТЧК». — телеграфист',
  'Плотина держит. Вода стоит выше, чем должна. Под водой видно окна. — смотритель плотины',
  'Посёлок торфяников ушёл в торф. Весь. Вместе с собаками. Огни видно под землёй. — сосед',
  'Скотомогильник шевелится по ночам. Мы думали, это ветер. Ветра нет третий месяц. — пастух',
  'Пожарные выехали на вызов в яму. Не вернулись. Вызов повторяется. Их голосом. — диспетчер',
  'В ярмарочный день торговали все. Покупателей не было. Товар раскупили. — торговка',
  'Мы привыкли. Это хуже всего. — без подписи',
];

/** What the archive holds, opened as its district is taken: the founding of the town. */
export const ARCHIVE_PAGES: readonly string[] = [
  '1903. Уездная управа разрешает поселение у «чёрной ямы для ненужного». Яму велено не засыпать: «не засыпается».',
  '1904. Первый староста Глухово, Е. Мартынов, просит прислать землемера: «Яма каждый год на сажень шире».',
  '1911. Мартынов пропал. В яме нашли его шапку. Сухую, хотя шёл дождь. И сложенную.',
  '1923. Решение горсовета: свозить в яму весь мусор посёлка, «чтобы ей было чем заняться».',
];

/** The journal reads the same unlocks formerly displayed inside the city panel. */
export function cityArchive(city: CityState, history?: { cityLetters: number; cityDocuments: boolean }) {
  return {
    letters: LETTERS.slice(0, Math.max(history?.cityLetters ?? 0, city.owned.length - 1)).map((text, index) => ({ number: index + 1, text })).reverse(),
    pages: history?.cityDocuments || city.owned.includes('archive') ? ARCHIVE_PAGES : [],
  };
}

export function rememberCity(history: { cityLetters: number; cityDocuments: boolean }, city: CityState): void {
  history.cityLetters = Math.min(LETTERS.length, Math.max(history.cityLetters, city.owned.length - 1));
  history.cityDocuments ||= city.owned.includes('archive');
}
