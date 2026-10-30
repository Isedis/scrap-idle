import { D, Decimal } from './num';
import { PRODUCERS, affordableCount, costOf, costOfMany, milestonesReached, producerById } from './producers';
import { UPGRADES, upgradeById, type UpgradeDef } from './upgrades';
import {
  canBuyNode,
  hasNode,
  milestoneBase,
  newLayer,
  nodeById,
  producerCostMult,
  recycleGain,
  recycleGainRaw,
  recycleProductionMult,
  gainMult,
  repeatById,
  repeatCost,
  NODES,
  offlineEfficiency,
  treeDarkPeak,
  treeThreatSpeed,
  type LayerState,
} from './layers';
import { DARK_BONUS, OFFLINE_CAP, climb, depthMeters, newThreat, stageIndex, threatActive, threatMult, type ThreatState } from './threat';
import { COMPACT_DEPTH_DIGITS, TRACKS, compactMult, darkPeak, milestoneHeadStart, trackById, trackCost, type TrackLevels } from './infinite';
import { achievementMult } from './achievements';
import {
  FRACS,
  RANKS,
  SORT_AT,
  sortNeed,
  hasRank,
  lumpFor,
  lumpMult,
  newSorting,
  runLine,
  slotCount,
  sortingCostMult,
  sortingGainMult,
  sortingIncome,
  sortingTick,
  fractionsIncome,
  hasRecipe,
  rankIncome,
  uniqueMult,
  SORT_INCOME,
  threatSpeed,
  addFractions,
  type Frac,
  type SortingState,
} from './sorting';
import {
  BASE_TICK,
  FAST_TICK,
  FOREMAN_TICK,
  LIGHT_RETRY,
  SPEED_STEP,
  failChance,
  newScripts,
  reliabilityCost,
  scriptById,
  speedCost,
  type ScriptId,
  type ScriptsState,
} from './scripts';
import {
  FIRST_EVENT_SECONDS,
  FRESH_CASE_FACTOR,
  eventById,
  eventInterval,
  freshCase,
  isNight,
  newStory,
  pickEvent,
  record,
  storyMult,
  type Recording,
  type StoryState,
} from './story';

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
  /** Automation tab: installed scripts and their settings. */
  scripts: ScriptsState;
  /** Second prestige layer: the sorting line, the inspection table, recipes. */
  sorting: SortingState;
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
    scripts: newScripts(),
    sorting: newSorting(),
    lastTick: now,
  };
}

const owned = (state: GameState, id: string) => state.owned[id] ?? 0;

/** Units a producer counts toward its milestones: those owned, plus Bulk's head start once there is one. */
export function milestoneUnits(state: GameState, id: string): number {
  const n = owned(state, id);
  return n > 0 ? n + milestoneHeadStart(state.tracks) : 0;
}

/** Multiplier every producer shares: layers, the threat, the story, endless upgrades, achievements. */
export function sharedMult(state: GameState): Decimal {
  return recycleProductionMult(state.recycle)
    .mul(threatMult(state.threat.level, darkPeakOf(state)))
    .mul(storyMult(state.story))
    .mul(compactMult(state.tracks))
    .mul(achievementMult(state.achievements))
    .mul(sortingIncome(state.sorting));
}

/** One multiplier in the income, for the breakdown the player can open. */
export interface IncomePart {
  label: string;
  mult: Decimal;
  /** What it comes from, in a few words. */
  note: string;
}

/**
 * Where the income comes from: the producers' own output, then every multiplier on top.
 * The parts multiply back to the income exactly; the last one is what differs between
 * producers (upgrades, milestones, synergies).
 */
export function incomeBreakdown(state: GameState): { base: Decimal; parts: IncomePart[] } {
  const so = state.sorting;
  const shared: IncomePart[] = [
    { label: 'Переработка', mult: recycleProductionMult(state.recycle), note: 'вторсырьё за всё время и дерево' },
    { label: 'Тьма', mult: D(threatMult(state.threat.level, darkPeakOf(state))), note: 'больше в темноте, меньше на краю' },
    { label: 'Дела и события', mult: D(storyMult(state.story)), note: 'открытые дела, ускорения с камеры' },
    { label: 'Уплотнение', mult: compactMult(state.tracks), note: 'бесконечное улучшение' },
    { label: 'Достижения', mult: D(achievementMult(state.achievements)), note: '+1% за каждое' },
    { label: 'Пересортировки', mult: Decimal.pow(SORT_INCOME, so.sorts).mul(rankIncome(so.sorts)), note: '×2 за каждую и разряды' },
    { label: 'Фракции', mult: fractionsIncome(so.total), note: 'все фракции за игру' },
    { label: 'Рецепты и находки', mult: D((hasRecipe(so, 'e1') ? 3 : 1) * uniqueMult(so, 'income')), note: 'сортировка' },
  ];
  const base = PRODUCERS.reduce((sum, p) => sum.add(p.baseRate.mul(owned(state, p.id))), D(0));
  const all = shared.reduce((m, p) => m.mul(p.mult), D(1));
  const rate = ratePerSecond(state);
  const own = base.gt(0) && all.gt(0) ? rate.div(base.mul(all)) : D(1);
  const parts = [...shared, { label: 'Улучшения и пороги', mult: own, note: 'свои у каждого производителя' }];
  return { base, parts: parts.filter((p) => !p.mult.eq(1)) };
}

