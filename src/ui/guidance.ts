import { format } from '../game/num';
import { PRODUCERS } from '../game/producers';
import { RECYCLE_AT } from '../game/layers';
import { SORT_AT, sortNeed } from '../game/sorting';
import { CITY_OPEN_SORTS, REFORM_SORTS } from '../game/city';
import { canRecycle, canResort, canReform, currentGain, resortGain, reformGainOf, type GameState } from '../game/state';

export interface Goal { text: string; tab: 'dump' | 'recycle'; layer: 'recycle' | 'sorting' | 'city' }
/** A reachable next step, using the same thresholds as the simulation. */
export function nextGoal(s: GameState): Goal {
  const goal = (text: string, layer: Goal['layer'] = 'recycle', tab: Goal['tab'] = 'recycle'): Goal => ({ text, layer, tab });
  if (canReform(s)) return goal(`Реформа доступна: +${format(reformGainOf(s))} га`, 'city');
  if (canResort(s)) return goal(`Пересортировка доступна: +${format(resortGain(s))} фракций`, 'sorting');
  if (s.sorting.open) {
    const target = s.city.open ? REFORM_SORTS : CITY_OPEN_SORTS;
    return goal(`До ${s.city.open ? 'реформы' : 'города'}: ещё ${Math.max(0, target - s.sorting.sorts)} пересорт. · следующая: ${format(s.recycle.total)} / ${format(sortNeed(s.sorting.sorts))} ВС`, 'sorting');
  }
  if (canRecycle(s)) return goal(`Переработка доступна: +${format(currentGain(s))} ВС`);
  if (s.recycle.resets > 0) return goal(`До сортировки: ${format(s.recycle.total)} / ${format(SORT_AT)} ВС за цикл`);
  if (s.runTrash.gte(RECYCLE_AT.div(100))) return goal(`До переработки: ещё ${format(RECYCLE_AT.sub(s.runTrash).max(0))} кг за заход`);
  const next = PRODUCERS.find(x => !s.revealed.includes(x.id));
  return goal(next ? `Следующий производитель: ещё ${format(next.baseCost.div(2).sub(s.runTrash).max(0))} кг за заход` : 'Развивайте производство для первой переработки', 'recycle', 'dump');
}
