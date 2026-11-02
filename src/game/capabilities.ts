import { cityEffects, schoolScripts } from './city';
import { RELIABILITY_MAX } from './scripts';
import type { GameState } from './state';

/** Independent grants: tree ownership must not count as its own replacement. */
export function externalScriptSource(state: GameState, id: string): string | undefined {
  if (state.bottom.scripts.includes(id)) return 'Постоянный скрипт дна';
  if (schoolScripts(cityEffects(state.city).schools).includes(id)) return 'Школа города';
}

/** Cover only effects that are completely replaced; partial bonuses remain useful. */
export function nodeSources(state: GameState): Record<string, string> {
  const out: Record<string, string> = {};
  const producers = externalScriptSource(state, 'producers');
  const recycle = externalScriptSource(state, 'recycle');
  const schools = cityEffects(state.city).schools;
  if (producers) out.a1 = producers;
  if (recycle) out.a3 = recycle;
  if (state.scripts.reliability >= RELIABILITY_MAX
    && (externalScriptSource(state, 'light') || state.scripts.bought.includes('light'))) {
    out.t4 = 'Автопрожектор без отказов';
  }
  if (schools || state.recycle.nodes.includes('a5')) {
    const source = schools ? 'Школа города' : 'Диспетчер';
    out.a2 = source;
    out.a4 = source;
    if (schools) out.a5 = source;
  }
  return out;
}

export const coveredNodes = (state: GameState) => Object.keys(nodeSources(state));
export const recipeSources = (state: GameState): Record<string, string> => {
  const source = externalScriptSource(state, 'sort');
  return source ? { a1: source } : {};
};
export const coveredRecipes = (state: GameState) => Object.keys(recipeSources(state));
