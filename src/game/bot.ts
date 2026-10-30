import { advance, availableUpgrades, buy, buyUpgrade, newGame, purchasePlan, ratePerSecond, revealProducers, takeNewUpgrades, type GameState } from './state';
import { milestonesReached, producerById } from './producers';
import type { Decimal } from './num';

export interface PaceEvent {
  /** Seconds of play. */
  t: number;
  what: string;
}

interface Option {
  label: string;
  cost: Decimal;
  /** Seconds to earn the extra income back. */
  payback: number;
  apply: (s: GameState) => void;
}

/**
 * Plays like an attentive player: always saves for the purchase that pays for
 * itself fastest. Logs every moment something new appears.
 */
export function simulate(seconds: number): PaceEvent[] {
  const s = newGame(0);
  s.buyMode = 'one';
  const events: PaceEvent[] = [];
  let t = 0;

  let shown = 0;
  const milestones: Record<string, number> = {};
  const note = () => {
    revealProducers(s);
    // advance() reveals on its own, so compare against what was already logged.
    for (const id of s.revealed.slice(shown)) events.push({ t, what: `производитель: ${producerById(id)!.name}` });
    shown = s.revealed.length;
    for (const u of takeNewUpgrades(s)) events.push({ t, what: `улучшение: ${u.name}` });
    for (const id of s.revealed) {
      const m = milestonesReached(s.owned[id] ?? 0);
      if (m > (milestones[id] ?? 0)) events.push({ t, what: `порог ×2: ${producerById(id)!.name} ${s.owned[id]}` });
      milestones[id] = m;
    }
  };

  const options = (): Option[] => {
    const base = ratePerSecond(s);
    const list: Option[] = [];
    const gain = (apply: (c: GameState) => void) => {
      const copy = structuredClone(s);
      apply(copy);
      return ratePerSecond(copy).sub(base).toNumber();
    };
    for (const id of s.revealed) {
      const { cost } = purchasePlan(s, id);
      const extra = gain((c) => (c.owned[id] = (c.owned[id] ?? 0) + 1));
      // Players try a new producer early out of curiosity, so the first unit gets a head start.
      const curiosity = (s.owned[id] ?? 0) === 0 ? 4 : 1;
      if (extra > 0) list.push({ label: id, cost, payback: cost.toNumber() / extra / curiosity, apply: (st) => { st.trash = st.trash.add(cost); buy(st, id); } });
    }
    for (const u of availableUpgrades(s)) {
      const extra = gain((c) => c.upgrades.push(u.id));
      if (extra > 0) list.push({ label: u.id, cost: u.cost, payback: u.cost.toNumber() / extra, apply: (st) => { st.trash = st.trash.add(u.cost); buyUpgrade(st, u.id); } });
    }
    return list;
  };

  note();
  while (t < seconds) {
    const best = options().sort((a, b) => a.payback - b.payback)[0];
    const rate = ratePerSecond(s).toNumber();
    const wait = Math.max(0, (best.cost.toNumber() - s.trash.toNumber()) / rate);
    // Step in slices so unlocks are timed accurately.
    const step = Math.min(wait, 10, seconds - t);
    advance(s, step);
    t += step;
    note();
    if (step === wait && s.trash.gte(best.cost)) {
      // apply() adds the cost back first only to reuse buy(); net effect is a normal purchase.
      s.trash = s.trash.sub(best.cost);
      best.apply(s);
      note();
    }
  }
  return events;
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
