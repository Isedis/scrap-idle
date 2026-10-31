import { parseNum } from './num';
import { ABOVE_SCRIPTS, AUTO_OPEN, CONTAINERS, ITEMS, RARITIES, TOOLS, newBottom, type BottomState } from './bottom';
import { AUTO_FACTORS, AUTO_FACTOR_DEFAULT, advance, newGame, type BuyMode, type GameState } from './state';
import { PRODUCERS } from './producers';
import { upgradeById } from './upgrades';
import { nodeById, newLayer, offlineCapSeconds, type LayerState } from './layers';
import { NOTES, eventById, newStory, type Recording, type StoryState } from './story';
import { TRACKS, type TrackLevels } from './infinite';
import { ACHIEVEMENTS } from './achievements';
import { REPEATS } from './layers';
import { recordAway } from './state';
import { districtById, newCity, type CityState } from './city';
import { CHECK_SECONDS, HOLD_SECONDS, MAX_NOISE, WALK_MAX, newHearing, type HearingPhase, type HearingState } from './hearing';
import { FRACS, RECIPES, STATIONS, UNIQUES, newSorting, type SortingState, type StationId } from './sorting';
import {
  LIGHT_LEVELS,
  RECYCLE_MINUTES,
  RECYCLE_MODES,
  SCRIPTS,
  SORT_MINUTES,
  SORT_MODES,
  SORT_SHARES,
  UPGRADE_SHARES,
  newScripts,
  type ScriptsState, RELIABILITY_MAX, SPEED_MAX } from './scripts';

export const SAVE_KEY = 'scrap-idle-save';
export const BACKUP_KEY = 'scrap-idle-save-backup';
const VERSION = 13;

/** Run length for a run whose start is not known; stays negative however long it is played. */
const UNKNOWN_RUN_SECONDS = -1e12;


interface SaveV1 {
  v: 1;
  trash: string;
  totalTrash: string;
  owned: Record<string, number>;
  revealed: string[];
  lastTick: number;
}

/** v2 adds upgrades and the buy mode. */
interface SaveV2 extends Omit<SaveV1, 'v'> {
  v: 2;
  upgrades: string[];
  seenUpgrades: string[];
  buyMode: BuyMode;
}

interface LayerSave {
  points: string;
  total: string;
  resets: number;
  nodes: string[];
  bestSeconds: number | null;
  /** Since v6. */
  repeats?: Record<string, number>;
}

/** v3 adds the current run and prestige layers, keyed by layer id so later layers slot in. */
interface SaveV3 extends Omit<SaveV2, 'v'> {
  v: 3;
  runTrash: string;
  runSeconds: number;
  layers: Record<string, LayerSave>;
  autobuy: boolean;
}

/** v4 adds the threat under the heap. */
interface SaveV4 extends Omit<SaveV3, 'v'> {
  v: 4;
  threat: { level: number; losses: number };
}

/** v5 adds what the camera caught: archive, cases, notes, voices. */
interface SaveV5 extends Omit<SaveV4, 'v'> {
  v: 5;
  story: StoryState;
}

/** v6 adds endless upgrades, achievements, the auto-recycler and light statistics. */
interface SaveV6 extends Omit<SaveV5, 'v' | 'threat'> {
  v: 6;
  threat: { level: number; losses: number; lights: number; bravest: number };
  tracks: TrackLevels;
  compacted: number;
  achievements: string[];
  autoRecycle: { on: boolean; factor: number };
}

/** What is kept of the Automation tab; the clocks rebuild on their own. */
type ScriptsSave = Omit<ScriptsState, 'clock' | 'cooldown' | 'peak'>;

/** v7 adds the Automation tab. */
interface SaveV7 extends Omit<SaveV6, 'v'> {
  v: 7;
  scripts: ScriptsSave;
}

/** v8 adds Sorting, kept under `layers.sorting`. */
interface SortingSave {
  open: boolean;
  fractions: Record<string, string>;
  total: string;
  sorts: number;
  line: (string | null)[];
  levels: Record<string, { speed: number; purity: number }>;
  recipes: string[];
  alloys: number;
  queue: number;
  progress: number;
  arrival: number;
  inspected: number;
  found: string[];
  cycleSeconds: number;
}

interface SaveV8 extends Omit<SaveV7, 'v' | 'layers'> {
  v: 8;
  layers: { recycle: LayerSave; sorting: SortingSave };
}

