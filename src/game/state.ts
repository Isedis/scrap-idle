import { D, Decimal } from './num';
import { PRODUCERS, affordableCount, costOf, costOfMany, milestonesReached, producerById } from './producers';
import { UPGRADES, upgradeById, type UpgradeDef } from './upgrades';
import {
  autobuyInterval,
  canBuyNode,
  hasNode,
  milestoneBase,
  newLayer,
  nodeById,
  producerCostMult,
  recycleGain,
  recycleProductionMult,
  gainMult,
  repeatById,
  repeatCost,
  NODES,
  type LayerState,
} from './layers';
import { DARK_BONUS, OFFLINE_EFFICIENCY, climb, depthMeters, newThreat, stageIndex, threatActive, threatMult, type ThreatState } from './threat';
import { COMPACT_DEPTH_DIGITS, TRACKS, bulkMult, compactMult, darkPeak, trackById, trackCost, type TrackLevels } from './infinite';
import { achievementMult } from './achievements';
import { eventById, eventInterval, isNight, newStory, pickEvent, record, storyMult, type Recording, type StoryState } from './story';

export type BuyMode = 'one' | 'ten' | 'max';

export interface GameState {
  trash: Decimal;
  /** Trash collected over the whole game; never spent, never reset. */
  totalTrash: Decimal;
  /** Trash collected since the last recycle; drives unlocks and the recycle gain. */
  runTrash: Decimal;
  /** Seconds of play since the last recycle, offline included; negative when unknown (a run from an old save). */
  runSeconds: number;
  /** Units owned per producer id. */
  owned: Record<string, number>;
  /** Producers the player has seen this run; they stay visible once shown. */
  revealed: string[];
  /** Upgrade ids bought. */
  upgrades: string[];
  /** Upgrades the player has been told about, so each unlock is announced once. */
  seenUpgrades: string[];
  buyMode: BuyMode;
  /** First prestige layer. */
  recycle: LayerState;
  /** The auto-buyer is switched on (it works only once bought in the tree). */
  autobuy: boolean;
  /** Something rising under the heap; the floodlight pushes it back. */
  threat: ThreatState;
  /** What the camera has caught: the archive, open cases, notes. */
  story: StoryState;
  /** Endless upgrade levels bought this run. */
  tracks: TrackLevels;
  /** Compaction levels bought over the whole game: they bring the thing closer for good. */
  compacted: number;
  /** Achievement ids earned. */
  achievements: string[];
  /**
   * Recycle on its own once the gain reaches `factor` times all Recycled material earned so far
   * (works once bought in the tree).
   */
  autoRecycle: { on: boolean; factor: number };
  /** Epoch ms of the last simulated moment, used for offline progress. */
  lastTick: number;
}

export function newGame(now = Date.now()): GameState {
  // The game is automatic from the first second: one collector is free.
  return {
    trash: D(0),
    totalTrash: D(0),
    runTrash: D(0),
    runSeconds: 0,
    owned: { collector: 1 },
    revealed: ['collector'],
    upgrades: [],
    seenUpgrades: [],
    buyMode: 'one',
    recycle: newLayer(),
    autobuy: true,
    threat: newThreat(),
    story: newStory(),
    tracks: {},
    compacted: 0,
    achievements: [],
    autoRecycle: { on: false, factor: 1 },
    lastTick: now,
  };
}

const owned = (state: GameState, id: string) => state.owned[id] ?? 0;

/** Output of all units of one producer per second, with every bonus applied. */
export function producerRate(state: GameState, id: string): Decimal {
  const def = producerById(id);
  const n = owned(state, id);
  if (!def || n === 0) return D(0);
  let mult = Decimal.pow(milestoneBase(state.recycle), milestonesReached(n))
    .mul(recycleProductionMult(state.recycle))
    .mul(threatMult(state.threat.level, darkPeak(state.tracks, DARK_BONUS)))
    .mul(storyMult(state.story))
    .mul(compactMult(state.tracks))
    .mul(achievementMult(state.achievements));
  let bonus = 0;
  for (const uid of state.upgrades) {
    const e = upgradeById(uid)?.effect;
    if (!e) continue;
    if (e.kind === 'producer' && e.target === id) mult = mult.mul(e.mult);
    else if (e.kind === 'global') mult = mult.mul(e.mult);
    else if (e.kind === 'synergy' && e.target === id) bonus += e.perUnit * owned(state, e.source);
  }
  return def.baseRate.mul(n).mul(mult).mul(1 + bonus);
}

