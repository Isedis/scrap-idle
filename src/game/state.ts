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
  type LayerState,
} from './layers';

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
    lastTick: now,
  };
}

const owned = (state: GameState, id: string) => state.owned[id] ?? 0;

/** Output of all units of one producer per second, with every bonus applied. */
export function producerRate(state: GameState, id: string): Decimal {
  const def = producerById(id);
  const n = owned(state, id);
  if (!def || n === 0) return D(0);
  let mult = Decimal.pow(milestoneBase(state.recycle), milestonesReached(n)).mul(recycleProductionMult(state.recycle));
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

/** Advances the game by `seconds`. Production is linear between purchases, so any step size is exact. */
export function advance(state: GameState, seconds: number): void {
  if (seconds <= 0) return;
  const gained = ratePerSecond(state).mul(seconds);
  state.trash = state.trash.add(gained);
  state.totalTrash = state.totalTrash.add(gained);
  state.runTrash = state.runTrash.add(gained);
  state.runSeconds += seconds;
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
  const mult = producerCostMult(state.recycle);
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

export const canRecycle = (state: GameState) => recycleGain(state.runTrash).gt(0);

/**
 * Trades this run for Recycled material: trash, producers and upgrades start over,
 * keeping what the Recycling tree says to keep. Returns the material gained (0 if not allowed).
 */
export function recycle(state: GameState): Decimal {
  const gain = recycleGain(state.runTrash);
  if (gain.lte(0)) return gain;
  const layer = state.recycle;
  layer.points = layer.points.add(gain);
  layer.total = layer.total.add(gain);
  layer.resets += 1;
  // A run carried over from an old save has no known length and sets no record.
  if (state.runSeconds >= 0) layer.bestSeconds = layer.bestSeconds === null ? state.runSeconds : Math.min(layer.bestSeconds, state.runSeconds);

  state.trash = D(hasNode(layer, 's4') ? 1e8 : hasNode(layer, 's2') ? 1e4 : 0);
  state.runTrash = D(0);
  state.runSeconds = 0;
  state.owned = { collector: hasNode(layer, 's1') ? 10 : 1 };
  if (!hasNode(layer, 's2')) state.revealed = ['collector'];
  // Saved blueprints keep the first tier of every producer upgrade.
  state.upgrades = hasNode(layer, 's3') ? state.upgrades.filter((id) => /-1$/.test(id)) : [];
  return gain;
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