/** Output of all units of one producer per second, with every bonus applied. */
export function producerRate(state: GameState, id: string, shared: Decimal = sharedMult(state)): Decimal {
  const def = producerById(id);
  const n = owned(state, id);
  if (!def || n === 0) return D(0);
  const fx = upgradeEffects(state.upgrades);
  let bonus = 0;
  for (const syn of fx.synergies) if (syn.target === id) bonus += syn.perUnit * owned(state, syn.source);
  return def.baseRate
    .mul(n)
    .mul(Decimal.pow(milestoneBase(state.recycle), milestonesReached(milestoneUnits(state, id))))
    .mul(shared)
    .mul(fx.global)
    .mul(fx.producer.get(id) ?? 1)
    .mul(1 + bonus);
}

/** What the bought upgrades add up to; worked out once per list, since income is asked for all the time. */
interface UpgradeEffects {
  /** Length of the list when worked out: the list only grows until it is replaced. */
  count: number;
  global: Decimal;
  producer: Map<string, Decimal>;
  synergies: { target: string; source: string; perUnit: number }[];
}

const effectsCache = new WeakMap<readonly string[], UpgradeEffects>();

function upgradeEffects(list: readonly string[]): UpgradeEffects {
  const cached = effectsCache.get(list);
  if (cached && cached.count === list.length) return cached;
  const fx: UpgradeEffects = { count: list.length, global: D(1), producer: new Map(), synergies: [] };
  for (const uid of list) {
    const e = upgradeById(uid)?.effect;
    if (!e) continue;
    if (e.kind === 'producer') fx.producer.set(e.target, (fx.producer.get(e.target) ?? D(1)).mul(e.mult));
    else if (e.kind === 'global') fx.global = fx.global.mul(e.mult);
    else if (e.kind === 'synergy') fx.synergies.push({ target: e.target, source: e.source, perUnit: e.perUnit });
  }
  effectsCache.set(list, fx);
  return fx;
}