/** v9 adds the one that listens: the plant's noise and how much it has heard. */
interface SaveV9 extends Omit<SaveV8, 'v'> {
  v: 9;
  hearing: HearingState;
}

/** v10 adds the town, kept under `layers.city`. */
interface CitySave {
  open: boolean;
  points: string;
  total: string;
  reforms: number;
  owned: string[];
}

interface SaveV10 extends Omit<SaveV9, 'v' | 'layers'> {
  v: 10;
  layers: { recycle: LayerSave; sorting: SortingSave; city: CitySave };
}

/** v11 adds the switches of the town's caretaker and fitter to the scripts. */
interface SaveV11 extends Omit<SaveV10, 'v'> {
  v: 11;
}

/** v12: the auto-recycler's threshold is a share of the material earned (was a multiple); older settings reset. */
interface SaveV12 extends Omit<SaveV11, 'v'> {
  v: 12;
}

/** v13 adds the bottom of the pit, kept under `layers.bottom`. */
interface BottomSave {
  open: boolean;
  heap: number;
  dig: number;
  dug: number;
  stock: Record<string, number>;
  money: Record<string, string>;
  tools: Record<string, number>;
  auto: number;
  dry: Record<string, number>;
  found: Record<string, number>;
  opened: number;
  ume: string;
  above: string;
  scripts: string[];
}

interface SaveV13 extends Omit<SaveV12, 'v' | 'layers'> {
  v: 13;
  layers: { recycle: LayerSave; sorting: SortingSave; city: CitySave; bottom: BottomSave };
}

function saveBottom(b: BottomState): BottomSave {
  return {
    open: b.open,
    heap: b.heap,
    dig: b.dig,
    dug: b.dug,
    stock: { ...b.stock },
    money: Object.fromEntries(RARITIES.map((r) => [r, b.money[r].toString()])),
    tools: { ...b.tools },
    auto: b.auto,
    dry: { ...b.dry },
    found: { ...b.found },
    opened: b.opened,
    ume: b.ume.toString(),
    above: b.above.toString(),
    scripts: [...b.scripts],
  };
}

function loadBottom(data: Partial<BottomSave> | undefined): BottomState | null {
  const b = newBottom();
  if (!data || typeof data !== 'object') return b;
  const n = (v: unknown, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);
  const int = (v: unknown, max?: number) => Math.floor(n(v, max));
  b.open = data.open === true;
  b.heap = n(data.heap);
  b.dig = n(data.dig, 1);
  b.dug = n(data.dug);
  for (const c of CONTAINERS) b.stock[c.id] = int(data.stock?.[c.id]);
  for (const r of RARITIES) {
    const v = parseNum(data.money?.[r] ?? '0');
    if (!v) return null;
    b.money[r] = v.max(0);
  }
  for (const t of TOOLS) b.tools[t.id] = int(data.tools?.[t.id], t.max);
  b.auto = int(data.auto, AUTO_OPEN.length);
  for (const r of RARITIES) if (data.dry?.[r] !== undefined) b.dry[r] = int(data.dry[r]);
  for (const i of ITEMS) if (data.found?.[i.id]) b.found[i.id] = int(data.found[i.id]);
  b.opened = int(data.opened);
  const ume = parseNum(data.ume ?? '0');
  const above = parseNum(data.above ?? '0');
  if (!ume || !above) return null;
  b.ume = ume.max(0);
  b.above = above.max(0);
  b.scripts = Array.isArray(data.scripts) ? [...new Set(data.scripts.filter((id) => ABOVE_SCRIPTS.some((x) => x.id === id)))] : [];
  return b;
}

function loadCity(data: Partial<CitySave> | undefined): CityState | null {
  const c = newCity();
  if (!data || typeof data !== 'object') return c;
  const points = parseNum(data.points ?? '0');
  const total = parseNum(data.total ?? '0');
  if (!points || !total) return null;
  c.open = data.open === true;
  c.points = points.max(0);
  c.total = total.max(c.points);
  c.reforms = Number.isFinite(data.reforms) ? Math.max(0, Math.floor(data.reforms!)) : 0;
  const owned = Array.isArray(data.owned) ? data.owned.filter((id) => typeof id === 'string' && districtById(id)) : [];
  c.owned = [...new Set(['dump', ...owned])];
  return c;
}

