import { D, Decimal } from './num';
import type { BottomState } from './bottom';
import { streetsOwned, type CityState } from './city';

export type Machine = 'transport' | 'processing' | 'assembly';
export type BuildMode = 'growth' | 'balance' | 'assembly';
export interface HallNode { name: string; purpose: string; share: number; needs: number[] }
export interface Hall { name: string; reward: string; nodes: HallNode[] }
const node = (name: string, purpose: string, share: number, needs: number[] = []): HallNode => ({ name, purpose, share, needs });
export const HALLS: readonly Hall[] = [
  { name: 'Сервисный затвор', reward: 'Выпуск ×2 · снабжение шахты 9 т/мин', nodes: [
    node('Основание', 'Держит направляющую обеих створок', 1/7), node('Левый привод', 'Соединяет тягу с левой створкой', 2/7, [0]),
    node('Правый привод', 'Приводит правую створку в движение', 5/14, [0]), node('Магистраль', 'Передаёт импульс УМЕ обоим приводам', 3/14, [0])] },
  { name: 'Подъёмный зал', reward: 'Выпуск ×2 · две монтажные цели', nodes: [
    node('Нижняя опора', 'Несёт подъёмную платформу', .2), node('Платформа', 'Поднимает монтаж к верхнему затвору', .3, [0]),
    node('Силовая линия', 'Питает верхний привод', .2, [0]), node('Верхняя тяга', 'Соединяет платформу и створ', .3, [1])] },
  { name: 'Распределительный зал', reward: 'Выпуск ×2 · диспетчер зависимостей', nodes: [
    node('Общая шина', 'Соединяет две стороны зала', .2), node('Левый участок', 'Подводит тягу к боковой створке', .3, [0]),
    node('Правый участок', 'Замыкает второй контур привода', .3, [0]), node('Замыкатель', 'Объединяет обе готовые ветви', .2, [1, 2])] },
  { name: 'Поворотный зал', reward: 'Выпуск ×2 · монтаж ×1,25', nodes: [
    node('Опорное кольцо', 'Удерживает поворотную платформу', .2), node('Поворотная платформа', 'Разворачивает механизм к выходу', .3, [0]),
    node('Боковой привод', 'Вращает платформу по направляющей', .3, [0]), node('Стопор', 'Фиксирует собранный механизм', .2, [1, 2])] },
  { name: 'Главный створ', reward: 'Выпуск ×2 · обзор системы сопряжения', nodes: [
    node('Основание', 'Держит две несущие рамы', .15), node('Левая рама', 'Несёт левую половину большого створа', .25, [0]),
    node('Правая рама', 'Несёт правую половину большого створа', .25, [0]), node('Общая направляющая', 'Соединяет обе рамы', .2, [1, 2]),
    node('Сопрягающий узел', 'Передаёт импульс главному створу', .15, [3])] },
];
export interface HorizonState {
  open: boolean; points: Decimal; total: Decimal; opened: number;
  levels: Record<Machine, number>; work: Decimal[];
  mode: BuildMode; autoBuild: boolean; autoBuy: boolean; smart: boolean;
  selected: number; pinned: boolean; reserveUme: boolean; clock: number;
  nextPurchase: Machine | null; connections: { frame: boolean; conductor: boolean };
}
export const newHorizon = (): HorizonState => ({ open: false, points: D(0), total: D(0), opened: 0,
  levels: { transport: 0, processing: 0, assembly: 0 }, work: HALLS[0].nodes.map(() => D(0)),
  mode: 'balance', autoBuild: true, autoBuy: false, smart: false, selected: 0, pinned: false,
  reserveUme: true, clock: 0, nextPurchase: null, connections: { frame: false, conductor: false } });
