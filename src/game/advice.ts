import { D, format } from './num';
import { NODES, RECYCLE_AT, canBuyNode, hasNode, isNodeOpen } from './layers';
import { FRACS, FRAC_SHORT, RECIPES, SORT_AT, canBuyRecipe, hasRecipe, slotCount, sortNeed, tailsOf, type Price } from './sorting';
import { canRecycle, canResort, currentGain, resortGain, type GameState } from './state';

/**
 * One line per layer that says what to do next, in plain words. The layers have many
 * moving parts; this is what keeps a player from getting lost in them.
 */

/** What is still missing for a price, or null when it can be paid. */
function missing(state: GameState, price: Price): string | null {
  const short = FRACS.filter((f) => state.sorting.fractions[f].lt(price[f] ?? 0)).map(
    (f) => `${format(D(price[f]!).sub(state.sorting.fractions[f]).ceil())} ${FRAC_SHORT[f]}`,
  );
  return short.length ? short.join(' и ') : null;
}

export function recycleAdvice(state: GameState): string {
  const layer = state.recycle;
  if (!canRecycle(state) && layer.resets === 0) {
    return `Собери ${format(RECYCLE_AT)} кг за один заход — тогда весь мусор можно будет сдать на переработку.`;
  }
  const node = NODES.find((n) => canBuyNode(layer, n));
  if (node) return `Купи в дереве «${node.name}»: ${node.text.toLowerCase()}.`;
  if (canRecycle(state)) {
    const gain = currentGain(state);
    if (gain.gte(layer.total.max(10))) return `Пора перерабатывать: +${format(gain)} вторсырья, больше, чем у тебя было за всю игру.`;
    return `Переработка даст +${format(gain)} вторсырья. Подожди, пока награда сравняется с тем, что уже есть (${format(layer.total)}), — так выгоднее.`;
  }
  const next = NODES.filter((n) => !hasNode(layer, n.id) && isNodeOpen(layer, n)).sort((a, b) => a.cost.cmp(b.cost))[0];
  if (next) return `Копи вторсырьё на «${next.name}»: нужно ${format(next.cost)}, есть ${format(layer.points)}.`;
  return 'Дерево куплено. Перерабатывай, когда награда растёт, и копи на бесконечные узлы.';
}

export function sortingAdvice(state: GameState): string {
  const so = state.sorting;
  if (!so.open) return `Заработай ${format(SORT_AT)} вторсырья за один цикл переработки — и линия запустится.`;
  const empty = Array.from({ length: slotCount(so) }, (_, i) => so.line[i] ?? null).indexOf(null);
  if (empty >= 0) return `На ленте пустое место №${empty + 1} — поставь туда станцию.`;
  const recipe = RECIPES.find((r) => canBuyRecipe(so, r));
  if (recipe) return `Хватает на рецепт «${recipe.name}»: ${recipe.text.toLowerCase()}.`;
  if (canResort(state)) return `Можно пересортировать: +${format(resortGain(state))} фракций и весь доход ×2 навсегда.`;
  if (tailsOf(so) > 0.5) return `Больше половины мусора уходит обратно в кучу — прокачай станциям «Быстрее».`;
  const next = RECIPES.filter((r) => !hasRecipe(so, r.id) && (!r.requires || hasRecipe(so, r.requires)))
    .map((r) => ({ r, gap: missing(state, r.cost) }))
    .filter((x) => x.gap)[0];
  if (next) return `Копи на рецепт «${next.r.name}»: не хватает ${next.gap}.`;
  const need = sortNeed(so.sorts);
  return `До пересортировки: ${format(state.recycle.total)} из ${format(need)} вторсырья за цикл.`;
}
