import {
  FRACS, FRAC_NAMES, RECIPES, STATIONS, canBuyRecipe, fracMult, hasRecipe, levelsOf,
  runLine, slotCount, stationOpen, type Frac, type RecipeDef, type SortingState, type StationId,
} from './sorting';

const priceSum = (r: RecipeDef) => Object.values(r.cost).reduce((sum, n) => sum + (n ?? 0), 0);
const pendingRecipes = (s: SortingState, covered: readonly string[]) => RECIPES.filter((r) =>
  !hasRecipe(s, r.id) && !covered.includes(r.id) && (!r.requires || hasRecipe(s, r.requires) || covered.includes(r.requires)));

/** Reach four collectors early instead of permanently starving one of the materials. */
export function lineRecipe(s: SortingState, covered: readonly string[] = []): RecipeDef | undefined {
  return pendingRecipes(s, covered).sort((a, b) => {
    const priority = (r: RecipeDef) => slotCount(s) < 4 && ['l1', 'l2', 'l3'].includes(r.id) ? 0 : 1;
    return priority(a) - priority(b) || priceSum(a) - priceSum(b);
  })[0];
}

/** A modest working batch, scaled to upcoming purchases, including not-yet-open recipes. */
export function stockTargets(s: SortingState, covered: readonly string[] = []): Record<Frac, number> {
  return Object.fromEntries(FRACS.map((f) => {
    const prices = RECIPES.filter((r) => !hasRecipe(s, r.id) && !covered.includes(r.id) && (r.cost[f] ?? 0) > 0)
      .map((r) => r.cost[f]!);
    return [f, prices.length ? Math.max(5, Math.min(25, Math.ceil(Math.min(...prices) * 0.05))) : 10];
  })) as Record<Frac, number>;
}

/** Levels may spend surplus, never the next recipe's ingredients or the working stock. */
export function lineReserves(s: SortingState, covered: readonly string[] = []): Record<Frac, number> {
  const target = lineRecipe(s, covered);
  const stock = stockTargets(s, covered);
  return Object.fromEntries(FRACS.map((f) => [f, Math.max(stock[f], target?.cost[f] ?? 0)])) as Record<Frac, number>;
}

interface Batch { refilling: Set<Frac>; selected: Frac[] }
const batches = new WeakMap<SortingState, Batch>();
const plans = new WeakMap<SortingState, { key: string; line: readonly StationId[] }>();

/** Refill starts below 25%, finishes at 100%; materials, rather than a timer, drive swaps. */
function goals(s: SortingState, covered: readonly string[]) {
  const target = lineRecipe(s, covered);
  const stock = stockTargets(s, covered);
  let batch = batches.get(s);
  if (!batch) { batch = { refilling: new Set(), selected: [] }; batches.set(s, batch); }
  for (const f of FRACS) {
    if (s.fractions[f].gte(stock[f])) batch.refilling.delete(f);
    else if (s.fractions[f].lt(stock[f] * 0.25)) batch.refilling.add(f);
  }
  const recipeNeeds = FRACS.filter((f) => s.fractions[f].lt(target?.cost[f] ?? 0));
  const pending = [...batch.refilling].sort((a, b) => Number(recipeNeeds.includes(b)) - Number(recipeNeeds.includes(a)));
  const primary = pending.length ? pending : recipeNeeds;
  const slots = Math.min(4, slotCount(s));
  // Continue unfinished collectors before assigning the next batch; no per-tick oscillation.
  const selected = batch.selected.filter((f) => primary.includes(f)).slice(0, slots);
  for (const f of primary) if (selected.length < slots && !selected.includes(f)) selected.push(f);
  for (const f of batch.selected) if (selected.length < slots && !selected.includes(f)) selected.push(f);
  for (const f of FRACS) if (selected.length < slots && !selected.includes(f)) selected.push(f);
  batch.selected = slotCount(s) >= 4 ? [...FRACS] : selected;
  const need = FRACS.map((f) => primary.includes(f) ? pending.length ? stock[f] : target?.cost[f] ?? 0 : 0);
  return { target, stock, batch, need, pending };
}

/** One explanation for the line view and the global advice. No manual placement needed. */
export function linePlanText(s: SortingState, covered: readonly string[] = []): string {
  const { target, batch, pending } = goals(s, covered);
  const active = batch.selected.filter((f) => pending.includes(f));
  if (active.length) return `Наладчик пополняет запас: ${active.map((f) => FRAC_NAMES[f].toLowerCase()).join(', ')}.`
    + (pending.some((f) => !active.includes(f)) ? ` Затем: ${pending.filter((f) => !active.includes(f)).map((f) => FRAC_NAMES[f].toLowerCase()).join(', ')}.` : '')
    + (target ? ` Дальше — «${target.name}».` : '');
  if (target) return `Наладчик копит фракции на «${target.name}».`
    + (slotCount(s) >= 4 ? ' Все четыре фракции собираются постоянно.' : ' Станции переключаются автоматически.');
  return 'Наладчик собирает все четыре фракции, улучшает линию и покупает сплавы.';
}

/** Collectors always precede support stations; four slots guarantee four material streams. */
export function planLine(s: SortingState, covered: readonly string[] = []): readonly StationId[] {
  const { batch, need } = goals(s, covered);
  const available = STATIONS.filter((d) => stationOpen(s, d));
  const collectors = available.filter((d) => d.frac && batch.selected.includes(d.frac)).map((d) => d.id);
  const multipliers = FRACS.map((f) => fracMult(s, f));
  const slots = slotCount(s);
  const key = JSON.stringify([slots, collectors, available.map((d) => [d.id, levelsOf(s, d.id)]), need, multipliers]);
  const cached = plans.get(s);
  if (cached?.key === key) return cached.line;
  const supports = available.filter((d) => !d.frac).map((d) => d.id);
  const required = need.map((n, i) => n > 0 && batch.selected.includes(FRACS[i]) ? i : -1).filter((i) => i >= 0);
  let best: StationId[] = [];
  let bestScore = [-1, -1, -1];
  const consider = (collectors: StationId[]) => {
    for (let mask = 0; mask < 1 << supports.length; mask++) {
      const line = [...collectors, ...supports.filter((_, i) => mask & (1 << i))];
      if (line.length > slots) continue;
      const result = runLine(line, s.levels);
      const output = FRACS.map((f, i) => result.caught[f] * multipliers[i]);
      const total = output.reduce((sum, n) => sum + n, 0);
      const score = [required.length ? Math.min(...required.map((i) => output[i] / need[i])) : total, total, -result.tails];
      for (let i = 0; i < score.length; i++) {
        const delta = score[i] - bestScore[i];
        if (Math.abs(delta) < 1e-12) continue;
        if (delta > 0) { best = line; bestScore = score; }
        break;
      }
    }
  };
  const visit = (prefix: StationId[], remaining: StationId[]) => {
    if (!remaining.length) { consider(prefix); return; }
    for (const id of remaining) visit([...prefix, id], remaining.filter((other) => other !== id));
  };
  visit([], collectors);
  plans.set(s, { key, line: best });
  return best;
}

export function assembleLine(s: SortingState, covered: readonly string[] = []): boolean {
  if (!s.open) return false;
  const line = planLine(s, covered);
  if (line.length === s.line.length && line.every((id, i) => id === s.line[i])) return false;
  s.line = [...line];
  return true;
}

export const affordableLineRecipes = (s: SortingState, covered: readonly string[] = []) => RECIPES.filter((r) => canBuyRecipe(s, r, covered))
  .sort((a, b) => priceSum(a) - priceSum(b));
