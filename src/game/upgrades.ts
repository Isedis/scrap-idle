import { D, Decimal } from './num';
import { PRODUCERS, producerById } from './producers';

export type Effect =
  /** Multiplies one producer's output. */
  | { kind: 'producer'; target: string; mult: number }
  /** Multiplies all production. */
  | { kind: 'global'; mult: number }
  /** `target` gets +`perUnit` (0.01 = 1%) for every owned `source`. */
  | { kind: 'synergy'; target: string; source: string; perUnit: number };

export interface Unlock {
  /** Every listed producer owned at least this many. */
  owned?: Record<string, number>;
  /** Trash collected over the whole game. */
  total?: Decimal;
}

export interface UpgradeDef {
  id: string;
  name: string;
  flavor: string;
  cost: Decimal;
  unlock: Unlock;
  effect: Effect;
  /** Effect line when the generated one would read badly (synergies need Russian cases). */
  text?: string;
}

/** Names per producer for the four ×2 tiers, unlocked at 1, 10, 25 and 50 owned. */
const TIER_NAMES: Record<string, [string, string][]> = {
  collector: [
    ['Крепкие мешки', 'Больше не рвутся на полпути'],
    ['Перчатки с пупырышками', 'Хватают даже скользкое'],
    ['Палка-хваталка', 'Профессиональный инструмент. Почти'],
    ['Сменная бригада', 'Один собирает, второй держит мешок'],
  ],
  cart: [
    ['Смазанные колёса', 'Скрипит на полтона тише и вдвое быстрее'],
    ['Второй этаж', 'Мусор, поставленный на мусор'],
    ['Тележка-прицеп', 'Тележка тянет тележку'],
    ['Электропривод', 'Тележка едет сама, сборщик едет на ней'],
  ],
  truck: [
    ['Маршрут без пробок', 'Водитель знает все дворы'],
    ['Утрамбовщик в кузове', 'Влезает вдвое больше'],
    ['Ночные рейсы', 'Город спит, мусоровоз работает'],
    ['Двухэтажный мусоровоз', 'Сверху лёгкое, снизу тяжёлое'],
  ],
  sorter: [
    ['Магнитная лента', 'Металл сортирует себя сам'],
    ['Оптический датчик', 'Отличает зелёное стекло от коричневого'],
    ['Сортировщики-ветераны', 'Определяют пластик по году выпуска'],
    ['Нейросеть-сортировщик', 'Иногда путает кота с пакетом'],
  ],
  press: [
    ['Гидравлика', 'Давит ровнее и громче'],
    ['Двойной поршень', 'Два удара по цене одного'],
    ['Пресс-кубист', 'Кубики получаются почти идеальными'],
    ['Алмазные плиты', 'Давят даже то, что давить нельзя'],
  ],
  plant: [
    ['Вторая смена', 'Завод не спит, рабочие спят по очереди'],
    ['Гранулятор', 'Пластик на входе, гранулы на выходе'],
    ['Замкнутый цикл', 'Отходы завода тоже идут на завод'],
    ['Переработка переработки', 'Лавочки снова становятся бутылками'],
  ],
  landfill: [
    ['Уплотнённые слои', 'Больше мусора на квадратный метр'],
    ['Сбор свалочного газа', 'Пахнет, зато горит'],
    ['Террасы', 'Полигон растёт ступеньками вверх'],
    ['Подземные ярусы', 'Полигон растёт и вниз тоже'],
  ],
  incinerator: [
    ['Фильтры на трубе', 'Можно работать и днём'],
    ['Турбина', 'Пар крутит, свет горит'],
    ['Плазменная горелка', 'Сжигает даже то, что не горит'],
    ['Вторая труба', 'Чтобы первой не было скучно'],
  ],
  orbital: [
    ['Сачок побольше', 'Теперь ловит и ступени ракет'],
    ['Гравитационный трал', 'Мусор сам летит в трюм'],
    ['Флот сборщиков', 'Кружат стаей над экватором'],
    ['Лунная база', 'Склад мусора с видом на Землю'],
  ],
  singularity: [
    ['Стабилизатор горизонта', 'Перестал засасывать операторов'],
    ['Вторая дыра', 'Для крупногабаритного'],
    ['Сжатие времени', 'Мусор исчезает раньше, чем его выбросили'],
    ['Карманная вселенная', 'Туда влезает всё, оттуда ничего'],
  ],
};

/** Owned count that unlocks each tier, and its price as a multiple of the producer's base cost. */
const TIERS = [
  { owned: 1, costMult: 10 },
  { owned: 10, costMult: 100 },
  { owned: 25, costMult: 2000 },
  { owned: 50, costMult: 1e5 },
];

