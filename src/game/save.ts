import { parseNum } from './num';
import { advance, newGame, type BuyMode, type GameState } from './state';
import { PRODUCERS } from './producers';
import { upgradeById } from './upgrades';
import { nodeById, newLayer, offlineCapSeconds, type LayerState } from './layers';
import { NOTES, eventById, newStory, type Recording, type StoryState } from './story';
import { recordAway } from './state';

export const SAVE_KEY = 'scrap-idle-save';
export const BACKUP_KEY = 'scrap-idle-save-backup';
const VERSION = 5;

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
  return layer;
}

export function serialize(state: GameState): string {
  const data: SaveV5 = {
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
    layers: { recycle: saveLayer(state.recycle) },
    autobuy: state.autobuy,
    threat: { level: state.threat.level, losses: state.threat.losses },
    story: state.story,
    lastTick: state.lastTick,
  };
  return JSON.stringify(data);
}

/** Parses a save; returns null for anything that is not a readable save. */
export function deserialize(text: string): GameState | null {
  let data: Partial<SaveV5> | Partial<SaveV4> | Partial<SaveV3> | Partial<SaveV2> | Partial<SaveV1>;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || ![1, 2, 3, 4, 5].includes(data.v as number)) return null;

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
  if (data.v === 2 || data.v === 3 || data.v === 4 || data.v === 5) {
    const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && upgradeById(id)) : []);
    state.upgrades = [...new Set(ids(data.upgrades))];
    state.seenUpgrades = [...new Set([...ids(data.seenUpgrades), ...state.upgrades])];
    if (BUY_MODES.includes(data.buyMode as BuyMode)) state.buyMode = data.buyMode as BuyMode;
  }

  // Before v3 there was a single run: everything collected so far belongs to it, length unknown.
  state.runTrash = state.totalTrash;
  state.runSeconds = UNKNOWN_RUN_SECONDS;
  if (data.v === 3 || data.v === 4 || data.v === 5) {
    const run = parseNum(data.runTrash ?? '0');
    const recycle = loadLayer(data.layers?.recycle);
    if (!run || !recycle) return null;
    state.runTrash = run.min(state.totalTrash);
    state.runSeconds = Number.isFinite(data.runSeconds) ? data.runSeconds! : UNKNOWN_RUN_SECONDS;
    state.recycle = recycle;
    state.autobuy = data.autobuy !== false;
  }

  // Older saves start with nothing stirring.
  if (data.v === 4 || data.v === 5) {
    const t = data.threat;
    const level = typeof t?.level === 'number' && Number.isFinite(t.level) ? t.level : 0;
    state.threat.level = Math.min(Math.max(level, 0), 1);
    state.threat.losses = typeof t?.losses === 'number' && t.losses >= 0 ? Math.floor(t.losses) : 0;
  }
  if (data.v === 5) state.story = loadStory(data.story);
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

export function writeSave(state: GameState): void {
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
