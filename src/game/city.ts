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

export type DistrictType = 'dump' | 'live' | 'prom' | 'market' | 'school' | 'boiler' | 'church' | 'cemetery' | 'archive' | 'river' | 'pit';

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
export const PLAN_H = 0.85;

export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'dump', type: 'dump', name: 'Полигон №7', x: 0.08, y: 0.07, people: 0 },
  { id: 'prom1', type: 'prom', name: 'Промзона', x: 0.25, y: 0.06, people: 40 },
  { id: 'brick', type: 'prom', name: 'Кирпичный завод', x: 0.1, y: 0.24, people: 60 },
  { id: 'boiler1', type: 'boiler', name: 'Котельная №1', x: 0.27, y: 0.22, people: 30 },
  { id: 'zavod', type: 'live', name: 'ул. Заводская', x: 0.42, y: 0.08, people: 410 },
  { id: 'rabo', type: 'live', name: 'ул. Рабочая', x: 0.58, y: 0.07, people: 380 },
  { id: 'nikola', type: 'church', name: 'Церковь Николы', x: 0.78, y: 0.06, people: 20 },
  { id: 'school3', type: 'school', name: 'Школа-интернат', x: 0.93, y: 0.15, people: 150 },
  { id: 'school1', type: 'school', name: 'Школа №1', x: 0.68, y: 0.21, people: 90 },
  { id: 'sad', type: 'live', name: 'ул. Садовая', x: 0.45, y: 0.25, people: 360 },
  { id: 'rynok', type: 'market', name: 'Рынок', x: 0.1, y: 0.42, people: 120 },
  { id: 'les', type: 'live', name: 'ул. Лесная', x: 0.27, y: 0.4, people: 330 },
  { id: 'pit', type: 'pit', name: 'Чёрная яма', x: 0.5, y: 0.44, people: 0 },
  { id: 'sov', type: 'live', name: 'ул. Советская', x: 0.73, y: 0.37, people: 420 },
  { id: 'ryady', type: 'market', name: 'Торговые ряды', x: 0.92, y: 0.33, people: 110 },
  { id: 'zaton', type: 'river', name: 'Затон', x: 0.05, y: 0.62, people: 70 },
  { id: 'pristan', type: 'river', name: 'Пристань', x: 0.22, y: 0.59, people: 90 },
  { id: 'bereg', type: 'live', name: 'ул. Береговая', x: 0.37, y: 0.62, people: 310 },
  { id: 'archive', type: 'archive', name: 'Архив горсовета', x: 0.56, y: 0.63, people: 15 },
  { id: 'mira', type: 'live', name: 'ул. Мира', x: 0.71, y: 0.54, people: 390 },
  { id: 'oldcem', type: 'cemetery', name: 'Старое кладбище', x: 0.9, y: 0.51, people: 3 },
  { id: 'school2', type: 'school', name: 'Школа №2', x: 0.3, y: 0.79, people: 80 },
  { id: 'mill', type: 'river', name: 'Мельница', x: 0.11, y: 0.8, people: 50 },
  { id: 'pocht', type: 'live', name: 'ул. Почтовая', x: 0.48, y: 0.8, people: 300 },
  { id: 'chapel', type: 'church', name: 'Часовня', x: 0.64, y: 0.79, people: 12 },
  { id: 'boiler2', type: 'boiler', name: 'Котельная №2', x: 0.8, y: 0.7, people: 25 },
  { id: 'newcem', type: 'cemetery', name: 'Новое кладбище', x: 0.95, y: 0.76, people: 0 },
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
  pit: 'Чёрная яма',
};

/** What a district of each type gives, in words, at strength 1. */
export const TYPE_TEXT: Record<DistrictType, string> = {
  dump: 'Отсюда свалка расползается по городу',
  live: 'Весь доход ×1.5',
  prom: 'Вторсырьё ×2',
  market: 'Фракции ×1.5',
  school: 'Автоматика после реформы. 1-я школа: закупщик, снабженец, уплотнитель, автопрожектор, и покупают они мгновенно. 2-я: автопереработчик и завхоз (дерево). 3-я: автосортировщик и наладчик (линия)',
  boiler: 'Автоглушитель «Слуха»: у двери сам опускает шум цеха. Иногда отказывает',
  church: 'Колокол заглушает цех: шкала «Слуха» копится медленнее, ×0.7',
  cemetery: 'Пик бонуса тьмы +0.2',
  archive: '10% фракций переживают реформу',
  river: 'Каждый цикл начинается с запасом вторсырья',
  pit: 'Весь доход ×100. Под ней что-то есть',
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

/** Keeps the part of a convex polygon on the side of the bisector nearer to `a`. */
function clip(poly: Point[], a: Point, b: Point): Point[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  // Positive on b's side.
  const side = (p: Point) => (p[0] - mx) * nx + (p[1] - my) * ny;
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
      if (j !== i) poly = clip(poly, s, o);
    });
    return poly;
  });
  // Two cells are neighbours when an edge of one lies on their bisector.
  const neighbours = new Map<string, string[]>(DISTRICTS.map((d) => [d.id, []]));
  const streets: [Point, Point][] = [];
  const eq = (p: Point, i: number, j: number) => {
    const di = Math.hypot(p[0] - sites[i][0], p[1] - sites[i][1]);
    const dj = Math.hypot(p[0] - sites[j][0], p[1] - sites[j][1]);
    return Math.abs(di - dj) < 1e-7;
  };
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

/** Resorts in one cycle that open the town: the reform needs as many. */
export const REFORM_SORTS = 9;

/** What the next district costs: each one dearer than the last, the pit far dearer. */
export function annexCost(city: CityState, id: string): Decimal {
  const base = D(3).mul(Decimal.pow(1.45, city.owned.length - 1));
  return (districtById(id)?.type === 'pit' ? base.mul(4) : base).ceil();
}

/** A district can be annexed when it borders the landfill and the hectares are there. */
export function canAnnex(city: CityState, id: string): boolean {
  if (city.owned.includes(id) || !districtById(id)) return false;
  return bordersLandfill(city, id) && city.points.gte(annexCost(city, id));
}

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
    silencerFail: boilers > 0 ? 0.35 * 0.6 ** (boilers - 1) : 1,
    hearingFill: 0.7 ** churches,
    darkPeak: 0.2 * power(city, 'cemetery'),
    keepFractions: Math.min(0.1 * power(city, 'archive'), 0.5),
    startPoints: rivers > 0 ? D(1000).mul(Decimal.pow(10, rivers - 1)) : D(0),
  };
}

/** Hectares a reform gives now: more for each resort past the first few, a little for the fractions. */
export function reformGain(sorts: number, fractionsTotal: Decimal): Decimal {
  if (sorts < REFORM_SORTS) return D(0);
  return D(Math.floor(sorts ** 1.3 + fractionsTotal.add(1).log10().toNumber()));
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
];

/** What the archive holds, opened as its district is taken: the founding of the town. */
export const ARCHIVE_PAGES: readonly string[] = [
  '1903. Уездная управа разрешает поселение у «чёрной ямы для ненужного». Яму велено не засыпать: «не засыпается».',
  '1904. Первый староста Глухово, Е. Мартынов, просит прислать землемера: «Яма каждый год на сажень шире».',
  '1911. Мартынов пропал. В яме нашли его шапку. Сухую, хотя шёл дождь. И сложенную.',
  '1923. Решение горсовета: свозить в яму весь мусор посёлка, «чтобы ей было чем заняться».',
];
