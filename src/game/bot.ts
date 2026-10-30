import {
  advance,
  availableUpgrades,
  buy,
  buyNode,
  buyUpgrade,
  canRecycle,
  newGame,
  purchasePlan,
  ratePerSecond,
  recycle,
  revealProducers,
  takeNewUpgrades,
  type GameState,
} from './state';
import { milestonesReached, producerById } from './producers';
import { NODES, canBuyNode, recycleGain } from './layers';
import type { Decimal } from './num';

export interface PaceEvent {
  /** Seconds of play. */
  t: number;
  what: string;
}

export interface RunReport {
  /** Seconds into the run when recycling became possible, or null if it never did. */
  recycleReadyAt: number | null;
  /** Length of the run in seconds (until the recycle, or until the simulation ended). */
  seconds: number;
  /** Recycled material the run ended with; 0 if it did not end in a recycle. */
  gain: number;
}

export interface Simulation {
  events: PaceEvent[];
  runs: RunReport[];
}

interface Option {
  cost: Decimal;
  /** Seconds to earn the extra income back. */
  payback: number;
  apply: (s: GameState) => void;
}

/** Recycle once the gain at least matches what was earned before, or the run drags on past this. */
const RECYCLE_PATIENCE = 45 * 60;

/**
 * Plays like an attentive player: always saves for the purchase that pays for
 * itself fastest, recycles when it is worth it and spends Recycled material on the
 * cheapest open tree node. Logs every moment something new appears.
 */
export function simulate(seconds: number, opts: { recycle?: boolean } = {}): Simulation {
  const s = newGame(0);
  s.buyMode = 'one';
  const events: PaceEvent[] = [];
  const runs: RunReport[] = [];
  let run: RunReport = { recycleReadyAt: null, seconds: 0, gain: 0 };
  let t = 0;

  let shown = 0;
  let milestones: Record<string, number> = {};
  const note = () => {
    revealProducers(s);
    // advance() reveals on its own, so compare against what was already logged.
    for (const id of s.revealed.slice(shown)) events.push({ t, what: `производитель: ${producerById(id)!.name}` });
    shown = s.revealed.length;
    for (const u of takeNewUpgrades(s)) events.push({ t, what: `улучшение: ${u.name}` });
    for (const id of s.revealed) {
      const m = milestonesReached(s.owned[id] ?? 0);
      if (m > (milestones[id] ?? 0)) events.push({ t, what: `порог: ${producerById(id)!.name} ${s.owned[id]}` });
      milestones[id] = m;
    }
    if (run.recycleReadyAt === null && canRecycle(s)) {
      run.recycleReadyAt = s.runSeconds;
      events.push({ t, what: 'переработка доступна' });
    }
  };

  const options = (): Option[] => {
    const base = ratePerSecond(s);
    const list: Option[] = [];
    // A shallow copy is enough: only counts and upgrade ids change.
    const gain = (apply: (c: GameState) => void) => {
      const copy: GameState = { ...s, owned: { ...s.owned }, upgrades: [...s.upgrades] };
      apply(copy);
      return ratePerSecond(copy).sub(base).toNumber();
    };
    for (const id of s.revealed) {
      const { cost } = purchasePlan(s, id);
      const extra = gain((c) => (c.owned[id] = (c.owned[id] ?? 0) + 1));
      // Players try a new producer early out of curiosity, so the first unit gets a head start.
      const curiosity = (s.owned[id] ?? 0) === 0 ? 4 : 1;
      if (extra > 0) list.push({ cost, payback: cost.toNumber() / extra / curiosity, apply: (st) => void buy(st, id) });
    }
    for (const u of availableUpgrades(s)) {
      const extra = gain((c) => c.upgrades.push(u.id));
      if (extra > 0) list.push({ cost: u.cost, payback: u.cost.toNumber() / extra, apply: (st) => void buyUpgrade(st, u.id) });
    }
    return list;
  };

  const spendTree = () => {
    for (;;) {
      const node = NODES.filter((n) => canBuyNode(s.recycle, n)).sort((a, b) => a.cost.cmp(b.cost))[0];
      if (!node || !buyNode(s, node.id)) return;
      events.push({ t, what: `дерево: ${node.name}` });
    }
  };

  note();
  while (t < seconds) {
    if (opts.recycle && canRecycle(s)) {
      const gain = recycleGain(s.runTrash);
      if (gain.gte(s.recycle.total.max(1)) || s.runSeconds > RECYCLE_PATIENCE) {
        run.seconds = s.runSeconds;
        run.gain = recycle(s).toNumber();
        runs.push(run);
        events.push({ t, what: `ПЕРЕРАБОТКА #${s.recycle.resets}: +${run.gain}` });
        run = { recycleReadyAt: null, seconds: 0, gain: 0 };
        shown = 0;
        milestones = {};
        spendTree();
        note();
        continue;
      }
    }
    const best = options().sort((a, b) => a.payback - b.payback)[0];
    const rate = ratePerSecond(s).toNumber();
    const wait = Math.max(0, (best.cost.toNumber() - s.trash.toNumber()) / rate);
    // Step in slices so unlocks are timed accurately.
    const step = Math.min(wait, 10, seconds - t);
    advance(s, step);
    t += step;
    note();
    if (step === wait && s.trash.gte(best.cost)) {
      best.apply(s);
      note();
    }
  }
  run.seconds = s.runSeconds;
  runs.push(run);
  return { events, runs };
}

/** Longest stretch with nothing new, within the first `until` seconds. */
export function longestGap(events: PaceEvent[], until: number): { from: number; to: number } {
  let worst = { from: 0, to: 0 };
  let prev = 0;
  for (const e of [...events.filter((e) => e.t <= until), { t: until, what: '' }]) {
    if (e.t - prev > worst.to - worst.from) worst = { from: prev, to: e.t };
    prev = e.t;
  }
  return worst;
}
