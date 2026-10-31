import {
  advance,
  availableUpgrades,
  buy,
  buyNode,
  buyUpgrade,
  canRecycle,
  currentGain,
  buyTrack,
  buyRepeat,
  repeatsOpen,
  visibleTracks,
  trackLevel,
  lightUp,
  newGame,
  purchasePlan,
  ratePerSecond,
  recycle,
  revealProducers,
  takeNewUpgrades,
  producerRate,
  sharedMult,
  milestoneUnits,
  canResort,
  resort,
  resortGain,
  type GameState,
} from './state';
import {
  FRACS,
  RECIPES,
  STATIONS,
  buyAlloy,
  buyLevel,
  buyRecipe,
  canBuyRecipe,
  levelCost,
  levelsOf,
  placeStation,
  slotCount,
  stationOpen,
  type StationId,
} from './sorting';
import { PRODUCERS, milestonesReached, producerById } from './producers';
import { upgradeById } from './upgrades';
import { NODES, REPEATS, canBuyNode, repeatCost } from './layers';
import { trackCost } from './infinite';
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
/** With this many times the price on hand, the bot buys a producer in bulk. */
const RICH = 100;
/** Threat level at which the bot turns the floodlight on. */
const LIGHT_AT = 0.5;

/**
 * Plays like an attentive player: always saves for the purchase that pays for
 * itself fastest, recycles when it is worth it and spends Recycled material on the
 * cheapest open tree node. Logs every moment something new appears.
 */
/** Station order the bot builds: biggest fractions first, the press after them, the crusher last. */
const BOT_LINE: StationId[] = ['optic', 'blower', 'magnet', 'sieve', 'briquetter', 'crusher'];

