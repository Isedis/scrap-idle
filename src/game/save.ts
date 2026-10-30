import { parseNum } from './num';
import { advance, newGame, type GameState } from './state';
import { PRODUCERS } from './producers';

export const SAVE_KEY = 'scrap-idle-save';
export const BACKUP_KEY = 'scrap-idle-save-backup';
const VERSION = 1;

/** Offline progress stops counting after a day away. */
export const OFFLINE_CAP_SECONDS = 24 * 60 * 60;

interface SaveV1 {
  v: 1;
  trash: string;
  totalTrash: string;
  owned: Record<string, number>;
  revealed: string[];
  lastTick: number;
}

export function serialize(state: GameState): string {
  const data: SaveV1 = {
    v: VERSION,
    trash: state.trash.toString(),
    totalTrash: state.totalTrash.toString(),
    owned: state.owned,
    revealed: state.revealed,
    lastTick: state.lastTick,
  };
  return JSON.stringify(data);
}

/** Parses a save; returns null for anything that is not a readable save. */
export function deserialize(text: string): GameState | null {
  let data: Partial<SaveV1>;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || data.v !== 1) return null;

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
  const seconds = Math.min(Math.max(0, (now - state.lastTick) / 1000), OFFLINE_CAP_SECONDS);
  advance(state, seconds);
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
