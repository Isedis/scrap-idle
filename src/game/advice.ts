import { D, format } from './num';
import { NODES, RECYCLE_AT, canBuyNode, hasNode, isNodeOpen } from './layers';
import {
  FRACS,
  FRAC_NAMES,
  FRAC_SHORT,
  RECIPES,
  SORT_AT,
  STATIONS,
  canBuyRecipe,
  hasRecipe,
  runLine,
  slotCount,
  sortNeed,
  tailsOf,
  type Price,
} from './sorting';
import { autoRecycleAt, autoRecycleDue, canRecycle, canResort, currentGain, resortGain, scriptOwned, type GameState } from './state';

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
    if (state.autoRecycle.on && scriptOwned(state, 'recycle')) {
      if (autoRecycleDue(state)) return 'Автопереработчик готов сдать этот заход.';
      switch (state.scripts.recycleMode) {
        case 'gain': return `Автоматика ждёт +${format(autoRecycleAt(state))} ВС или снижения отдачи за секунду.`;
        case 'time': return `Автоматика сдаст заход, когда он продлится ${state.scripts.recycleMinutes} мин.`;
        case 'peak': return 'Автоматика ждёт снижения отдачи вторсырья за секунду захода.';
      }
    }
    return `Переработка даст +${format(gain)} вторсырья. Начнётся новый заход; вторсырьё и дерево останутся.`;
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
  if (canResort(state)) return `Можно пересортировать: +${format(resortGain(state))} фракций и доход ×2 до реформы.`;
  if (tailsOf(so) > 0.5) return `Больше половины мусора уходит обратно в кучу — прокачай станциям «Быстрее».`;
  const next = RECIPES.filter((r) => !hasRecipe(so, r.id) && (!r.requires || hasRecipe(so, r.requires)))
    .map((r) => ({ r, gap: missing(state, r.cost) }))
    .filter((x) => x.gap)[0];
  if (next) {
    // A fraction no station catches never comes in by itself: say which station to put on.
    const caught = runLine(so.line.slice(0, slotCount(so)), so.levels).caught;
    const uncaught = FRACS.find((f) => (next.r.cost[f] ?? 0) > 0 && so.fractions[f].lt(next.r.cost[f]!) && caught[f] === 0);
    if (uncaught) {
      const station = STATIONS.find((st) => st.frac === uncaught)!;
      return `Для «${next.r.name}» нужен ${FRAC_NAMES[uncaught].toLowerCase()}, а его никто не ловит — поставь «${station.name}» на ленту (можно вместо другой станции).`;
    }
    return `Копи на рецепт «${next.r.name}»: не хватает ${next.gap}.`;
  }
  const need = sortNeed(so.sorts);
  return `До пересортировки: ${format(state.recycle.total)} из ${format(need)} вторсырья за цикл.`;
}
