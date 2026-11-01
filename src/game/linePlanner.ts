import {
  FRACS, RECIPES, STATIONS, canBuyRecipe, fracMult, hasRecipe, levelsOf,
  runLine, slotCount, stationOpen, type RecipeDef, type SortingState, type StationId,
} from './sorting';

const priceSum = (r: RecipeDef) => Object.values(r.cost).reduce((sum, n) => sum + (n ?? 0), 0);

/** Match the fitter's recipe priority; its ingredients must not all go into station levels. */
export function lineRecipe(s: SortingState): RecipeDef | undefined {
  return RECIPES.filter((r) => !hasRecipe(s, r.id) && (!r.requires || hasRecipe(s, r.requires)))
    .sort((a, b) => priceSum(a) - priceSum(b))[0];
}

const plans = new WeakMap<SortingState, { key: string; line: readonly StationId[] }>();

/**
 * Build for the next recipe's missing fractions, then for overall output. A press belongs
 * after the collectors and a crusher last: neither benefits a collector downstream.
 * Only collector permutations need searching (at most 24 per subset). Resource deficits
 * are bucketed in tenths, so each incoming grain does not trigger another search.
 */
export function planLine(s: SortingState): readonly StationId[] {
  const target = lineRecipe(s);
  const need = FRACS.map((f) => {
    const price = target?.cost[f] ?? 0;
    const gap = s.fractions[f].lt(price) ? s.fractions[f].neg().add(price).toNumber() : 0;
    const step = Math.max(1, price / 10);
    return Math.ceil(gap / step) * step;
  });
  const available = STATIONS.filter((d) => stationOpen(s, d));
  const multipliers = FRACS.map((f) => fracMult(s, f));
  const slots = slotCount(s);
  const key = JSON.stringify([slots, available.map((d) => [d.id, levelsOf(s, d.id)]), need, multipliers]);
  const cached = plans.get(s);
  if (cached?.key === key) return cached.line;

  let best: StationId[] = [];
  let bestScore = [-1, -1, -1, -1];
  const required = need.map((n, i) => n > 0 ? i : -1).filter((i) => i >= 0);
  const supports = available.filter((d) => !d.frac).map((d) => d.id);
  const consider = (collectors: StationId[]) => {
    for (let mask = 0; mask < 1 << supports.length; mask++) {
      const line = [...collectors, ...supports.filter((_, i) => mask & (1 << i))];
      if (!line.length || line.length > slots) continue;
      const result = runLine(line, s.levels);
      const output = FRACS.map((f, i) => result.caught[f] * multipliers[i]);
      const total = output.reduce((sum, n) => sum + n, 0);
      const score = [
        required.filter((i) => output[i] > 0).length,
        required.length ? Math.min(...required.map((i) => output[i] / need[i])) : total,
        total,
        -result.tails,
      ];
      for (let i = 0; i < score.length; i++) {
        const delta = score[i] - bestScore[i];
        if (Math.abs(delta) < 1e-12) continue;
        if (delta > 0) { best = line; bestScore = score; }
        break;
      }
    }
  };
  const visit = (prefix: StationId[], remaining: StationId[]) => {
    consider(prefix);
    if (prefix.length >= slots) return;
    for (const id of remaining) visit([...prefix, id], remaining.filter((other) => other !== id));
  };
  visit([], available.filter((d) => d.frac).map((d) => d.id));
  plans.set(s, { key, line: best });
  return best;
}

/** True when construction changed the belt; station levels and currencies are untouched. */
export function assembleLine(s: SortingState): boolean {
  if (!s.open) return false;
  const line = planLine(s);
  if (line.length === s.line.length && line.every((id, i) => id === s.line[i])) return false;
  s.line = [...line];
  return true;
}

/** An affordable recipe should be bought before spending its ingredients elsewhere. */
export const affordableLineRecipes = (s: SortingState) => RECIPES.filter((r) => canBuyRecipe(s, r))
  .sort((a, b) => priceSum(a) - priceSum(b));
