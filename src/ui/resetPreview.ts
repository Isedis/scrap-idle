import { deserialize, serialize } from '../game/save';
import { recycle, resort, reform, canRecycle, canResort, canReform, type GameState } from '../game/state';
import { format } from '../game/num';
import { el } from './dom';

type Kind = 'recycle' | 'sorting' | 'city';
/** Preview the real reset on a detached save; never mutate the live game. */
export function resetPreview(state: GameState, kind: Kind): string[] {
  const ready = { recycle: canRecycle, sorting: canResort, city: canReform }[kind];
  // Two lines either way, so the box keeps its height when the reset comes and goes.
  if (!ready(state)) return ['Получите: —', 'Старт: —'];
  const after = deserialize(serialize(state))!;
  const gain = { recycle, sorting: resort, city: reform }[kind](after);
  // Two lines: what comes, and where the next run starts; what burns is said by the panel itself.
  return [
    `Получите: +${format(gain)} ${kind === 'city' ? 'га' : kind === 'sorting' ? 'фракций · доход ×2' : 'вторсырья'}`,
    `Старт: ${format(after.trash)} кг · ${Object.values(after.owned).reduce((a, b) => a + b, 0)} произв. · ${after.upgrades.length} улучш. · ${format(after.recycle.points)} ВС`,
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
