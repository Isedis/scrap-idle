import { canEnterHorizon, gateReady, HALLS } from '../game/horizon';
import { D, format } from '../game/num';
import { PRODUCERS } from '../game/producers';
import { RECYCLE_AT } from '../game/layers';
import { SORT_AT, sortNeed } from '../game/sorting';
import { CITY_OPEN_SORTS, REFORM_SORTS, DISTRICTS, canAnnex } from '../game/city';
import { ABOVE_SCRIPTS, AUTO_OPEN, CONTAINERS, EPOCHS, TOOLS, autoOpens, canOpen, meltCost, toolCost, umeOpen, EQUIPMENT, borerCost, depthTarget, objectReady } from '../game/bottom';
import { scriptById } from '../game/scripts';
import { canDescend, canRecycle, canResort, canReform, currentGain, resortGain, reformGainOf, type GameState } from '../game/state';

export interface Goal { text: string; tab: 'dump' | 'recycle'; layer: 'recycle' | 'sorting' | 'city' | 'bottom' | 'horizon'; ready?: boolean; focus?: 'ume' }
/** A reachable next step, using the same thresholds as the simulation. */
export function nextGoal(s: GameState): Goal {
  const goal = (text: string, layer: Goal['layer'] = 'recycle', tab: Goal['tab'] = 'recycle'): Goal => ({ text, layer, tab });
  if (s.horizon.open && s.horizon.opened < 5) {
    if (gateReady(s.horizon) && s.bottom.ume.lt(1)) {
      const canMelt = s.bottom.money.anomaly.gte(meltCost(s.bottom, 'anomaly'));
      return { ...goal(canMelt ? 'Для затвора: переплавьте аномалии в УМЕ в шахте' : 'Для затвора: добудьте аномалии на жиле в шахте, затем переплавьте в УМЕ', 'bottom'), ready: canMelt, focus: 'ume' };
    }
    return goal(gateReady(s.horizon) ? 'Горизонт: затвор готов к открытию' : 'Горизонт: сборка — '+HALLS[s.horizon.opened].name, 'horizon');
  }
  if (!s.horizon.open && canEnterHorizon(s.bottom)) return goal('Под шахтой обнаружен металлический стык', 'horizon');
  if (s.bottom.open) return bottomGoal(s);
  if (canDescend(s)) return { ...goal('Яма открыта: можно спуститься', 'city'), ready: true };
  if (s.city.open && DISTRICTS.some((d) => canAnnex(s.city, d.id))) {
    return { ...goal('Город: хватает гектаров на новый квартал', 'city'), ready: true };
  }
  if (canReform(s)) return { ...goal(`Реформа доступна: +${format(reformGainOf(s))} га`, 'city'), ready: true };
  if (canResort(s)) return { ...goal(`Пересортировка доступна: +${format(resortGain(s))} фракций`, 'sorting'), ready: true };
  if (s.sorting.open) {
    const target = s.city.open ? REFORM_SORTS : CITY_OPEN_SORTS;
    return goal(`До ${s.city.open ? 'реформы' : 'города'}: ещё ${Math.max(0, target - s.sorting.sorts)} пересорт. · следующая: ${format(s.recycle.total)} / ${format(sortNeed(s.sorting.sorts))} ВС`, 'sorting');
  }
  if (canRecycle(s)) return { ...goal(`Переработка доступна: +${format(currentGain(s))} ВС`), ready: true };
  if (s.recycle.resets > 0) return goal(`До сортировки: ${format(s.recycle.total)} / ${format(SORT_AT)} ВС за цикл`);
  if (s.runTrash.gte(RECYCLE_AT.div(100))) return goal(`До переработки: ещё ${format(RECYCLE_AT.sub(s.runTrash).max(0))} кг за заход`);
  const next = PRODUCERS.find(x => !s.revealed.includes(x.id));
  return goal(next ? `Следующий производитель: ещё ${format(next.baseCost.div(2).sub(s.runTrash).max(0))} кг за заход` : 'Развивайте производство для первой переработки', 'recycle', 'dump');
}

/** Bottom guidance follows actions the player can actually take, ignoring automated openings. */
function bottomGoal(s: GameState): Goal {
  const b = s.bottom;
  const goal = (text: string, ready = false): Goal => ({ text, ready, tab: 'recycle', layer: 'bottom' });
  if (b.firstUmeGranted && b.equipment.borer === 0 && !objectReady(b, 'borer')) return goal('Дно: первая УМЕ найдена · раскопайте корпус проходчика');
  if (b.firstUmeGranted && b.equipment.borer === 0 && b.ume.eq(0) && umeOpen(b) && b.money.anomaly.gte(meltCost(b, 'anomaly'))) return goal('Дно: можно переплавить аномалии в УМЕ', true);
  if (b.firstUmeGranted && umeOpen(b) && b.ume.gte(borerCost(b)) && (b.equipment.borer > 0 || objectReady(b, 'borer'))) return goal('Дно: можно улучшить проходчик за УМЕ', true);
  const equipment = EQUIPMENT.find((e) => !b.equipment[e.id] && objectReady(b, e.id) && b.money[e.costIn].gte(e.cost));
  if (equipment) return goal(`Дно: доступно оборудование «${equipment.name}»`, true);
  const auto = AUTO_OPEN[b.auto];
  if (auto && b.money[auto.costIn].gte(auto.cost)) return goal('Дно: доступно автовскрытие', true);
  const script = ABOVE_SCRIPTS.find((sc) => !b.scripts.includes(sc.id) && b.money[sc.costIn].gte(sc.cost));
  if (script) return goal(`Дно: можно установить «${scriptById(script.id)!.title}» навсегда`, true);
  const automatic = autoOpens(b);
  const manual = CONTAINERS.filter((c) => !automatic.includes(c.id) && canOpen(b, c.id));
  if (manual.length) {
    const n = manual.reduce((sum, c) => sum + b.stock[c.id], 0);
    return goal(`Дно: тара к вскрытию — ${format(D(n))}`, true);
  }
  const tool = TOOLS.find((t) => b.tools[t.id] < t.max && b.money[t.costIn].gte(toolCost(t, b.tools[t.id])));
  if (tool) return goal(`Дно: можно улучшить «${tool.name}»`, true);
  const epoch = EPOCHS.find((e) => b.dug < e.depth);
  if (epoch) return goal(`Дно: до нового слоя ещё ${format(D(Math.ceil(epoch.depth - b.dug)))} т`);
  return goal(b.equipment.borer === 0 ? 'Дно: продолжайте раскопки проходчика' : `Дно: следующий пласт на ${format(D(depthTarget(b).to))} т · добыча находок +10%`);
}