export function ratePerSecond(state: GameState): Decimal {
  let rate = D(0);
  for (const def of PRODUCERS) rate = rate.add(producerRate(state, def.id));
  return rate;
}

/** Longest slice of time simulated at one threat level; offline time is cut into at most this many slices. */
const SLICE_SECONDS = 1;
const OFFLINE_SLICES = 200;

/**
 * Advances the game by `seconds`. Income depends on the threat, which climbs as time
 * passes, so long spans are simulated in slices. Offline, income is halved and the
 * threat climbs slowly and stops short of the edge.
 */
export function advance(state: GameState, seconds: number, offline = false): void {
  if (seconds <= 0) return;
  const slice = offline ? Math.max(seconds / OFFLINE_SLICES, SLICE_SECONDS) : SLICE_SECONDS;
  for (let left = seconds; left > 0; left -= slice) {
    const dt = Math.min(slice, left);
    let gained = ratePerSecond(state).mul(dt);
    if (offline) gained = gained.mul(OFFLINE_EFFICIENCY);
    state.trash = state.trash.add(gained);
    state.totalTrash = state.totalTrash.add(gained);
    state.runTrash = state.runTrash.add(gained);
    state.runSeconds += dt;
    if (!offline) state.story.boost = Math.max(0, state.story.boost - dt);
    state.threat.level = climb(state.threat.level, state.runTrash, dt, offline);
    // At the edge production stops; the game plays the loss and calls loseShift.
    if (state.threat.level >= 1) break;
  }
  revealProducers(state);
}

/** A producer appears once this run has collected half of its first price. Returns the new ones. */
export function revealProducers(state: GameState): string[] {
  const added: string[] = [];
  for (const def of PRODUCERS) {
    if (state.revealed.includes(def.id)) continue;
    if (state.runTrash.gte(def.baseCost.div(2))) {
      state.revealed.push(def.id);
      added.push(def.id);
    }
  }
  return added;
}

/** How many units the current buy mode would buy, and for how much. Count 0 means none affordable. */
export function purchasePlan(state: GameState, id: string, mode: BuyMode = state.buyMode): { count: number; cost: Decimal } {
  const def = producerById(id)!;
  const n = owned(state, id);
  const mult = producerCostMult(state.recycle) * bulkMult(state.tracks);
  if (mode === 'max') {
    const count = affordableCount(def, n, state.trash, mult);
    // Nothing affordable: show the price of one so the player sees the goal.
    return count > 0 ? { count, cost: costOfMany(def, n, count, mult) } : { count: 0, cost: costOf(def, n, mult) };
  }
  const want = mode === 'ten' ? 10 : 1;
  const cost = costOfMany(def, n, want, mult);
  return { count: state.trash.gte(cost) ? want : 0, cost };
}

/** Buys per the buy mode. Returns the number of units bought. */
export function buy(state: GameState, id: string, mode: BuyMode = state.buyMode): number {
  if (!producerById(id)) return 0;
  const { count, cost } = purchasePlan(state, id, mode);
  if (count === 0) return 0;
  state.trash = state.trash.sub(cost);
  state.owned[id] = owned(state, id) + count;
  return count;
}

/**
 * The auto-buyer's pick: the revealed producer whose next unit costs the least per
 * unit of output it adds. Returns its id if it was affordable and bought.
 */
