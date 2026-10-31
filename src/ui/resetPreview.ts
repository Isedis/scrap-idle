import { deserialize, serialize } from '../game/save';
import { recycle, resort, reform, canRecycle, canResort, canReform, type GameState } from '../game/state';
import { format } from '../game/num';
import { el } from './dom';

type Kind = 'recycle' | 'sorting' | 'city';
/** Preview the real reset on a detached save; never mutate the live game. */
export function resetPreview(state: GameState, kind: Kind): string[] {
  const ready = { recycle: canRecycle, sorting: canResort, city: canReform }[kind];
  if (!ready(state)) return ['Получите: награда появится, когда сброс станет доступен.'];
  const after = deserialize(serialize(state))!;
  const gain = { recycle, sorting: resort, city: reform }[kind](after);
  return [
    `Получите: +${format(gain)} ${kind === 'city' ? 'га' : kind === 'sorting' ? 'фракций · доход ×2' : 'вторсырья'}.`,
    kind === 'city' ? 'Сбросятся: текущий заход, переработка, сортировка и настройки автоматики.' : kind === 'sorting' ? 'Сбросятся: текущий заход и переработка, кроме сохранённого разрядами.' : 'Сбросится текущий заход. Стартовые бонусы дерева учтены ниже.',
    `После сброса: ${format(after.trash)} кг · ${Object.values(after.owned).reduce((a, b) => a + b, 0)} производителей · ${after.upgrades.length} улучшений.`,
    `Переработка: ${format(after.recycle.points)} ВС · ${after.recycle.nodes.length} узлов дерева.`,
    kind === 'city' ? 'Сохранятся: город, достижения, уникальные находки и журнал. Линию и рецепты нужно развивать заново.'
      : 'Сохранятся: сортировка, город, достижения, находки и журнал.',
  ];
}

export class ResetPreview {
  readonly root = el('div', 'reset-preview');
  private previous = '';
  render(state: GameState, kind: Kind): void {
    const lines = resetPreview(state, kind);
    const key = lines.join('\n');
    if (key === this.previous) return;
    this.previous = key;
    this.root.replaceChildren(...lines.map((line, i) => el('div', i === 0 ? 'reset-gain' : '', line)));
  }
}