export const canEnterHorizon = (b: BottomState) => b.open && b.dug >= 22000 && b.equipment.borer > 0 && b.umeMade.gte(1);
export function enterHorizon(h: HorizonState, b: BottomState): boolean {
  if (h.open || !canEnterHorizon(b)) return false;
  h.open = true; h.points = h.points.add(20); return true;
}
export const hallCost = (h: HorizonState) => D(280).mul(Decimal.pow(8, h.opened));
export const nodeCost = (h: HorizonState, i: number) => hallCost(h).mul(HALLS[h.opened]?.nodes[i]?.share ?? 0);
export const nodeDone = (h: HorizonState, i: number) => !!HALLS[h.opened]?.nodes[i] && h.work[i].gte(nodeCost(h, i).mul(1 - 1e-12));
export const nodeAvailable = (h: HorizonState, i: number) => !!HALLS[h.opened]?.nodes[i] && !nodeDone(h, i) && HALLS[h.opened].nodes[i].needs.every(n => nodeDone(h, n));
export const gateReady = (h: HorizonState) => h.open && h.opened < 5 && HALLS[h.opened].nodes.every((_, i) => nodeDone(h, i));
export const umeReserved = (h: HorizonState) => h.open && h.opened < 5 && h.reserveUme ? 1 : 0;
export function openGate(h: HorizonState, b: BottomState): boolean {
  if (!gateReady(h) || b.ume.lt(1)) return false;
  b.ume = b.ume.sub(1); h.opened++;
  b.supplyExtension = true;
  h.work = (HALLS[h.opened]?.nodes ?? []).map(() => D(0)); h.selected = 0; h.pinned = false;
  return true;
}
export function horizonRates(h: HorizonState, city: CityState) {
  const multiplier = Decimal.pow(2, h.opened);
  const transport = D(4).mul(Decimal.pow(1.5, h.levels.transport)).mul(multiplier).mul(streetsOwned(city) >= 10 ? 1.1 : 1);
  const processing = D(4).mul(Decimal.pow(1.5, h.levels.processing)).mul(multiplier).mul(h.connections.conductor ? 1.1 : 1);
  const assembly = D(12).mul(Decimal.pow(1.5, h.levels.assembly)).mul(h.opened >= 4 ? 1.25 : 1).mul(h.connections.frame ? 1.1 : 1);
  return { transport, processing, assembly, production: transport.min(processing) };
}
export const machineCost = (h: HorizonState, id: Machine) => D(id === 'transport' ? 20 : id === 'processing' ? 30 : 25).mul(Decimal.pow(1.8, h.levels[id])).ceil();
const canAfford = (balance: Decimal, cost: Decimal) => balance.gte(cost.mul(1 - 1e-12));
export function buyMachine(h: HorizonState, id: Machine): boolean {
  const cost = machineCost(h, id);
  if (!h.open || !canAfford(h.points, cost) || !Number.isSafeInteger(h.levels[id] + 1)) return false;
  h.points = h.points.sub(cost).max(0); h.levels[id]++; if (h.nextPurchase === id) h.nextPurchase = null;
  return true;
}
export function connectHorizon(h: HorizonState, b: BottomState, id: 'frame' | 'conductor'): boolean {
  const currency = id === 'frame' ? 'scrap' : 'nonferrous'; const price = id === 'frame' ? 100 : 40;
  if (!h.open || h.connections[id] || b.money[currency].lt(price)) return false;
  b.money[currency] = b.money[currency].sub(price); h.connections[id] = true; return true;
}
export function buildTargets(h: HorizonState): number[] {
  if (h.pinned || !h.autoBuild) return nodeAvailable(h, h.selected) ? [h.selected] : [];
  const ids = (HALLS[h.opened]?.nodes ?? []).map((_, i) => i).filter(i => nodeAvailable(h, i));
  if (h.smart && h.opened >= 3) ids.sort((a, b) => {
    const children = (id: number) => HALLS[h.opened].nodes.filter(n => n.needs.includes(id)).length;
    return children(b) - children(a) || nodeCost(h, a).sub(h.work[a]).cmp(nodeCost(h, b).sub(h.work[b])) || a - b;
  });
  else if (ids.includes(h.selected)) ids.sort((a, b) => Number(b === h.selected) - Number(a === h.selected) || a - b);
  return ids.slice(0, h.opened >= 2 ? 2 : 1);
}
function autoPurchase(h: HorizonState, city: CityState): void {
  if (!h.autoBuy) return;
  if (h.nextPurchase) { buyMachine(h, h.nextPurchase); return; }
  const r = horizonRates(h, city); const ids: Machine[] = [];
  if (r.transport.lte(r.processing)) ids.push('transport');
  if (r.processing.lte(r.transport)) ids.push('processing');
  if (h.mode !== 'growth' && r.assembly.lt(r.production.mul(h.mode === 'balance' ? .5 : 1))) ids.push('assembly');
  ids.sort((a, b) => machineCost(h, a).cmp(machineCost(h, b)));
  const id = ids.find(id => canAfford(h.points, machineCost(h, id))); if (id) buyMachine(h, id);
}
/** Split at node completion and fixed purchase clocks, independent of render frequency. */
export function horizonTick(h: HorizonState, seconds: number, city: CityState): void {
  if (!h.open || !Number.isFinite(seconds) || seconds <= 0) return;
  let remaining = seconds;
  while (remaining > 1e-8) {
    const r = horizonRates(h, city); const targets = h.mode === 'growth' ? [] : buildTargets(h);
    let flow = h.mode === 'balance' ? r.production.mul(.5).min(r.assembly) : r.assembly;
    if (h.mode === 'assembly' && h.points.lte(1e-10)) flow = flow.min(r.production);
    let dt = Math.min(remaining, 60 - h.clock);
    if (targets.length && flow.gt(0)) {
      for (const id of targets) dt = Math.min(dt, nodeCost(h, id).sub(h.work[id]).mul(targets.length).div(flow).mul(60).toNumber());
      if (flow.gt(r.production) && h.points.gt(1e-10)) dt = Math.min(dt, h.points.div(flow.sub(r.production)).mul(60).toNumber());
    }
    if (dt < 1e-9) {
      for (const id of targets) if (nodeCost(h, id).sub(h.work[id]).lt(1e-8)) h.work[id] = nodeCost(h, id);
      dt = Math.min(remaining, 1e-7);
    }
    const gained = r.production.mul(dt / 60); let spent = D(0);
    for (const id of targets) {
      const work = flow.mul(dt / 60 / targets.length).min(nodeCost(h, id).sub(h.work[id]));
      h.work[id] = h.work[id].add(work); spent = spent.add(work);
      if (nodeCost(h, id).sub(h.work[id]).lte(nodeCost(h, id).mul(1e-12))) h.work[id] = nodeCost(h, id);
    }
    h.points = h.points.add(gained).sub(spent).max(0); h.total = h.total.add(gained);
    h.clock += dt; remaining -= dt;
    if (h.clock >= 60 - 1e-8) { h.clock = 0; autoPurchase(h, city); }
  }
}
