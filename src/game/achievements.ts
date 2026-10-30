import { D, Decimal } from './num';
import { PRODUCERS } from './producers';
import { UPGRADES } from './upgrades';
import { NODES } from './layers';
import { CASES, NOTES, isNight } from './story';
import { SCRIPTS } from './scripts';
import { UNIQUES, tailsOf } from './sorting';
import type { GameState } from './state';

/** Each achievement adds this much to all production, for good. */
export const ACH_BONUS = 0.01;

export interface AchievementDef {
  id: string;
  name: string;
  /** What it takes, shown once earned (and for the next few, as a hint). */
  text: string;
  check: (s: GameState, depth: Decimal) => boolean;
}

const owned = (s: GameState, id: string) => s.owned[id] ?? 0;
const totalAtLeast = (n: number | string) => (s: GameState) => s.totalTrash.gte(n);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Trash
  { id: 'kg1e3', name: 'Первая тонна', text: 'Собрать 1 тыс кг за всю игру', check: totalAtLeast(1e3) },
  { id: 'kg1e6', name: 'Районного значения', text: 'Собрать 1 млн кг', check: totalAtLeast(1e6) },
  { id: 'kg1e9', name: 'Видно с трассы', text: 'Собрать 1 млрд кг', check: totalAtLeast(1e9) },
  { id: 'kg1e12', name: 'Видно с самолёта', text: 'Собрать 1 трлн кг', check: totalAtLeast(1e12) },
  { id: 'kg1e15', name: 'Видно из космоса', text: 'Собрать 1 квдрлн кг', check: totalAtLeast(1e15) },
  { id: 'kg1e20', name: 'Масса небольшой луны', text: 'Собрать 1e20 кг', check: totalAtLeast(1e20) },
  { id: 'kg1e30', name: 'Больше, чем помещается', text: 'Собрать 1e30 кг', check: totalAtLeast(1e30) },
  // Producers
  { id: 'crew10', name: 'Бригада', text: '10 сборщиков', check: (s) => owned(s, 'collector') >= 10 },
  { id: 'crew100', name: 'Сто человек на смене', text: '100 сборщиков', check: (s) => owned(s, 'collector') >= 100 },
  { id: 'trucks50', name: 'Колонна', text: '50 мусоровозов', check: (s) => owned(s, 'truck') >= 50 },
  { id: 'chain', name: 'Все звенья цепи', text: 'Хотя бы один производитель каждого вида', check: (s) => PRODUCERS.every((p) => owned(s, p.id) > 0) },
  { id: 'hole', name: 'Дыра в эксплуатации', text: 'Утилизатор-сингулярность', check: (s) => owned(s, 'singularity') > 0 },
  { id: 'unit200', name: 'Двести единиц', text: '200 любого производителя', check: (s) => PRODUCERS.some((p) => owned(s, p.id) >= 200) },
  // Upgrades
  { id: 'upg1', name: 'Первое улучшение', text: 'Купить улучшение', check: (s) => s.upgrades.length >= 1 },
  { id: 'upgHalf', name: 'Полкаталога', text: `Купить ${Math.ceil(UPGRADES.length / 2)} улучшений за заход`, check: (s) => s.upgrades.length >= UPGRADES.length / 2 },
  { id: 'upgAll', name: 'Весь каталог', text: 'Купить все улучшения за заход', check: (s) => s.upgrades.length >= UPGRADES.length },
  { id: 'compact10', name: 'Уплотнитель', text: 'Уплотнение до 10 уровня', check: (s) => (s.tracks.compact ?? 0) >= 10 },
  { id: 'track25', name: 'Бесконечность в кармане', text: 'Любое бесконечное улучшение до 25 уровня', check: (s) => Object.values(s.tracks).some((l) => (l ?? 0) >= 25) },
  // Recycling
  { id: 'rec1', name: 'Первая переработка', text: 'Переработать', check: (s) => s.recycle.resets >= 1 },
  { id: 'rec10', name: 'Конвейер', text: '10 переработок', check: (s) => s.recycle.resets >= 10 },
  { id: 'rec100', name: 'Колесо', text: '100 переработок', check: (s) => s.recycle.resets >= 100 },
  { id: 'vs100', name: 'Сто вторсырья', text: 'Заработать 100 вторсырья', check: (s) => s.recycle.total.gte(100) },
  { id: 'vs1e3', name: 'Тысяча вторсырья', text: 'Заработать 1 тыс вторсырья', check: (s) => s.recycle.total.gte(1e3) },
  { id: 'vs1e5', name: 'Склад памяти', text: 'Заработать 100 тыс вторсырья', check: (s) => s.recycle.total.gte(1e5) },
  { id: 'tree', name: 'Дерево до корней', text: 'Все узлы дерева переработки', check: (s) => NODES.every((n) => s.recycle.nodes.includes(n.id)) },
  { id: 'fast5', name: 'Быстрая смена', text: 'Заход до переработки быстрее 5 минут', check: (s) => (s.recycle.bestSeconds ?? Infinity) <= 300 },
  { id: 'fast1', name: 'Минута', text: 'Заход до переработки быстрее минуты', check: (s) => (s.recycle.bestSeconds ?? Infinity) <= 60 },
  // The thing under the heap
  { id: 'light10', name: 'Не выключай', text: 'Включить прожектор 10 раз', check: (s) => s.threat.lights >= 10 },
  { id: 'light100', name: 'Сто вспышек', text: 'Включить прожектор 100 раз', check: (s) => s.threat.lights >= 100 },
  { id: 'edge', name: 'На грани', text: 'Включить свет на 95% угрозы', check: (s) => s.threat.bravest >= 0.95 },
  { id: 'lost', name: 'Смена потеряна', text: 'Потерять смену', check: (s) => s.threat.losses >= 1 },
  { id: 'night', name: 'Ночная смена', text: 'Играть с полуночи до пяти утра', check: () => isNight(new Date()) },
  { id: 'km', name: 'Глубже километра', text: 'Объект ближе 1 км', check: (_, d) => d.lt(1000) },
  { id: 'm', name: 'Он под нами', text: 'Объект ближе 1 м', check: (_, d) => d.lt(1) },
  { id: 'cm', name: 'На расстоянии ладони', text: 'Объект ближе 1 см', check: (_, d) => d.lt(D(0.01)) },
  // Automation
  { id: 'scripts', name: 'Руки свободны', text: 'Установить все скрипты', check: (s) => SCRIPTS.every((d) => (d.node ? s.recycle.nodes.includes(d.node) : s.scripts.bought.includes(d.id))) },
  { id: 'fail1', name: 'Отказ питания', text: 'Автопрожектор не включился', check: (s) => s.scripts.failures >= 1 },
  // Sorting
  { id: 'sort1', name: 'Пересортировка', text: 'Сжечь переработку ради фракций', check: (s) => s.sorting.sorts >= 1 },
  { id: 'sort10', name: 'Десятый разряд', text: '10 пересортировок', check: (s) => s.sorting.sorts >= 10 },
  { id: 'clean', name: 'Чистая линия', text: 'Хвосты меньше 10%', check: (s) => s.sorting.open && tailsOf(s.sorting) < 0.1 },
  { id: 'find12', name: 'Пол-описи', text: `Найти ${UNIQUES.length / 2} уникальных отходов`, check: (s) => s.sorting.found.length >= UNIQUES.length / 2 },
  { id: 'findAll', name: 'Куча помнит всё', text: 'Найти все уникальные отходы', check: (s) => s.sorting.found.length >= UNIQUES.length },
  // The journal
  { id: 'case1', name: 'Первое дело', text: 'Открыть дело в журнале', check: (s) => s.story.cases.length >= 1 },
  { id: 'ninth', name: 'Девятый в смене', text: 'Открыть дело «Девятый»', check: (s) => s.story.cases.includes('extra') },
  { id: 'cases', name: 'Весь архив', text: 'Открыть все дела', check: (s) => s.story.cases.length >= CASES.length },
  { id: 'note1', name: 'Почерк смотрителя', text: 'Найти записку', check: (s) => s.story.notes >= 1 },
  { id: 'notes', name: 'Все записки', text: 'Найти все записки', check: (s) => s.story.notes >= NOTES.length },
];

export const achievementMult = (earned: readonly string[]) => 1 + ACH_BONUS * earned.length;

/** Marks newly met achievements as earned and returns them. */
export function checkAchievements(s: GameState, depth: Decimal): AchievementDef[] {
  const fresh = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.check(s, depth));
  for (const a of fresh) s.achievements.push(a.id);
  return fresh;
}
