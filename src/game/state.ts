import { D, Decimal } from './num';
import { PRODUCERS, affordableCount, costOf, costOfMany, milestonesReached, producerById } from './producers';
import { UPGRADES, upgradeById, type UpgradeDef } from './upgrades';

export type BuyMode = 'one' | 'ten' | 'max';

export interface GameState {
  trash: Decimal;
  /** Trash collected over the whole game; never spent. */
  totalTrash: Decimal;
  /** Units owned per producer id. */
  owned: Record<string, number>;
  /** Producers the player has already seen; they stay visible once shown. */
  revealed: string[];
  /** Upgrade ids bought. */
  upgrades: string[];
  /** Upgrades the player has been told about, so each unlock is announced once. */
  seenUpgrades: string[];
  buyMode: BuyMode;
  /** Epoch ms of the last simulated moment, used for offline progress. */
  lastTick: number;
}

export function newGame(now = Date.now()): GameState {
  // The game is automatic from the first second: one collector is free.
  return {
    trash: D(0),
    totalTrash: D(0),
    owned: { collector: 1 },
    revealed: ['collector'],
    upgrades: [],
    seenUpgrades: [],
    buyMode: 'one',
    lastTick: now,
  };
}

const owned = (state: GameState, id: string) => state.owned[id] ?? 0;

/** Output of all units of one producer per second, with every bonus applied. */
export function producerRate(state: GameState, id: string): Decimal {
  const def = producerById(id);
  const n = owned(state, id);
  if (!def || n === 0) return D(0);
  let mult = Decimal.pow(2, milestonesReached(n));
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
  revealProducers(state);
}

/** A producer appears once the player has collected half of its first price. Returns the new ones. */
export function revealProducers(state: GameState): string[] {
  const added: string[] = [];
  for (const def of PRODUCERS) {
    if (state.revealed.includes(def.id)) continue;
    if (state.totalTrash.gte(def.baseCost.div(2))) {
      state.revealed.push(def.id);
      added.push(def.id);
    }
  }
  return added;
}

/** How many units the current buy mode would buy, and for how much. Count 0 means none affordable. */
export function purchasePlan(state: GameState, id: string): { count: number; cost: Decimal } {
  const def = producerById(id)!;
  const n = owned(state, id);
  if (state.buyMode === 'max') {
    const count = affordableCount(def, n, state.trash);
    // Nothing affordable: show the price of one so the player sees the goal.
    return count > 0 ? { count, cost: costOfMany(def, n, count) } : { count: 0, cost: costOf(def, n) };
  }
  const want = state.buyMode === 'ten' ? 10 : 1;
  const cost = costOfMany(def, n, want);
  return { count: state.trash.gte(cost) ? want : 0, cost };
}

/** Buys per the current buy mode. Returns the number of units bought. */
export function buy(state: GameState, id: string): number {
  if (!producerById(id)) return 0;
  const { count, cost } = purchasePlan(state, id);
  if (count === 0) return 0;
  state.trash = state.trash.sub(cost);
  state.owned[id] = owned(state, id) + count;
  return count;
}

export function isUnlocked(state: GameState, u: UpgradeDef): boolean {
  const { owned: need, total } = u.unlock;
  if (total && state.totalTrash.lt(total)) return false;
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