const PHASES: readonly HearingPhase[] = ['idle', 'walk', 'check', 'caught'];

function loadHearing(data: Partial<HearingState> | undefined): HearingState {
  const h = newHearing();
  if (!data || typeof data !== 'object') return h;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
  h.noise = num(data.noise, 0, MAX_NOISE, 1);
  h.meter = num(data.meter, 0, 1, 0);
  h.phase = PHASES.includes(data.phase as HearingPhase) ? (data.phase as HearingPhase) : 'idle';
  h.walk = num(data.walk, 0, WALK_MAX, 0);
  h.left = num(data.left, 0, Math.max(WALK_MAX, CHECK_SECONDS), 0);
  h.held = num(data.held, 0, HOLD_SECONDS, 0);
  h.survived = Math.floor(num(data.survived, 0, 1e9, 0));
  h.losses = Math.floor(num(data.losses, 0, 1e9, 0));
  return h;
}

const saveSorting = (s: SortingState): SortingSave => ({
  open: s.open,
  fractions: Object.fromEntries(FRACS.map((f) => [f, s.fractions[f].toString()])),
  total: s.total.toString(),
  sorts: s.sorts,
  line: s.line,
  levels: s.levels as SortingSave['levels'],
  recipes: s.recipes,
  alloys: s.alloys,
  queue: s.queue,
  progress: s.progress,
  arrival: s.arrival,
  inspected: s.inspected,
  found: s.found,
  cycleSeconds: s.cycleSeconds,
});

function loadSorting(data: Partial<SortingSave> | undefined): SortingState | null {
  const s = newSorting();
  if (!data || typeof data !== 'object') return s;
  for (const f of FRACS) {
    const n = parseNum(data.fractions?.[f] ?? '0');
    if (!n) return null;
    s.fractions[f] = n;
  }
  const total = parseNum(data.total ?? '0');
  if (!total) return null;
  s.total = FRACS.reduce((sum, f) => sum.max(s.fractions[f]), total);
  s.open = data.open === true;
  s.sorts = count(data.sorts);
  s.alloys = count(data.alloys);
  s.inspected = count(data.inspected);
  const recipes = new Set(RECIPES.map((r) => r.id));
  s.recipes = Array.isArray(data.recipes) ? [...new Set(data.recipes.filter((id) => recipes.has(id)))] : [];
  const stations = new Set<string>(STATIONS.map((st) => st.id));
  if (Array.isArray(data.line)) {
    const seen = new Set<string>();
    s.line = data.line.slice(0, 6).map((id) => {
      if (typeof id !== 'string' || !stations.has(id) || seen.has(id)) return null;
      seen.add(id);
      return id as StationId;
    });
  }
  if (data.levels && typeof data.levels === 'object') {
    for (const id of stations) {
      const lv = (data.levels as Record<string, { speed?: unknown; purity?: unknown }>)[id];
      if (lv && typeof lv === 'object') s.levels[id as StationId] = { speed: count(lv.speed), purity: count(lv.purity) };
    }
  }
  s.queue = count(data.queue);
  const unit = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);
  s.progress = unit(data.progress);
  s.arrival = typeof data.arrival === 'number' && Number.isFinite(data.arrival) && data.arrival > 0 ? data.arrival : 0;
  const uniques = new Set(UNIQUES.map((u) => u.id));
  s.found = Array.isArray(data.found) ? [...new Set(data.found.filter((id) => uniques.has(id)))] : [];
  s.cycleSeconds = typeof data.cycleSeconds === 'number' && Number.isFinite(data.cycleSeconds) && data.cycleSeconds > 0 ? data.cycleSeconds : 0;
  return s;
}

const oneOf = <T>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

