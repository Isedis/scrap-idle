import { deserialize, serialize } from '../game/save';
import { recycle, resort, reform, canRecycle, canResort, canReform, scriptOwned, type GameState } from '../game/state';
import { format } from '../game/num';
import { SCRIPTS } from '../game/scripts';
import { nodeById } from '../game/layers';
import { el } from './dom';

type Kind = 'recycle' | 'sorting' | 'city';
/** Preview the real reset on a detached save; never mutate the live game. */
export function resetPreview(state: GameState, kind: Kind): string[] {
  const ready = { recycle: canRecycle, sorting: canResort, city: canReform }[kind];
  // Keep the compact summary; consequences are only available for a real reset.
  if (!ready(state)) return ['Получите: —', 'Старт: —'];
  const after = deserialize(serialize(state))!;
  const gain = { recycle, sorting: resort, city: reform }[kind](after);
  const keptScripts = SCRIPTS.filter((def) => scriptOwned(state, def.id) && scriptOwned(after, def.id));
  const lostScripts = SCRIPTS.filter((def) => scriptOwned(state, def.id) && !scriptOwned(after, def.id));
  const loss = {
    recycle: 'Сбросится: мусор и треки захода. Производители и улучшения начнут с бонусов дерева.',
    sorting: 'Сбросится: текущий заход и вторсырьё. Разряды могут вернуть часть вторсырья и бесконечных узлов.',
    city: 'Сбросится: производство, переработка и сортировка. Город задаст стартовые бонусы.',
  }[kind];
  const deeper = [state.city.open ? 'город' : '', state.bottom.open ? 'дно' : ''].filter(Boolean);
  const keep = {
    recycle: `Останутся: ${['вторсырьё', 'дерево', ...(state.sorting.open ? ['сортировка'] : []), ...deeper, 'достижения', 'история'].join(', ')}.`,
    sorting: `Останутся: ${['линия', 'фракции', 'рецепты', 'находки', ...deeper, 'достижения', 'история'].join(', ')}.`,
    city: `Останутся: ${[...deeper, 'находки', 'достижения', 'история'].join(', ')}. Архив города может сохранить часть фракций.`,
  }[kind];
  return [
    `Получите: +${format(gain)} ${kind === 'city' ? 'га' : kind === 'sorting' ? 'фракций · доход ×2' : 'вторсырья'}`,
    `Старт: ${format(after.trash)} кг · ${Object.values(after.owned).reduce((a, b) => a + b, 0)} произв. · ${after.upgrades.length} улучш. · ${format(after.recycle.points)} ВС`,
    loss,
    keep,
    `Дерево после сброса: ${after.recycle.nodes.map((id) => nodeById(id)!.name).join(', ') || 'без купленных узлов'}.`,
    ...(keptScripts.length ? [`Скрипты останутся: ${keptScripts.map((def) => def.title).join(', ')}.`] : []),
    ...(lostScripts.length ? [`Скрипты потеряются: ${lostScripts.map((def) => def.title).join(', ')}.`] : []),
  ];
}

export class ResetPreview {
  readonly root = el('div', 'reset-preview');
  private readonly gain = el('div', 'reset-gain');
  private readonly start = el('div');
  private readonly details = el('details', 'reset-details');
  private readonly body = el('div');
  private previousDetails = '';

  constructor() {
    this.details.append(el('summary', '', 'Что сбросится и сохранится'), this.body);
    this.root.append(this.gain, this.start, this.details);
  }

  render(state: GameState, kind: Kind): void {
    const lines = resetPreview(state, kind);
    if (this.gain.textContent !== lines[0]) this.gain.textContent = lines[0];
    if (this.start.textContent !== lines[1]) this.start.textContent = lines[1];
    this.details.hidden = lines.length <= 2;
    const key = lines.slice(2).join('\n');
    if (key === this.previousDetails) return;
    this.previousDetails = key;
    this.body.replaceChildren(...lines.slice(2).map((line) => el('div', '', line)));
  }
}
