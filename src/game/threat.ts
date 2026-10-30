import { D, Decimal } from './num';

/**
 * Threat: something under the heap rises while nobody shines a light on the yard.
 * The level climbs from 0 to 1 on its own; the floodlight resets it. Low levels pay
 * (the heap gives more in the dark), high levels cut income, and reaching 1 while the
 * game is open burns the current run. Closed, it climbs ten times slower and stops
 * at 90%, so a night's sleep never costs a run.
 */

export interface ThreatState {
  /** 0..1. */
  level: number;
  /** Runs lost to the threat over the whole game. */
  losses: number;
  /** Times the floodlight was switched on. */
  lights: number;
  /** Highest level the light was ever switched on at. */
  bravest: number;
}

export const newThreat = (): ThreatState => ({ level: 0, losses: 0, lights: 0, bravest: 0 });

/** No threat until the run has collected this much: the first minutes stay calm. */
export const THREAT_STARTS_AT = D(500);
/** Seconds from 0 to 100% at the start of the game, with the game open. */
const BASE_FILL_SECONDS = 15 * 60;
/** Each power of ten of run trash makes it this much faster. */
const FILL_SPEEDUP_PER_DIGIT = 0.95;
const MIN_FILL_SECONDS = 3 * 60;
/** Offline the threat climbs this many times slower… */
const OFFLINE_SLOWDOWN = 10;
/** …and never past this. */
export const OFFLINE_CAP = 0.9;
/** Share of normal income earned while the game is closed. */
export const OFFLINE_EFFICIENCY = 0.5;

export const threatActive = (runTrash: Decimal) => runTrash.gte(THREAT_STARTS_AT);

/** Seconds from 0 to 100% with the game open; the more trash this run, the faster. */
export function fillSeconds(runTrash: Decimal): number {
  const digits = Math.max(0, runTrash.add(1).log10().toNumber());
  return Math.max(MIN_FILL_SECONDS, BASE_FILL_SECONDS * FILL_SPEEDUP_PER_DIGIT ** digits);
}

/** The level after `seconds`, open or closed. Online it may reach 1; offline it stops at the cap. */
export function climb(level: number, runTrash: Decimal, seconds: number, offline: boolean): number {
  if (!threatActive(runTrash)) return level;
  const rate = 1 / fillSeconds(runTrash) / (offline ? OFFLINE_SLOWDOWN : 1);
  const next = level + rate * seconds;
  // Closed, it never passes the cap, and a higher level left from before comes down to it:
  // whoever comes back always has time to reach the floodlight.
  return offline ? Math.min(next, OFFLINE_CAP) : Math.min(next, 1);
}

/**
 * Income multiplier at a threat level: rises to ×1.5 by 50% (the heap gives more in
 * the dark), falls back to ×1 by 70%, to ×0.5 by 90% and to ×0.1 at the edge.
 */
export const DARK_BONUS = 1.5;

export function threatMult(level: number, peak = DARK_BONUS): number {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  if (level <= 0.5) return lerp(1, peak, level / 0.5);
  if (level <= 0.7) return lerp(peak, 1, (level - 0.5) / 0.2);
  if (level <= 0.9) return lerp(1, 0.5, (level - 0.7) / 0.2);
  return lerp(0.5, 0.1, Math.min((level - 0.9) / 0.1, 1));
}

export interface Stage {
  /** Level this stage starts at. */
  from: number;
  name: string;
}

export const STAGES: readonly Stage[] = [
  { from: 0, name: 'Тихо' },
  { from: 0.25, name: 'Шорохи' },
  { from: 0.5, name: 'Он здесь' },
  { from: 0.7, name: 'Давление' },
  { from: 0.9, name: 'Поднимается' },
];

/** Index into STAGES for a level. */
export function stageIndex(level: number): number {
  let i = 0;
  while (i + 1 < STAGES.length && level >= STAGES[i + 1].from) i++;
  return i;
}

// ---- Depth ----------------------------------------------------------------

/** Where the thing starts, in metres below the yard. */
const START_DEPTH_M = 5000;
/** Every this many powers of ten of trash ever collected bring it ten times closer. */
const DIGITS_PER_TENFOLD = 12;

/** How deep the thing is: it rises with everything ever collected and never quite arrives. */
export function depthMeters(totalTrash: Decimal, extraDigits = 0): Decimal {
  const digits = totalTrash.add(1).log10().add(extraDigits);
  return D(START_DEPTH_M).div(Decimal.pow(10, digits.div(DIGITS_PER_TENFOLD)));
}