function loadScripts(data: Partial<ScriptsSave> | undefined): ScriptsState {
  const sc = newScripts();
  if (!data || typeof data !== 'object') return sc;
  const buyable = SCRIPTS.filter((d) => d.cost).map((d) => d.id);
  sc.bought = Array.isArray(data.bought) ? [...new Set(data.bought.filter((id) => buyable.includes(id)))] : [];
  // Both used to level without end; anything past the cap counts as the cap.
  sc.speed = Math.min(count(data.speed), SPEED_MAX);
  sc.reliability = Math.min(count(data.reliability), RELIABILITY_MAX);
  sc.failures = count(data.failures);
  sc.producerMode = oneOf(BUY_MODES, data.producerMode, sc.producerMode);
  const producers = new Set(PRODUCERS.map((p) => p.id));
  sc.producerOff = Array.isArray(data.producerOff) ? [...new Set(data.producerOff.filter((id) => producers.has(id)))] : [];
  sc.upgradesOn = data.upgradesOn !== false;
  sc.upgradesShare = oneOf(UPGRADE_SHARES, data.upgradesShare, sc.upgradesShare);
  sc.endlessOn = data.endlessOn !== false;
  const tracks = TRACKS.map((t) => t.id);
  sc.endlessOff = Array.isArray(data.endlessOff) ? [...new Set(data.endlessOff.filter((id) => tracks.includes(id)))] : [];
  sc.recycleMode = oneOf(RECYCLE_MODES, data.recycleMode, sc.recycleMode);
  sc.recycleMinutes = oneOf(RECYCLE_MINUTES, data.recycleMinutes, sc.recycleMinutes);
  sc.lightOn = data.lightOn !== false;
  sc.lightAt = oneOf(LIGHT_LEVELS, data.lightAt, sc.lightAt);
  sc.sortOn = data.sortOn === true;
  sc.sortMode = oneOf(SORT_MODES, data.sortMode, sc.sortMode);
  sc.sortShare = oneOf(SORT_SHARES, data.sortShare, sc.sortShare);
  sc.sortMinutes = oneOf(SORT_MINUTES, data.sortMinutes, sc.sortMinutes);
  // Since v11: the town's caretaker and fitter, on unless switched off.
  sc.treeOn = data.treeOn !== false;
  sc.lineOn = data.lineOn !== false;
  return sc;
}

