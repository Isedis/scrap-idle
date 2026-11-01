import { advance, autoRecycleDue, autoSortDue, recycle, resort, runScripts, scriptOwned, type GameState } from './state';
import { D, type Decimal } from './num';
import { FRACS } from './sorting';
import { SCRIPTS } from './scripts';

export interface OfflineActivity {
  purchases: number; recycles: number; resorts: number;
  producers: number; upgrades: number;
  recycled: Decimal; spentTrash: Decimal; spentRecycled: Decimal; spentFractions: Decimal;
}
const emptyActivity = (): OfflineActivity => ({ purchases: 0, recycles: 0, resorts: 0, producers: 0, upgrades: 0,
  recycled: D(0), spentTrash: D(0), spentRecycled: D(0), spentFractions: D(0) });
const units = (state: GameState) => Object.values(state.owned).reduce((sum, n) => sum + n, 0);
const fractions = (state: GameState) => FRACS.reduce((sum, f) => sum.add(state.sorting.fractions[f]), D(0));
const reports = new WeakMap<GameState, OfflineActivity>();
export const offlineActivity = (state: GameState): OfflineActivity => reports.get(state) ?? emptyActivity();

/** Fixed elapsed-time bands, independent of rendering. Long absences are an approximation. */
export function offlineStep(elapsed: number): number {
  return elapsed < 600 ? 1 : elapsed < 3600 ? 5 : elapsed < 86400 ? 30 : 300;
}

/** Runs purchased automation with the same switches and reset conditions as the open game. */
export function simulateOffline(state: GameState, seconds: number): void {
  const activity = emptyActivity();
  reports.set(state, activity);
  if (seconds <= 0) return;
  if (!SCRIPTS.some(script => scriptOwned(state, script.id))) {
    advance(state, seconds, true);
    return;
  }
  for (let elapsed = 0; elapsed < seconds;) {
    const dt = Math.min(offlineStep(elapsed), seconds - elapsed);
    advance(state, dt, true, dt);
    const before = { trash: state.trash, recycled: state.recycle.points, fractions: fractions(state), units: units(state), upgrades: state.upgrades.length };
    const notes = runScripts(state, dt);
    activity.producers += Math.max(0, units(state) - before.units);
    activity.upgrades += Math.max(0, state.upgrades.length - before.upgrades);
    activity.spentTrash = activity.spentTrash.add(before.trash.sub(state.trash).max(0));
    activity.spentRecycled = activity.spentRecycled.add(before.recycled.sub(state.recycle.points).max(0));
    activity.spentFractions = activity.spentFractions.add(before.fractions.sub(fractions(state)).max(0));
    activity.purchases += notes.filter(note => note.script !== 'light').length;
    // Match main.ts: a recycle is considered before a resort. Reforms stay manual.
    if (autoRecycleDue(state)) {
      const gain = recycle(state);
      if (gain.gt(0)) { activity.recycles++; activity.recycled = activity.recycled.add(gain); }
    }
    if (autoSortDue(state) && resort(state).gt(0)) activity.resorts++;
    elapsed += dt;
  }
}