export function autoBuy(state: GameState): string | null {
  let best: string | null = null;
  let bestRatio: Decimal | null = null;
  for (const id of state.revealed) {
    const n = owned(state, id);
    const perUnit = n > 0 ? producerRate(state, id).div(n) : producerById(id)!.baseRate;
    if (perUnit.lte(0)) continue;
    const ratio = purchasePlan(state, id, 'one').cost.div(perUnit);
    if (!bestRatio || ratio.lt(bestRatio)) {
      best = id;
      bestRatio = ratio;
    }
  }
  return best && buy(state, best, 'one') > 0 ? best : null;
}

export function isUnlocked(state: GameState, u: UpgradeDef): boolean {
  const { owned: need, total } = u.unlock;
  if (total && state.runTrash.lt(total)) return false;
  if (need) for (const [id, n] of Object.entries(need)) if (owned(state, id) < n) return false;
  return true;
}

/** Upgrades the player can see in the shop: unlocked and not yet bought, cheapest first. */
export function availableUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => !state.upgrades.includes(u.id) && isUnlocked(state, u));
}

export function buyUpgrade(state: GameState, id: string): boolean {
  const u = upgradeById(id);
  if (!u || state.upgrades.includes(id) || !isUnlocked(state, u) || state.trash.lt(u.cost)) return false;
  state.trash = state.trash.sub(u.cost);
  state.upgrades.push(id);
  return true;
}

/** Upgrades that became available since the last call; marks them as announced. */
export function takeNewUpgrades(state: GameState): UpgradeDef[] {
  const fresh = availableUpgrades(state).filter((u) => !state.seenUpgrades.includes(u.id));
  for (const u of fresh) state.seenUpgrades.push(u.id);
  return fresh;
}

// ---- Recycling ----------------------------------------------------------------

/** What a recycle would give right now. */
export const currentGain = (state: GameState) => recycleGain(state.runTrash, gainMult(state.recycle));
export const canRecycle = (state: GameState) => currentGain(state).gt(0);

/**
 * Trades this run for Recycled material: trash, producers and upgrades start over,
 * keeping what the Recycling tree says to keep. Returns the material gained (0 if not allowed).
 */
export function recycle(state: GameState): Decimal {
  const gain = currentGain(state);
  if (gain.lte(0)) return gain;
  const layer = state.recycle;
  layer.points = layer.points.add(gain);
  layer.total = layer.total.add(gain);
  layer.resets += 1;
  // A run carried over from an old save has no known length and sets no record.
  if (state.runSeconds >= 0) layer.bestSeconds = layer.bestSeconds === null ? state.runSeconds : Math.min(layer.bestSeconds, state.runSeconds);

  startNewRun(state);
  return gain;
}

/** Starts the run over, keeping what the Recycling tree says to keep. */
function startNewRun(state: GameState): void {
  const layer = state.recycle;
  state.trash = D(hasNode(layer, 's4') ? 1e8 : hasNode(layer, 's2') ? 1e4 : 0);
  state.runTrash = D(0);
  state.runSeconds = 0;
  state.owned = { collector: hasNode(layer, 's1') ? 10 : 1 };
  if (!hasNode(layer, 's2')) state.revealed = ['collector'];
  // Saved blueprints keep the first tier of every producer upgrade.
  state.upgrades = hasNode(layer, 's3') ? state.upgrades.filter((id) => /-1$/.test(id)) : [];
  state.threat.level = 0;
  state.story.traces = [];
  state.tracks = {};
}

// ---- Threat -------------------------------------------------------------------

/** The floodlight: pushes the threat back to nothing. */
export function lightUp(state: GameState): void {
  state.threat.lights += 1;
  state.threat.bravest = Math.max(state.threat.bravest, state.threat.level);
  state.threat.level = 0;
}

/** How deep the thing is: closer with everything ever collected and every Compaction level ever bought. */
export function depthOf(state: GameState): Decimal {
  return depthMeters(state.totalTrash, state.compacted * COMPACT_DEPTH_DIGITS);
}

// ---- Endless upgrades -----------------------------------------------------------

