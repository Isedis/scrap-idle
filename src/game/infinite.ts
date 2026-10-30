import { D, Decimal } from './num';

/**
 * Endless upgrades bought with trash. Each has no top level; the price grows
 * faster than the effect, so they stay a sink for the rest of the run and start
 * over with it. Levels of Compaction bought over the whole game also bring the
 * thing under the heap closer.
 */

export interface TrackDef {
  id: 'compact' | 'bulk' | 'dark';
  name: string;
  /** Effect of one level, for the card. */
  text: string;
  flavor: string;
  baseCost: Decimal;
  /** Each level costs this many times more than the last. */
  growth: number;
  /** Run trash at which the track shows up. */
  unlockAt: Decimal;
}

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'compact',
    name: 'Уплотнение',
    text: 'Весь доход ×1.25 за уровень',
    flavor: 'Куча становится плотнее. И тяжелее. И ниже под ней что-то ворочается',
    baseCost: D(1e10),
    growth: 6,
    unlockAt: D(1e9),
  },
  {
    id: 'bulk',
    name: 'Оптовые закупки',
    text: 'Пороги производителей на 5 штук ближе за уровень',
    flavor: 'Поставщик не спрашивает, зачем столько. Поставщик вообще не разговаривает',
    baseCost: D(1e11),
    growth: 5,
    unlockAt: D(1e10),
  },
  {
    id: 'dark',
    name: 'Тёмный договор',
    text: 'Бонус в темноте +0.1 за уровень',
    flavor: 'Куча отдаёт больше, если не смотреть. Условия договора мелким шрифтом',
    baseCost: D(1e12),
    growth: 12,
    unlockAt: D(1e11),
  },
];

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

export function trackCost(track: TrackDef, level: number): Decimal {
  return track.baseCost.mul(Decimal.pow(track.growth, level));
}

/** Levels per track bought this run. */
export type TrackLevels = Partial<Record<TrackDef['id'], number>>;

export const COMPACT_MULT = 1.25;
/** Units every bought producer counts toward its milestones per Bulk level. */
export const BULK_HEAD_START = 5;
export const DARK_STEP = 0.1;
/** Every this many Compaction levels ever bought, the terminal marks the thing rising. */
export const COMPACT_MILESTONE = 10;
/** Compaction levels ever bought count as this many extra powers of ten for the depth. */
export const COMPACT_DEPTH_DIGITS = 0.25;

export const compactMult = (levels: TrackLevels) => Decimal.pow(COMPACT_MULT, levels.compact ?? 0);
export const milestoneHeadStart = (levels: TrackLevels) => BULK_HEAD_START * (levels.bulk ?? 0);
export const darkPeak = (levels: TrackLevels, base: number) => base + DARK_STEP * (levels.dark ?? 0);