/** Non-negative whole counts by known id. */
function levels<K extends string>(data: unknown, ids: readonly K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!data || typeof data !== 'object') return out;
  for (const id of ids) {
    const n = (data as Record<string, unknown>)[id];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

function loadStory(data: Partial<StoryState> | undefined): StoryState {
  const story = newStory();
  if (!data || typeof data !== 'object') return story;
  const known = (id: unknown): id is string => typeof id === 'string' && !!eventById(id);
  story.cases = Array.isArray(data.cases) ? [...new Set(data.cases.filter(known))] : [];
  story.notes = Number.isInteger(data.notes) ? Math.min(Math.max(data.notes!, 0), NOTES.length) : 0;
  story.voices = Array.isArray(data.voices) ? data.voices.filter((v) => typeof v === 'string').slice(-50) : [];
  story.records = Array.isArray(data.records)
    ? data.records
        .filter((r): r is Recording => !!r && known(r.event) && Number.isFinite(r.seq) && Number.isFinite(r.at))
        .map((r) => ({ seq: r.seq, event: r.event, at: r.at, watched: r.watched === true, ...(r.away ? { away: true } : {}), ...(typeof r.phrase === 'string' ? { phrase: r.phrase } : {}) }))
    : [];
  story.traces = Array.isArray(data.traces) ? data.traces.filter((t) => t === 'fridge' || t === 'lamp') : [];
  story.nextIn = Number.isFinite(data.nextIn) && data.nextIn! > 0 ? data.nextIn! : story.nextIn;
  story.boost = Number.isFinite(data.boost) && data.boost! > 0 ? data.boost! : 0;
  story.seq = Math.max(Number.isFinite(data.seq) ? data.seq! : 0, ...story.records.map((r) => r.seq), 0);
  return story;
}

const BUY_MODES: readonly BuyMode[] = ['one', 'ten', 'max'];

const saveLayer = (l: LayerState): LayerSave => ({
  points: l.points.toString(),
  total: l.total.toString(),
  resets: l.resets,
  nodes: l.nodes,
  bestSeconds: l.bestSeconds,
  repeats: l.repeats,
});

function loadLayer(data: Partial<LayerSave> | undefined): LayerState | null {
  const layer = newLayer();
  if (!data || typeof data !== 'object') return layer;
  const points = parseNum(data.points ?? '0');
  const total = parseNum(data.total ?? '0');
  if (!points || !total) return null;
  layer.points = points;
  layer.total = total.max(points);
  layer.resets = Number.isFinite(data.resets) && data.resets! >= 0 ? Math.floor(data.resets!) : 0;
  layer.nodes = Array.isArray(data.nodes) ? [...new Set(data.nodes.filter((id) => typeof id === 'string' && nodeById(id)))] : [];
  layer.bestSeconds = typeof data.bestSeconds === 'number' && data.bestSeconds >= 0 ? data.bestSeconds : null;
  layer.repeats = levels(data.repeats, REPEATS.map((r) => r.id));
  return layer;
}

export function serialize(state: GameState): string {
  const { clock: _c, cooldown: _d, peak: _p, ...scripts } = state.scripts;
  const data: SaveV13 = {
    v: VERSION,
    trash: state.trash.toString(),
    totalTrash: state.totalTrash.toString(),
    owned: state.owned,
    revealed: state.revealed,
    upgrades: state.upgrades,
    seenUpgrades: state.seenUpgrades,
    buyMode: state.buyMode,
    runTrash: state.runTrash.toString(),
    runSeconds: state.runSeconds,
    layers: {
      recycle: saveLayer(state.recycle),
      sorting: saveSorting(state.sorting),
      city: { open: state.city.open, points: state.city.points.toString(), total: state.city.total.toString(), reforms: state.city.reforms, owned: state.city.owned },
      bottom: saveBottom(state.bottom),
    },
    autobuy: state.autobuy,
    threat: { ...state.threat },
    story: state.story,
    tracks: state.tracks,
    compacted: state.compacted,
    achievements: state.achievements,
    autoRecycle: state.autoRecycle,
    scripts,
    hearing: { ...state.hearing },
    lastTick: state.lastTick,
  };
  return JSON.stringify(data);
}

/** Parses a save; returns null for anything that is not a readable save. */
export function deserialize(text: string): GameState | null {
  let data: Partial<SaveV13> | Partial<SaveV12> | Partial<SaveV11> | Partial<SaveV10> | Partial<SaveV9> | Partial<SaveV8> | Partial<SaveV7> | Partial<SaveV6> | Partial<SaveV5> | Partial<SaveV4> | Partial<SaveV3> | Partial<SaveV2> | Partial<SaveV1>;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(data.v as number)) return null;

  const state = newGame(typeof data.lastTick === 'number' ? data.lastTick : Date.now());
  const trash = parseNum(data.trash ?? '0');
  const total = parseNum(data.totalTrash ?? '0');
  if (!trash || !total) return null;
  state.trash = trash;
  state.totalTrash = total.max(trash);

  const known = new Set(PRODUCERS.map((p) => p.id));
  for (const [id, n] of Object.entries(data.owned ?? {})) {
    if (known.has(id) && Number.isFinite(n) && n >= 0) state.owned[id] = Math.floor(n);
  }
  state.revealed = (data.revealed ?? []).filter((id) => known.has(id));
  if (!state.revealed.includes('collector')) state.revealed.unshift('collector');

  // A v1 save simply has none of these yet.
  if (data.v === 2 || data.v === 3 || data.v === 4 || data.v === 5 || data.v === 6 || data.v === 7 || data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) {
    const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && upgradeById(id)) : []);
    state.upgrades = [...new Set(ids(data.upgrades))];
    state.seenUpgrades = [...new Set([...ids(data.seenUpgrades), ...state.upgrades])];
    if (BUY_MODES.includes(data.buyMode as BuyMode)) state.buyMode = data.buyMode as BuyMode;
  }

  // Before v3 there was a single run: everything collected so far belongs to it, length unknown.
  state.runTrash = state.totalTrash;
  state.runSeconds = UNKNOWN_RUN_SECONDS;
  if (data.v === 3 || data.v === 4 || data.v === 5 || data.v === 6 || data.v === 7 || data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) {
    const run = parseNum(data.runTrash ?? '0');
    const recycle = loadLayer(data.layers?.recycle);
    if (!run || !recycle) return null;
    state.runTrash = run.min(state.totalTrash);
    state.runSeconds = Number.isFinite(data.runSeconds) ? data.runSeconds! : UNKNOWN_RUN_SECONDS;
    state.recycle = recycle;
    state.autobuy = data.autobuy !== false;
  }

  // Older saves start with nothing stirring.
  if (data.v === 4 || data.v === 5 || data.v === 6 || data.v === 7 || data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) {
    const t = data.threat;
    const level = typeof t?.level === 'number' && Number.isFinite(t.level) ? t.level : 0;
    state.threat.level = Math.min(Math.max(level, 0), 1);
    state.threat.losses = typeof t?.losses === 'number' && t.losses >= 0 ? Math.floor(t.losses) : 0;
  }
  if (data.v === 5 || data.v === 6 || data.v === 7 || data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) state.story = loadStory(data.story);
  if (data.v === 6 || data.v === 7 || data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) {
    const t = data.threat;
    state.threat.lights = typeof t?.lights === 'number' && t.lights >= 0 ? Math.floor(t.lights) : 0;
    state.threat.bravest = typeof t?.bravest === 'number' && Number.isFinite(t.bravest) ? Math.min(Math.max(t.bravest, 0), 1) : 0;
    state.tracks = levels(data.tracks, TRACKS.map((tr) => tr.id));
    state.compacted = Math.max(Number.isFinite(data.compacted) ? Math.floor(data.compacted!) : 0, state.tracks.compact ?? 0, 0);
    const known = new Set(ACHIEVEMENTS.map((a) => a.id));
    state.achievements = Array.isArray(data.achievements) ? [...new Set(data.achievements.filter((id) => known.has(id)))] : [];
    const ar = data.autoRecycle;
    state.autoRecycle = {
      on: ar?.on === true,
      // Before v12 the factor was a multiple of everything earned and could never be reached.
      factor: (data.v === 12 || data.v === 13) && AUTO_FACTORS.includes(ar?.factor as (typeof AUTO_FACTORS)[number]) ? ar!.factor : AUTO_FACTOR_DEFAULT,
    };
  }
  // Before v7 there was no Automation tab: every script starts uninstalled, with default settings.
  if (data.v === 7 || data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) state.scripts = loadScripts(data.scripts);
  // Before v8 there was no Sorting: the line opens on its own once Recycling has earned enough.
  if (data.v === 8 || data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) {
    const sorting = loadSorting(data.layers?.sorting);
    if (!sorting) return null;
    state.sorting = sorting;
  }
  // Before v9 nothing listened: the plant starts at normal load.
  if (data.v === 9 || data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) state.hearing = loadHearing(data.hearing);
  // Before v10 there was no town: it opens on its own after enough resorts in one cycle.
  if (data.v === 10 || data.v === 11 || data.v === 12 || data.v === 13) {
    const city = loadCity((data.layers as SaveV10['layers'] | undefined)?.city);
    if (!city) return null;
    state.city = city;
  }
  // Before v13 nobody had gone down: the bottom is closed.
  if (data.v === 13) {
    const bottom = loadBottom((data.layers as SaveV13['layers'] | undefined)?.bottom);
    if (!bottom) return null;
    state.bottom = bottom;
  }
  return state;
}

