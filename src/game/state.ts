import { D, Decimal } from './num';
import { PRODUCERS, costOf, producerById } from './producers';

export interface GameState {
  trash: Decimal;
  /** Trash collected over the whole game; never spent. */
  totalTrash: Decimal;
  /** Units owned per producer id. */
  owned: Record<string, number>;
  /** Producers the player has already seen; they stay visible once shown. */
  revealed: string[];
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
    lastTick: now,
  };
}

export function ratePerSecond(state: GameState): Decimal {
  let rate = D(0);
  for (const def of PRODUCERS) {
    const n = state.owned[def.id] ?? 0;
    if (n > 0) rate = rate.add(def.baseRate.mul(n));
  }
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

/** A producer appears once the player has collected half of its first price. */
export function revealProducers(state: GameState): void {
  for (const def of PRODUCERS) {
    if (state.revealed.includes(def.id)) continue;
    if (state.totalTrash.gte(def.baseCost.div(2))) state.revealed.push(def.id);
  }
}

export function canBuy(state: GameState, id: string): boolean {
  const def = producerById(id);
  return !!def && state.trash.gte(costOf(def, state.owned[id] ?? 0));
}

export function buy(state: GameState, id: string): boolean {
  const def = producerById(id);
  if (!def || !canBuy(state, id)) return false;
  state.trash = state.trash.sub(costOf(def, state.owned[id] ?? 0));
  state.owned[id] = (state.owned[id] ?? 0) + 1;
  return true;
}
