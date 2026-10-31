import { D, Decimal } from './num';
import type { BuyMode } from './state';
import type { TrackDef } from './infinite';

/**
 * Scripts on the Automation tab: each does one chore on its own. Two come from the
 * Recycling tree (the auto-buyer and the auto-recycler); the rest are installed for
 * Recycled material. Speed and the floodlight's reliability level up without end.
 */

export type ScriptId = 'producers' | 'upgrades' | 'endless' | 'recycle' | 'light' | 'sort' | 'tree' | 'line';

export interface ScriptDef {
  id: ScriptId;
  /** Shown like a process name in the terminal. */
  name: string;
  title: string;
  text: string;
  /** Tree node that installs it, for the ones that come from Recycling. */
  node?: string;
  /** Sorting recipe that installs it. */
  recipe?: string;
  /** Recycled material to install it, for the rest. */
  cost?: Decimal;
  /** When the install offer shows up, for the bought ones. */
  hint?: string;
  /** Schools in the town that set it up, for the ones the town gives. */
  town?: number;
}

export const SCRIPTS: readonly ScriptDef[] = [
  { id: 'producers', name: 'buy.producers', title: 'Закупщик', text: 'Покупает самого выгодного производителя.', node: 'a1' },
  { id: 'upgrades', name: 'buy.upgrades', title: 'Снабженец', text: 'Покупает улучшения из каталога, самые дешёвые первыми.', cost: D(5), hint: 'после первой переработки' },
  { id: 'endless', name: 'buy.endless', title: 'Уплотнитель', text: 'Покупает бесконечные улучшения, самое дешёвое первым.', cost: D(30), hint: 'когда за всю игру собрано 10 млрд кг' },
  { id: 'recycle', name: 'recycle', title: 'Автопереработчик', text: 'Сдаёт всё на переработку сам.', node: 'a3' },
  { id: 'light', name: 'light', title: 'Автопрожектор', text: 'Включает свет сам. Иногда не включает.', cost: D(20), hint: 'после 10 включений прожектора' },
  { id: 'sort', name: 'sort', title: 'Автосортировщик', text: 'Пересортировывает сам. Сжигает переработку без спроса.', recipe: 'a1' },
  { id: 'tree', name: 'buy.tree', title: 'Завхоз', text: 'Покупает узлы дерева переработки, бесконечные узлы, разгон и надёжность — самое дешёвое первым.', town: 2 },
  { id: 'line', name: 'buy.line', title: 'Наладчик', text: 'Ставит станции в пустые места линии, улучшает их, покупает рецепты и сплавы.', town: 3 },
];

export const scriptById = (id: string) => SCRIPTS.find((s) => s.id === id);

export type RecycleMode = 'gain' | 'time' | 'peak';
export type SortMode = 'share' | 'time';

export interface ScriptsState {
  /** Scripts installed for Recycled material (the tree ones are owned through their node). */
  bought: ScriptId[];
  /** Speed level: every level makes the buying scripts tick faster. */
  speed: number;
  /** Reliability level of the automatic floodlight. */
  reliability: number;
  producerMode: BuyMode;
  /** Producers the buyer leaves alone. */
  producerOff: string[];
  upgradesOn: boolean;
  /** Buy an upgrade only if it costs at most this share of the trash on hand. */
  upgradesShare: number;
  endlessOn: boolean;
  endlessOff: TrackDef['id'][];
  recycleMode: RecycleMode;
  /** For the time mode. */
  recycleMinutes: number;
  lightOn: boolean;
  /** Threat level at which the floodlight goes on. */
  lightAt: number;
  /** Times the automatic floodlight failed, over the whole game. */
  failures: number;
  sortOn: boolean;
  sortMode: SortMode;
  /** Resort once the fractions it gives reach this share of all fractions ever earned. */
  sortShare: number;
  /** For the time mode: minutes of the sorting cycle. */
  sortMinutes: number;
  treeOn: boolean;
  lineOn: boolean;
  // Not saved: they rebuild within seconds.
  clock: number;
  cooldown: number;
  /** Best Recycled-per-second seen this run, for the peak mode. */
  peak: number;
}

export function newScripts(): ScriptsState {
  return {
    bought: [],
    speed: 0,
    reliability: 0,
    producerMode: 'one',
    producerOff: [],
    upgradesOn: true,
    upgradesShare: 0.1,
    endlessOn: true,
    endlessOff: [],
    recycleMode: 'gain',
    recycleMinutes: 5,
    lightOn: true,
    lightAt: 0.9,
    failures: 0,
    sortOn: false,
    treeOn: true,
    lineOn: true,
    sortMode: 'share',
    sortShare: 0.25,
    sortMinutes: 60,
    clock: 0,
    cooldown: 0,
    peak: 0,
  };
}

export const UPGRADE_SHARES = [0.01, 0.1, 0.5, 1] as const;
export const RECYCLE_MINUTES = [1, 5, 15, 60] as const;
export const LIGHT_LEVELS = [0.5, 0.75, 0.9] as const;
export const RECYCLE_MODES: readonly RecycleMode[] = ['gain', 'time', 'peak'];
export const SORT_MODES: readonly SortMode[] = ['share', 'time'];
export const SORT_SHARES = [0.1, 0.25, 0.5, 1] as const;
export const SORT_MINUTES = [10, 30, 60, 120] as const;

/** Tick of the buying scripts without speed levels: as fast as the tree's auto-buyer. */
export const BASE_TICK = 2;
export const FAST_TICK = 0.25;
/** With the foreman from the tree. */
export const FOREMAN_TICK = 0.1;
export const SPEED_STEP = 0.5;
export const speedCost = (level: number) => D(20).mul(Decimal.pow(3, level));
export const reliabilityCost = (level: number) => D(25).mul(Decimal.pow(2.5, level));

/** After a failure the floodlight script tries again this many seconds later. */
export const LIGHT_RETRY = 15;
const FAIL_BASE = 0.1;
/** Extra failure chance per tenfold the thing came closer from where it started. */
const FAIL_PER_DIGIT = 0.08;
const FAIL_MAX = 0.6;
const RELIABILITY_STEP = 0.8;
const START_DEPTH_M = 5000;

/** Chance the automatic floodlight fails: the closer the thing, the likelier. */
export function failChance(depth: Decimal, reliability: number): number {
  const closer = Math.max(0, D(START_DEPTH_M).div(depth.max(D('1e-300'))).log10().toNumber());
  return Math.min(FAIL_MAX, FAIL_BASE + FAIL_PER_DIGIT * closer) * RELIABILITY_STEP ** reliability;
}

/** What the terminal says when the floodlight did not come on. */
export const FAIL_LINES = [
  'LIGHT: ОТКАЗ. КТО-ТО ОТКЛЮЧИЛ ПИТАНИЕ',
  'LIGHT: ОТКАЗ. ЛАМПА ГОРИТ. СВЕТА НЕТ',
  'LIGHT: ОТКАЗ. РУБИЛЬНИК В ПОЛОЖЕНИИ «ВЫКЛ». ВЫ НЕ ТРОГАЛИ?',
  'LIGHT: ОТКАЗ. ОНО ДЕРЖИТ КАБЕЛЬ',
  'LIGHT: ОТКАЗ. НЕ СЕЙЧАС',
];

/** Lines in the script log that no script wrote. */
export const PHANTOM_LINES = [
  '???: смотрит',
  '???: buy.operator ×1',
  '???: ждёт, пока вы уснёте',
  'light: выключен вручную',
  '???: копает',
  'recycle: оператор не подлежит переработке. пока',
  '???: считает вас',
  'buy.producers: не покупать «Сторож»',
];
