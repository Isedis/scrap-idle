import { D, Decimal } from './num';
import { FRACS, type Inspection } from './sorting';
import type { GameState } from './state';

/**
 * What changed while the game was closed, for the screen the player comes back to:
 * a snapshot before the offline time runs, compared with the state after it.
 */

export interface AwaySnapshot {
  trash: Decimal;
  threat: number;
  fractions: Decimal;
  news: number;
}

export interface AwayReport {
  seconds: number;
  trash: Decimal;
  /** Threat level on return, and whether it rose. */
  threat: number;
  threatRose: boolean;
  /** Camera recordings made while away. */
  recordings: number;
  fractions: Decimal;
  /** Unique finds and bales from the inspection table. */
  finds: string[];
  bales: number;
}

const sumFractions = (s: GameState) => FRACS.reduce((sum, f) => sum.add(s.sorting.fractions[f]), D(0));

export function awaySnapshot(s: GameState): AwaySnapshot {
  return { trash: s.trash, threat: s.threat.level, fractions: sumFractions(s), news: s.sorting.news.length };
}

export function awayReport(before: AwaySnapshot, s: GameState, seconds: number): AwayReport {
  const news: Inspection[] = s.sorting.news.slice(before.news);
  return {
    seconds,
    trash: s.trash.sub(before.trash).max(0),
    threat: s.threat.level,
    threatRose: s.threat.level > before.threat + 0.001,
    // The archive keeps at most twenty, so count what is new by the away mark instead of the length.
    recordings: s.story.records.filter((r) => r.away && !r.watched).length,
    fractions: sumFractions(s).sub(before.fractions).max(0),
    finds: news.flatMap((n) => (n.kind === 'unique' ? [n.id] : [])),
    bales: news.filter((n) => n.kind === 'fractions').length,
  };
}

/** Long enough away to deserve the screen rather than a notice. */
export const AWAY_SCREEN_SECONDS = 5 * 60;