/** Export string: the save in base64 so it survives copying through chats. */
export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(serialize(state))));
}

export function importSave(text: string): GameState | null {
  const trimmed = text.trim();
  try {
    return deserialize(decodeURIComponent(escape(atob(trimmed))));
  } catch {
    // Also accept a raw JSON save.
    return deserialize(trimmed);
  }
}

/** Applies the time since the last tick, capped. Returns the seconds simulated. */
export function applyOffline(state: GameState, now = Date.now()): number {
  const seconds = Math.min(Math.max(0, (now - state.lastTick) / 1000), offlineCapSeconds(state.recycle));
  advance(state, seconds, true);
  recordAway(state, seconds, now);
  state.lastTick = now;
  return seconds;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** While a preview runs, nothing is written: the player's own save waits untouched. */
let previewing = false;
export const startPreview = () => void (previewing = true);
export const isPreview = () => previewing;

export function writeSave(state: GameState): void {
  if (previewing) return;
  const store = storage();
  if (!store) return;
  try {
    const previous = store.getItem(SAVE_KEY);
    if (previous) store.setItem(BACKUP_KEY, previous);
    store.setItem(SAVE_KEY, serialize(state));
  } catch {
    // Storage full or blocked: the game keeps running, it just won't persist.
  }
}

/** Loads the main save, falling back to the backup if the main one is damaged. */
export function readSave(): GameState | null {
  const store = storage();
  if (!store) return null;
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const text = store.getItem(key);
      const state = text ? deserialize(text) : null;
      if (state) return state;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

export function wipeSave(): void {
  const store = storage();
  try {
    store?.removeItem(SAVE_KEY);
    store?.removeItem(BACKUP_KEY);
  } catch {
    // Nothing to do.
  }
}