function tierUpgrades(): UpgradeDef[] {
  return PRODUCERS.flatMap((p) =>
    TIERS.map((tier, i) => {
      const [name, flavor] = TIER_NAMES[p.id][i];
      return {
        id: `${p.id}-${i + 1}`,
        name,
        flavor,
        cost: p.baseCost.mul(tier.costMult),
        unlock: { owned: { [p.id]: tier.owned } },
        effect: { kind: 'producer', target: p.id, mult: 2 } as const,
      };
    }),
  );
}

const GLOBALS: UpgradeDef[] = [
  ['night-shift', 'Ночная смена', 'Свалка работает круглосуточно', 1e3, 1.5],
  ['union', 'Профсоюз мусорщиков', 'Обед по расписанию, работа по совести', 1e5, 1.5],
  ['city-contract', 'Городской контракт', 'Весь мусор района теперь ваш', 1e7, 2],
  ['state-order', 'Госзаказ', 'Печать, подпись, мусор', 1e9, 2],
  ['space-license', 'Межпланетная лицензия', 'Разрешено собирать выше облаков', 1e11, 2],
  ['scrap-exchange', 'Мусорная биржа', 'Котировки пластика растут', 1e13, 2],
  ['galactic-tender', 'Галактический тендер', 'Три цивилизации подали заявку, выиграли вы', 1.5e14, 2],
].map(([id, name, flavor, total, mult]) => ({
  id: id as string,
  name: name as string,
  flavor: flavor as string,
  cost: D(total).mul(10),
  unlock: { total: D(total) },
  effect: { kind: 'global', mult: mult as number } as const,
}));

/** A multiple of a producer's base cost, so synergies keep pace when producers are retuned. */
const base = (id: string, times: number) => producerById(id)!.baseCost.mul(times);

const SYNERGIES: UpgradeDef[] = [
  {
    id: 'hitch',
    text: 'Тележки +1% за каждого сборщика',
    name: 'Сцепка',
    flavor: 'Сборщики грузят прямо в тележки',
    cost: base('cart', 20),
    unlock: { owned: { collector: 15, cart: 10 } },
    effect: { kind: 'synergy', target: 'cart', source: 'collector', perUnit: 0.01 },
  },
  {
    id: 'feed-sorter',
    text: 'Сортировочные +2% за каждый мусоровоз',
    name: 'Подвоз к сортировке',
    flavor: 'Мусоровозы разгружаются у ленты',
    cost: base('sorter', 20),
    unlock: { owned: { truck: 10, sorter: 4 } },
    effect: { kind: 'synergy', target: 'sorter', source: 'truck', perUnit: 0.02 },
  },
  {
    id: 'bales',
    text: 'Заводы +2% за каждый пресс',
    name: 'Брикеты на завод',
    flavor: 'Прессованный мусор перерабатывать удобнее',
    cost: base('plant', 10),
    unlock: { owned: { press: 15, plant: 10 } },
    effect: { kind: 'synergy', target: 'plant', source: 'press', perUnit: 0.02 },
  },
  {
    id: 'waste-fuel',
    text: 'ТЭЦ +3% за каждый полигон',
    name: 'Топливо из отходов',
    flavor: 'Полигоны кормят печи ТЭЦ',
    cost: base('incinerator', 5),
    unlock: { owned: { landfill: 15, incinerator: 7 } },
    effect: { kind: 'synergy', target: 'incinerator', source: 'landfill', perUnit: 0.03 },
  },
  {
    id: 'orbital-drop',
    text: 'Утилизаторы +2% за каждый орбитальный сборщик',
    name: 'Орбитальный сброс',
    flavor: 'Пойманное на орбите летит прямо в дыру',
    cost: base('singularity', 2),
    unlock: { owned: { orbital: 15, singularity: 5 } },
    effect: { kind: 'synergy', target: 'singularity', source: 'orbital', perUnit: 0.02 },
  },
];

export const UPGRADES: readonly UpgradeDef[] = [...tierUpgrades(), ...GLOBALS, ...SYNERGIES].sort((a, b) =>
  a.cost.cmp(b.cost),
);

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADE_BY_ID.get(id);
}

/** One line describing what the upgrade does, for the card. */
export function describeUpgrade(u: UpgradeDef): string {
  if (u.text) return u.text;
  switch (u.effect.kind) {
    case 'producer':
      return `${producerById(u.effect.target)?.name}: доход ×${u.effect.mult}`;
    case 'global':
      return `Весь доход ×${u.effect.mult}`;
    case 'synergy':
      return `${producerById(u.effect.target)?.name}: +${Math.round(u.effect.perUnit * 100)}%`;
  }
}
