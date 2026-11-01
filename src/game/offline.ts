import { advance, autoRecycleDue, autoSortDue, recycle, resort, runScripts, scriptOwned, type GameState } from './state';
import { SCRIPTS } from './scripts';

export interface OfflineActivity { purchases: number; recycles: number; resorts: number }
const reports = new WeakMap<GameState, OfflineActivity>();
export const offlineActivity = (state: GameState): OfflineActivity => reports.get(state) ?? { purchases: 0, recycles: 0, resorts: 0 };

/** Fixed elapsed-time bands, independent of rendering. Long absences are an approximation. */
export function offlineStep(elapsed: number): number {
  return elapsed < 600 ? 1 : elapsed < 3600 ? 5 : elapsed < 86400 ? 30 : 300;
}

/** Runs purchased automation with the same switches and reset conditions as the open game. */
export function simulateOffline(state: GameState, seconds: number): void {
  const activity: OfflineActivity = { purchases: 0, recycles: 0, resorts: 0 };
  reports.set(state, activity);
  if (seconds <= 0) return;
  if (!SCRIPTS.some(script => scriptOwned(state, script.id))) {
    advance(state, seconds, true);
    return;
  }
  for (let elapsed = 0; elapsed < seconds;) {
    const dt = Math.min(offlineStep(elapsed), seconds - elapsed);
    advance(state, dt, true, dt);
    const notes = runScripts(state, dt);
    activity.purchases += notes.filter(note => note.script !== 'light').length;
    // Match main.ts: a recycle is considered before a resort. Reforms stay manual.
    if (autoRecycleDue(state) && recycle(state).gt(0)) activity.recycles++;
    if (autoSortDue(state) && resort(state).gt(0)) activity.resorts++;
    elapsed += dt;
  }
}