export function ratePerSecond(state: GameState): Decimal {
  const shared = sharedMult(state);
  let rate = D(0);
  for (const def of PRODUCERS) rate = rate.add(producerRate(state, def.id, shared));
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
    const rate = ratePerSecond(state);
    let gained = rate.mul(dt);
    if (offline) gained = gained.mul(offlineEfficiency(state.recycle));
    state.trash = state.trash.add(gained);
    state.totalTrash = state.totalTrash.add(gained);
    state.runTrash = state.runTrash.add(gained);
    state.runSeconds += dt;
    if (!offline) state.story.boost = Math.max(0, state.story.boost - dt);
    // Tails off the sorting line feed the thing: it climbs faster.
    state.threat.level = climb(state.threat.level, state.runTrash, dt * threatSpeed(state.sorting) * treeThreatSpeed(state.recycle), offline);
    const pushed = sortingTick(state.sorting, rate, dt, offline);
    // What falls back into the heap pushes it up, but never over the edge by itself.
    if (pushed > 0) state.threat.level = Math.min(state.threat.level + pushed, Math.max(state.threat.level, offline ? OFFLINE_CAP : SORT_PUSH_CAP));
    if (!state.sorting.open && state.recycle.total.gte(SORT_AT)) state.sorting.open = true;
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
  const mult = producerCostMult(state.recycle) * sortingCostMult(state.sorting);
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
/** What a first unit of a producer would make, with every bonus that already applies. */
function firstUnitRate(state: GameState, id: string): Decimal {
  state.owned[id] = 1;
  const rate = producerRate(state, id);
  delete state.owned[id];
  return rate;
}

export function autoBuy(state: GameState, mode: BuyMode = 'one', skip: readonly string[] = []): string | null {
  let best: string | null = null;
  let bestRatio: Decimal | null = null;
  for (const id of state.revealed) {
    if (skip.includes(id)) continue;
    const n = owned(state, id);
    const perUnit = n > 0 ? producerRate(state, id).div(n) : firstUnitRate(state, id);
    if (perUnit.lte(0)) continue;
    const ratio = purchasePlan(state, id, 'one').cost.div(perUnit);
    if (!bestRatio || ratio.lt(bestRatio)) {
      best = id;
      bestRatio = ratio;
    }
  }
  return best && buy(state, best, mode) > 0 ? best : null;
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

/** Buys every upgrade the trash allows, cheapest first. Returns what was bought. */
export function buyAllUpgrades(state: GameState): UpgradeDef[] {
  const bought: UpgradeDef[] = [];
  for (const u of availableUpgrades(state).sort((a, b) => a.cost.cmp(b.cost))) {
    if (state.trash.lt(u.cost)) break;
    if (buyUpgrade(state, u.id)) bought.push(u);
  }
  return bought;
}

/** Upgrades that became available since the last call; marks them as announced. */
export function takeNewUpgrades(state: GameState): UpgradeDef[] {
  const fresh = availableUpgrades(state).filter((u) => !state.seenUpgrades.includes(u.id));
  for (const u of fresh) state.seenUpgrades.push(u.id);
  return fresh;
}

// ---- Recycling ----------------------------------------------------------------

/** What a recycle would give right now. */
export const recycleMult = (state: GameState) => gainMult(state.recycle) * sortingGainMult(state.sorting);
export const currentGain = (state: GameState) => recycleGain(state.runTrash, recycleMult(state));
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

// ---- Sorting ----------------------------------------------------------------------

/** Threat pushed up by the inspection table stops here: the floodlight is still in reach. */
const SORT_PUSH_CAP = 0.95;

export const canResort = (state: GameState) => state.sorting.open && state.recycle.total.gte(sortNeed(state.sorting.sorts));
export const resortGain = (state: GameState) => (state.sorting.open ? lumpFor(state.recycle.total, lumpMult(state.sorting)) : D(0));

/** How a resort's fractions split: as the line catches them, evenly if it catches nothing. */
export function resortShares(state: GameState): Record<Frac, number> {
  const s = state.sorting;
  const { caught } = runLine(s.line.slice(0, slotCount(s)), s.levels);
  const sum = FRACS.reduce((a, f) => a + caught[f], 0);
  const out = {} as Record<Frac, number>;
  for (const f of FRACS) out[f] = sum > 0 ? caught[f] / sum : 1 / FRACS.length;
  return out;
}

/** Tree branches each rank keeps. */
const RANK_BRANCHES: [number, string][] = [
  [1, 'automation'],
  [3, 'start'],
  [4, 'offline'],
  [5, 'production'],
  [6, 'threat'],
];

/**
 * Resorting: all of Recycling burns, the scripts too; fractions come in by the line's
 * shares and the ranks give the comforts back. Returns the fractions gained.
 */
export function resort(state: GameState): Decimal {
  const gain = resortGain(state);
  if (!canResort(state) || gain.lte(0)) return D(0);
  const s = state.sorting;
  const shares = resortShares(state);
  for (const f of FRACS) addFractions(s, f, gain.mul(shares[f]).floor());
  s.sorts += 1;
  s.cycleSeconds = 0;
  const n = s.sorts;

  const old = state.recycle;
  const layer = newLayer();
  layer.resets = old.resets;
  layer.bestSeconds = old.bestSeconds;
  const kept = new Set(RANK_BRANCHES.filter(([at]) => hasRank(n, at)).map(([, b]) => b));
  // A rank keeps what was bought in its branch, not the whole branch: nobody gets nodes for free.
  layer.nodes = old.nodes.filter((id) => kept.has(nodeById(id)!.branch));
  if (hasRank(n, 7)) for (const [id, lv] of Object.entries(old.repeats)) if (lv >= 2) layer.repeats[id] = Math.floor(lv / 2);
  if (hasRank(n, 15)) {
    layer.total = old.total.mul(0.1).floor();
    layer.points = layer.total;
  }
  if (hasRank(n, 2)) layer.points = layer.points.add(100);
  state.recycle = layer;

  const sc = state.scripts;
  if (!hasRank(n, 1)) sc.bought = [];
  if (!hasRank(n, 10)) {
    sc.speed = 0;
    sc.reliability = 0;
  }
  sc.peak = 0;
  startNewRun(state);
  return gain;
}

/** Whether the auto-sorter should resort now. */
export function autoSortDue(state: GameState): boolean {
  const sc = state.scripts;
  if (!sc.sortOn || !scriptOwned(state, 'sort') || !canResort(state)) return false;
  if (sc.sortMode === 'time') return state.sorting.cycleSeconds >= sc.sortMinutes * 60;
  return resortGain(state).gte(state.sorting.total.mul(sc.sortShare).max(1));
}

/** Ranks reached, for the screen. */
export const ranksReached = (state: GameState) => RANKS.filter((r) => hasRank(state.sorting.sorts, r.at));

/** Starts the run over, keeping what the Recycling tree says to keep. */
function startNewRun(state: GameState): void {
  const layer = state.recycle;
  state.trash = D(hasNode(layer, 's6') ? 1e10 : hasNode(layer, 's4') ? 1e8 : hasNode(layer, 's2') ? 1e4 : 0);
  state.runTrash = D(0);
  state.runSeconds = 0;
  state.owned = { collector: hasNode(layer, 's1') ? 10 : 1 };
  if (!hasNode(layer, 's2')) state.revealed = ['collector'];
  // Saved blueprints keep the first tier of every producer upgrade.
  // Saved blueprints keep the first tier of every producer upgrade, ready blueprints the first two.
  const kept = hasNode(layer, 's5') ? /-[12]$/ : hasNode(layer, 's3') ? /-1$/ : null;
  state.upgrades = kept ? state.upgrades.filter((id) => kept.test(id)) : [];
  state.threat.level = 0;
  state.story.traces = [];
  state.tracks = {};
  state.scripts.peak = 0;
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
export const repeatsOpen = (state: GameState) => NODES.every((n) => n.extra || state.recycle.nodes.includes(n.id));

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
  if (!state.autoRecycle.on || !hasNode(state.recycle, 'a3') || state.runSeconds < 10) return false;
  const gain = currentGain(state);
  if (gain.lte(0)) return false;
  const sc = state.scripts;
  switch (sc.recycleMode) {
    case 'gain':
      return gain.gte(autoRecycleAt(state));
    case 'time':
      return state.runSeconds >= sc.recycleMinutes * 60;
    case 'peak':
      // Recycled per second of the run has passed its best: waiting longer only slows things down.
      return sc.peak > 0 && recycleRate(state) < sc.peak * PEAK_DROP;
  }
}

/** The peak mode recycles once the rate falls this far below its best. */
const PEAK_DROP = 0.95;
const recycleRate = (state: GameState) => recycleGainRaw(state.runTrash, recycleMult(state)) / Math.max(state.runSeconds, 1);

// ---- Automation tab -------------------------------------------------------------

/** Whether a script is installed: through its tree node or bought for Recycled material. */
export function scriptOwned(state: GameState, id: ScriptId): boolean {
  const def = scriptById(id)!;
  if (def.recipe) return state.sorting.recipes.includes(def.recipe);
  // The dispatcher and the second floodlight install scripts on their own.
  if ((id === 'upgrades' || id === 'endless') && hasNode(state.recycle, 'a5')) return true;
  if (id === 'light' && hasNode(state.recycle, 't4')) return true;
  return def.node ? hasNode(state.recycle, def.node) : state.scripts.bought.includes(id);
}

/** Whether a script's install offer is on the tab. */
export function scriptOffered(state: GameState, id: ScriptId): boolean {
  switch (id) {
    case 'upgrades':
      return state.recycle.resets >= 1;
    case 'endless':
      return state.recycle.resets >= 1 && state.totalTrash.gte(1e10);
    case 'light':
      return state.threat.lights >= 10 || state.threat.losses >= 1;
    default:
      return false;
  }
}

export function installScript(state: GameState, id: ScriptId): boolean {
  const def = scriptById(id);
  if (!def?.cost || scriptOwned(state, id) || !scriptOffered(state, id) || state.recycle.points.lt(def.cost)) return false;
  state.recycle.points = state.recycle.points.sub(def.cost);
  state.scripts.bought.push(id);
  return true;
}

/** Whether the Automation tab has anything on it yet. */
export const automationOpen = (state: GameState) => hasNode(state.recycle, 'a1') || state.scripts.bought.length > 0;

export function buySpeed(state: GameState): boolean {
  const cost = speedCost(state.scripts.speed);
  if (!automationOpen(state) || state.recycle.points.lt(cost)) return false;
  state.recycle.points = state.recycle.points.sub(cost);
  state.scripts.speed += 1;
  return true;
}

export function buyReliability(state: GameState): boolean {
  const cost = reliabilityCost(state.scripts.reliability);
  if (!scriptOwned(state, 'light') || state.recycle.points.lt(cost)) return false;
  state.recycle.points = state.recycle.points.sub(cost);
  state.scripts.reliability += 1;
  return true;
}

/** Seconds between ticks of the buying scripts. */
export function scriptTick(state: GameState): number {
  const tick = hasNode(state.recycle, 'a4') ? FOREMAN_TICK : hasNode(state.recycle, 'a2') ? FAST_TICK : BASE_TICK;
  return tick / (1 + SPEED_STEP * state.scripts.speed);
}

export const lightFailChance = (state: GameState) => failChance(depthOf(state), state.scripts.reliability) * (hasNode(state.recycle, 't4') ? 0.5 : 1);

/** Peak of the dark bonus: the base, the dark pact's levels and the tree. */
export const darkPeakOf = (state: GameState) => darkPeak(state.tracks, DARK_BONUS) + treeDarkPeak(state.recycle);

/** What a script did, for the log. */
export interface ScriptNote {
  script: ScriptId;
  text: string;
  /** The floodlight did not come on. */
  failed?: boolean;
}

/** A hidden tab can come back after hours; the scripts catch up at most this many ticks per frame. */
const MAX_TICKS_PER_FRAME = 8;

/** Runs every installed script for one frame and says what they did. */
export function runScripts(state: GameState, dt: number, rng: () => number = Math.random): ScriptNote[] {
  const sc = state.scripts;
  const notes: ScriptNote[] = [];

  if (scriptOwned(state, 'light') && sc.lightOn) {
    sc.cooldown = Math.max(0, sc.cooldown - dt);
    if (sc.cooldown === 0 && state.threat.level >= sc.lightAt) {
      const at = Math.floor(state.threat.level * 100);
      if (rng() < lightFailChance(state)) {
        sc.failures += 1;
        sc.cooldown = LIGHT_RETRY;
        notes.push({ script: 'light', text: `отказ на ${at}%`, failed: true });
      } else {
        state.threat.lights += 1;
        state.threat.level = 0;
        notes.push({ script: 'light', text: `свет на ${at}%` });
      }
    }
  }

  if (scriptOwned(state, 'recycle')) sc.peak = Math.max(sc.peak, recycleRate(state));

  const interval = scriptTick(state);
  sc.clock = Math.min(sc.clock + dt, interval * MAX_TICKS_PER_FRAME);
  while (sc.clock >= interval) {
    sc.clock -= interval;
    if (state.autobuy && scriptOwned(state, 'producers')) {
      const id = autoBuy(state, sc.producerMode, sc.producerOff);
      if (id) notes.push({ script: 'producers', text: producerById(id)!.name });
    }
    if (sc.upgradesOn && scriptOwned(state, 'upgrades')) {
      const limit = state.trash.mul(sc.upgradesShare);
      const u = availableUpgrades(state).find((x) => x.cost.lte(limit));
      if (u && buyUpgrade(state, u.id)) notes.push({ script: 'upgrades', text: u.name });
    }
    if (sc.endlessOn && scriptOwned(state, 'endless')) {
      const cheapest = visibleTracks(state)
        .filter((t) => !sc.endlessOff.includes(t.id))
        .map((t) => ({ t, cost: trackCost(t, trackLevel(state, t.id)) }))
        .sort((a, b) => a.cost.cmp(b.cost))[0];
      if (cheapest && buyTrack(state, cheapest.t.id)) notes.push({ script: 'endless', text: cheapest.t.name });
    }
  }
  return notes;
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

// ---- Story events ---------------------------------------------------------------

/**
 * Counts down to the next camera event and records it when due. Returns the new
 * recording for the screen to play, or null. Nothing happens before the threat wakes.
 */
export function storyTick(state: GameState, dt: number, now = new Date()): Recording | null {
  if (!threatActive(state.runTrash) || state.threat.level >= 1) return null;
  const stage = stageIndex(state.threat.level);
  const story = state.story;
  // The first thing on camera comes soon after the threat wakes.
  if (story.seq === 0) story.nextIn = Math.min(story.nextIn, FIRST_EVENT_SECONDS);
  story.nextIn -= dt;
  if (story.nextIn > 0) return null;
  const rec = record(story, pickEvent(story, stage, state.owned), now.getTime());
  // While a new case is waiting to be caught, the camera does not keep the player waiting long.
  const sooner = freshCase(story, stage, state.owned) ? FRESH_CASE_FACTOR : 1;
  story.nextIn = eventInterval(stage, isNight(now)) * sooner;
  return rec;
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