export const trackLevel = (state: GameState, id: string) => state.tracks[id as keyof TrackLevels] ?? 0;

/** Endless upgrades the player can see this run. */
export const visibleTracks = (state: GameState) => TRACKS.filter((t) => state.runTrash.gte(t.unlockAt) || trackLevel(state, t.id) > 0);

export function buyTrack(state: GameState, id: string): boolean {
  const track = trackById(id);
  if (!track || !visibleTracks(state).includes(track)) return false;
  const cost = trackCost(track, trackLevel(state, id));
  if (state.trash.lt(cost)) return false;
  state.trash = state.trash.sub(cost);
  state.tracks[track.id] = trackLevel(state, id) + 1;
  if (track.id === 'compact') state.compacted += 1;
  return true;
}

/** Endless Recycling nodes open once the whole tree is bought. */
export const repeatsOpen = (state: GameState) => NODES.every((n) => state.recycle.nodes.includes(n.id));

export function buyRepeat(state: GameState, id: string): boolean {
  const def = repeatById(id);
  if (!def || !repeatsOpen(state)) return false;
  const level = state.recycle.repeats[def.id] ?? 0;
  const cost = repeatCost(def, level);
  if (state.recycle.points.lt(cost)) return false;
  state.recycle.points = state.recycle.points.sub(cost);
  state.recycle.repeats[def.id] = level + 1;
  return true;
}

/** Choices for the auto-recycler threshold, as multiples of all Recycled material earned. */
export const AUTO_FACTORS = [0.5, 1, 2, 5] as const;

/** Gain at which the auto-recycler recycles: a multiple of everything earned, at least the first threshold. */
export const autoRecycleAt = (state: GameState) => state.recycle.total.mul(state.autoRecycle.factor).max(10);

/** Whether the auto-recycler should recycle now. */
export function autoRecycleDue(state: GameState): boolean {
  return state.autoRecycle.on && hasNode(state.recycle, 'a3') && state.runSeconds >= 10 && currentGain(state).gte(autoRecycleAt(state));
}

/** The threat reached the edge: the run is lost with nothing in return. Recycling progress stays. */
export function loseShift(state: GameState): void {
  state.threat.losses += 1;
  startNewRun(state);
}

export function buyNode(state: GameState, id: string): boolean {
  const node = nodeById(id);
  if (!node || !canBuyNode(state.recycle, node)) return false;
  state.recycle.points = state.recycle.points.sub(node.cost);
  state.recycle.nodes.push(id);
  return true;
}

/** Seconds between auto-buys if the auto-buyer is bought and switched on. */
export function activeAutobuyInterval(state: GameState): number | null {
  return state.autobuy ? autobuyInterval(state.recycle) : null;
}

// ---- Story events ---------------------------------------------------------------

/**
 * Counts down to the next camera event and records it when due. Returns the new
 * recording for the screen to play, or null. Nothing happens before the threat wakes.
 */
export function storyTick(state: GameState, dt: number, now = new Date()): Recording | null {
  if (!threatActive(state.runTrash) || state.threat.level >= 1) return null;
  const stage = stageIndex(state.threat.level);
  const story = state.story;
  story.nextIn -= dt;
  if (story.nextIn > 0) return null;
  story.nextIn = eventInterval(stage, isNight(now));
  return record(story, pickEvent(story, stage, state.owned), now.getTime());
}

/** While the game was closed the camera kept recording: up to two events from the absence. */
export function recordAway(state: GameState, seconds: number, now: number): Recording[] {
  if (seconds < 10 * 60 || !threatActive(state.runTrash)) return [];
  const count = seconds > 2 * 3600 ? 2 : 1;
  const out: Recording[] = [];
  for (let i = 0; i < count; i++) {
    const at = now - seconds * 1000 * Math.random();
    const event = pickEvent(state.story, stageIndex(state.threat.level), state.owned);
    out.push(record(state.story, event, at, { away: true }));
  }
  return out;
}

export { eventById };