export function simulate(seconds: number, opts: { recycle?: boolean; sort?: boolean } = {}): Simulation {
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
      const m = milestonesReached(milestoneUnits(s, id));
      if (m > (milestones[id] ?? 0)) events.push({ t, what: `порог: ${producerById(id)!.name} ${s.owned[id]}` });
      milestones[id] = m;
    }
    if (run.recycleReadyAt === null && canRecycle(s)) {
      run.recycleReadyAt = s.runSeconds;
      events.push({ t, what: 'переработка доступна' });
    }
  };

  const options = (): Option[] => {
    // Every option is judged by how much income it adds. Most touch one or two producers,
    // so only those are worked out again; the rest of the income stays as it is.
    const shared = sharedMult(s);
    const rates = new Map(PRODUCERS.map((p) => [p.id, producerRate(s, p.id, shared)]));
    const base = [...rates.values()].reduce((a, b) => a.add(b));
    const list: Option[] = [];
    // A shallow copy is enough: only counts, upgrade ids and track levels change. The upgrade
    // list is copied only when it changes, so income keeps its cached upgrade effects.
    const copyWith = (apply: (c: GameState) => void, upgrades = false) => {
      const copy: GameState = { ...s, owned: { ...s.owned }, tracks: { ...s.tracks }, upgrades: upgrades ? [...s.upgrades] : s.upgrades };
      apply(copy);
      return copy;
    };
    /** Extra income from a change that only moves these producers. */
    const gainIn = (apply: (c: GameState) => void, ids: readonly string[], upgrades = false) => {
      const copy = copyWith(apply, upgrades);
      return ids.reduce((sum, id) => sum + producerRate(copy, id, shared).sub(rates.get(id)!).toNumber(), 0);
    };
    /** Extra income from a change to the multiplier every producer shares. */
    const gainShared = (apply: (c: GameState) => void) => base.mul(sharedMult(copyWith(apply)).div(shared)).sub(base).toNumber();
    /** A producer's units also feed the synergies that name it as their source. */
    const fedBy = (id: string) => [
      id,
      ...s.upgrades.flatMap((uid) => {
        const e = upgradeById(uid)?.effect;
        return e?.kind === 'synergy' && e.source === id && e.target !== id ? [e.target] : [];
      }),
    ];
    for (const id of s.revealed) {
      const { cost } = purchasePlan(s, id);
      // Far richer than the price: buy as many as the money allows, as a player would.
      const rich = s.trash.gte(cost.mul(RICH));
      const extra = gainIn((c) => (c.owned[id] = (c.owned[id] ?? 0) + 1), [...new Set(fedBy(id))]);
      // Players try a new producer early out of curiosity, so the first unit gets a head start.
      const curiosity = (s.owned[id] ?? 0) === 0 ? 4 : 1;
      if (extra > 0) list.push({ cost, payback: cost.toNumber() / extra / curiosity, apply: (st) => void buy(st, id, rich ? 'max' : 'one') });
    }
    for (const t of visibleTracks(s)) {
      const cost = trackCost(t, trackLevel(s, t.id));
      const up = (c: GameState) => void (c.tracks[t.id] = trackLevel(c, t.id) + 1);
      // Bulk moves milestones, which differ per producer; the other tracks scale what all share.
      const extra = t.id === 'bulk' ? ratePerSecond(copyWith(up)).sub(base).toNumber() : gainShared(up);
      if (extra > 0) list.push({ cost, payback: cost.toNumber() / extra, apply: (st) => void buyTrack(st, t.id) });
    }
    for (const u of availableUpgrades(s)) {
      const e = u.effect;
      const push = (c: GameState) => void c.upgrades.push(u.id);
      // A multiplier scales the income it applies to as it is; a synergy moves one producer's bonus.
      const extra =
        e.kind === 'global'
          ? base.toNumber() * (e.mult - 1)
          : e.kind === 'producer'
            ? rates.get(e.target)!.toNumber() * (e.mult - 1)
            : gainIn(push, [e.target], true);
      if (extra > 0) list.push({ cost: u.cost, payback: u.cost.toNumber() / extra, apply: (st) => void buyUpgrade(st, u.id) });
    }
    return list;
  };

  const spendTree = () => {
    for (;;) {
      const node = NODES.filter((n) => canBuyNode(s.recycle, n)).sort((a, b) => a.cost.cmp(b.cost))[0];
      if (!node || !buyNode(s, node.id)) break;
      events.push({ t, what: `дерево: ${node.name}` });
    }
    // Then the endless nodes, cheapest first.
    while (repeatsOpen(s)) {
      const next = REPEATS.map((r) => ({ r, cost: repeatCost(r, s.recycle.repeats[r.id] ?? 0) })).sort((a, b) => a.cost.cmp(b.cost))[0];
      if (!buyRepeat(s, next.r.id)) break;
    }
  };

  /** Recipes first (cheapest total), then station levels, then alloys. */
  const spendSorting = () => {
    const so = s.sorting;
    for (;;) {
      const recipe = RECIPES.filter((x) => canBuyRecipe(so, x)).sort(
        (a, b) => Object.values(a.cost).reduce((x, y) => x + y, 0) - Object.values(b.cost).reduce((x, y) => x + y, 0),
      )[0];
      if (!recipe || !buyRecipe(so, recipe.id)) break;
      events.push({ t, what: `рецепт: ${recipe.name}` });
    }
    // Fill new slots in the bot's order.
    const wanted = BOT_LINE.filter((id) => stationOpen(so, STATIONS.find((d) => d.id === id)!)).slice(0, slotCount(so));
    wanted.forEach((id, i) => placeStation(so, i, id));
    for (let guard = 0; guard < 200; guard++) {
      const options = wanted.flatMap((id) => (['speed', 'purity'] as const).map((kind) => ({ id, kind, cost: levelCost(levelsOf(so, id)[kind], kind) })));
      const cheapest = options.sort((a, b) => a.cost.cmp(b.cost)).find((o) => buyLevel(so, o.id, o.kind));
      if (!cheapest) break;
    }
    while (buyAlloy(so)) events.push({ t, what: `сплав ${so.alloys}` });
  };

  let lastSpend = -Infinity;
  let sortOpenLogged = false;
  let cityLogged = false;
  let sortReadyLogged = false;
  note();
  while (t < seconds) {
    if (opts.sort && canResort(s) && !sortReadyLogged) {
      sortReadyLogged = true;
      events.push({ t, what: `пересортировка доступна (цикл ${Math.round(s.sorting.cycleSeconds / 60)} мин)` });
    }
    if (opts.sort && canResort(s)) {
      const gain = resortGain(s);
      // Every resort needs ten times more than the last, so the bot takes each one as it comes.
      if (gain.gt(0)) {
        resort(s);
        sortReadyLogged = false;
        events.push({ t, what: `ПЕРЕСОРТИРОВКА #${s.sorting.sorts}: +${gain.toString()} · ${FRACS.map((f) => s.sorting.fractions[f].floor().toString()).join('/')}` });
        if (s.city.open && !cityLogged) events.push({ t, what: 'город открыт' });
        cityLogged ||= s.city.open;
        shown = 0;
        milestones = {};
        spendTree();
        spendSorting();
        note();
        continue;
      }
    }
    if (opts.sort && s.sorting.open && t - lastSpend >= 300) {
      lastSpend = t;
      if (!sortOpenLogged) events.push({ t, what: 'сортировка открыта' });
      sortOpenLogged = true;
      spendSorting();
    }
    if (opts.recycle && canRecycle(s)) {
      const gain = currentGain(s);
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
    // An attentive player rides the dark bonus to its peak and then switches the floodlight on.
    if (s.threat.level >= LIGHT_AT) lightUp(s);
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
